"use strict";

const assert = require("node:assert/strict");

class CircuitOpenError extends Error {
  constructor(retryAt, state) {
    super(state === "half-open" ? "circuit breaker is limiting half-open probes" : "circuit breaker is open");
    this.name = "CircuitOpenError";
    this.retryAt = retryAt;
    this.state = state;
  }
}

/**
 * Circuit breaker with a rolling failure window and bounded half-open probes.
 *
 * The clock is injectable so tests can advance time without sleeping. The
 * operation receives { signal }; caller cancellation is not counted as a
 * service failure. A failed half-open probe reopens the circuit immediately.
 */
class CircuitBreaker {
  constructor({
    failureThreshold = 3,
    rollingWindowMs = 10000,
    resetTimeoutMs = 5000,
    halfOpenMaxCalls = 1,
    now = () => Date.now()
  } = {}) {
    for (const [name, value] of Object.entries({
      failureThreshold, rollingWindowMs, resetTimeoutMs, halfOpenMaxCalls
    })) {
      if (!Number.isInteger(value) || value < 1) {
        throw new RangeError(name + " must be a positive integer");
      }
    }
    if (typeof now !== "function") throw new TypeError("now must be a function");
    this.failureThreshold = failureThreshold;
    this.rollingWindowMs = rollingWindowMs;
    this.resetTimeoutMs = resetTimeoutMs;
    this.halfOpenMaxCalls = halfOpenMaxCalls;
    this.now = now;
    this.state = "closed";
    this.openedAt = null;
    this.failures = [];
    this.halfOpenInFlight = 0;
    this.halfOpenSuccesses = 0;
  }

  getStatus() {
    this._pruneFailures();
    return Object.freeze({
      state: this.state,
      failuresInWindow: this.failures.length,
      halfOpenInFlight: this.halfOpenInFlight,
      halfOpenSuccesses: this.halfOpenSuccesses,
      retryAt: this.state === "open" ? this.openedAt + this.resetTimeoutMs : null
    });
  }

  async execute(operation, { signal } = {}) {
    if (typeof operation !== "function") throw new TypeError("operation must be a function");
    if (signal && signal.aborted) throw this._abortReason(signal);

    const currentTime = this.now();
    if (this.state === "open") {
      const retryAt = this.openedAt + this.resetTimeoutMs;
      if (currentTime < retryAt) throw new CircuitOpenError(retryAt, "open");
      this.state = "half-open";
      this.halfOpenInFlight = 0;
      this.halfOpenSuccesses = 0;
    }

    const isProbe = this.state === "half-open";
    if (isProbe) {
      if (this.halfOpenInFlight >= this.halfOpenMaxCalls) {
        throw new CircuitOpenError(currentTime, "half-open");
      }
      this.halfOpenInFlight++;
    }

    try {
      const value = await operation({ signal });
      if (isProbe && this.state === "half-open") {
        this.halfOpenInFlight--;
        this.halfOpenSuccesses++;
        if (this.halfOpenSuccesses >= this.halfOpenMaxCalls &&
            this.halfOpenInFlight === 0) {
          this.state = "closed";
          this.openedAt = null;
          this.failures = [];
          this.halfOpenSuccesses = 0;
        }
      }
      return value;
    } catch (error) {
      const wasCancelled = signal && signal.aborted;
      if (isProbe && this.state === "half-open") {
        this.halfOpenInFlight--;
        if (!wasCancelled) this._open(this.now());
      } else if (!isProbe && this.state === "closed" && !wasCancelled) {
        this._recordFailure(this.now());
      }
      throw wasCancelled ? this._abortReason(signal) : error;
    }
  }

  _recordFailure(timestamp) {
    this._pruneFailures(timestamp);
    this.failures.push(timestamp);
    if (this.failures.length >= this.failureThreshold) this._open(timestamp);
  }

  _pruneFailures(timestamp = this.now()) {
    const cutoff = timestamp - this.rollingWindowMs;
    while (this.failures.length && this.failures[0] <= cutoff) this.failures.shift();
  }

  _open(timestamp) {
    this.state = "open";
    this.openedAt = timestamp;
    this.halfOpenInFlight = 0;
    this.halfOpenSuccesses = 0;
  }

  _abortReason(signal) {
    return signal.reason instanceof Error
      ? signal.reason
      : Object.assign(new Error("operation aborted"), { name: "AbortError" });
  }
}

async function runTests() {
  let clock = 100;
  const breaker = new CircuitBreaker({
    failureThreshold: 2,
    rollingWindowMs: 500,
    resetTimeoutMs: 1000,
    halfOpenMaxCalls: 1,
    now: () => clock
  });

  await assert.rejects(breaker.execute(async () => { throw new Error("down-1"); }), /down-1/);
  await assert.rejects(breaker.execute(async () => { throw new Error("down-2"); }), /down-2/);
  assert.equal(breaker.getStatus().state, "open");
  let invoked = false;
  await assert.rejects(
    breaker.execute(async () => { invoked = true; }),
    error => error instanceof CircuitOpenError && error.retryAt === 1100
  );
  assert.equal(invoked, false);

  clock = 1100;
  assert.equal(await breaker.execute(async () => "recovered"), "recovered");
  assert.equal(breaker.getStatus().state, "closed");
  assert.equal(breaker.getStatus().failuresInWindow, 0);

  // A half-open probe reserves the only slot until it settles.
  await assert.rejects(breaker.execute(async () => { throw new Error("again-1"); }), /again-1/);
  await assert.rejects(breaker.execute(async () => { throw new Error("again-2"); }), /again-2/);
  clock = 2100;
  let releaseProbe;
  const probe = breaker.execute(() => new Promise(resolve => { releaseProbe = resolve; }));
  await Promise.resolve();
  assert.equal(breaker.getStatus().state, "half-open");
  await assert.rejects(
    breaker.execute(async () => "should-not-run"),
    error => error instanceof CircuitOpenError && error.state === "half-open"
  );
  releaseProbe("probe-ok");
  assert.equal(await probe, "probe-ok");
  assert.equal(breaker.getStatus().state, "closed");

  // Old failures expire instead of accumulating forever.
  const rolling = new CircuitBreaker({
    failureThreshold: 2, rollingWindowMs: 100, resetTimeoutMs: 50, now: () => clock
  });
  await assert.rejects(rolling.execute(async () => { throw new Error("old"); }));
  clock += 101;
  await assert.rejects(rolling.execute(async () => { throw new Error("new"); }));
  assert.equal(rolling.getStatus().state, "closed");
  assert.equal(rolling.getStatus().failuresInWindow, 1);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    rolling.execute(async () => "never", { signal: controller.signal }),
    error => error.name === "AbortError"
  );
  console.log("Async circuit breaker tests passed.");
}

if (require.main === module) runTests().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

module.exports = { CircuitBreaker, CircuitOpenError };
