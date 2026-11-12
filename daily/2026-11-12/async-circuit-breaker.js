/**
 * Asynchronous circuit breaker.
 *
 * Exercise:
 * Wrap an unreliable asynchronous dependency with CLOSED, OPEN and
 * HALF_OPEN states. Consecutive failures open the circuit; after a cooldown,
 * exactly one probe is admitted. A successful probe closes the circuit and a
 * failed probe starts a fresh cooldown.
 *
 * The clock is injected so tests do not sleep or depend on wall-clock time.
 * This implementation intentionally uses a single half-open probe at a time.
 *
 * Run: node async-circuit-breaker.js
 */

class CircuitOpenError extends Error {
  constructor(state, retryAfterMs) {
    super(state === "open"
      ? `circuit is open; retry in ${retryAfterMs}ms`
      : "circuit is half-open; a probe is already running");
    this.name = "CircuitOpenError";
    this.state = state;
    this.retryAfterMs = retryAfterMs;
  }
}

class CircuitBreaker {
  constructor({
    failureThreshold = 3,
    resetTimeoutMs = 10_000,
    clock = () => Date.now()
  } = {}) {
    if (!Number.isInteger(failureThreshold) || failureThreshold < 1) {
      throw new RangeError("failureThreshold must be a positive integer");
    }
    if (!Number.isFinite(resetTimeoutMs) || resetTimeoutMs < 0) {
      throw new RangeError("resetTimeoutMs must be a non-negative finite number");
    }
    if (typeof clock !== "function") throw new TypeError("clock must be a function");
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
    this.clock = clock;
    this.state = "closed";
    this.consecutiveFailures = 0;
    this.openedAt = null;
    this.probeInFlight = false;
  }

  _open(now) {
    this.state = "open";
    this.openedAt = now;
    this.probeInFlight = false;
  }

  _close() {
    this.state = "closed";
    this.consecutiveFailures = 0;
    this.openedAt = null;
    this.probeInFlight = false;
  }

  _refreshState() {
    if (this.state === "open" &&
        this.clock() - this.openedAt >= this.resetTimeoutMs) {
      this.state = "half-open";
      this.probeInFlight = false;
    }
  }

  async execute(operation) {
    if (typeof operation !== "function") {
      throw new TypeError("operation must be a function");
    }

    this._refreshState();
    if (this.state === "open") {
      const elapsed = Math.max(0, this.clock() - this.openedAt);
      throw new CircuitOpenError("open", Math.max(0, this.resetTimeoutMs - elapsed));
    }

    const isProbe = this.state === "half-open";
    if (isProbe) {
      if (this.probeInFlight) throw new CircuitOpenError("half-open", 0);
      this.probeInFlight = true;
    }

    try {
      const result = await operation();
      if (isProbe) {
        if (this.state === "half-open") this._close();
      } else if (this.state === "closed") {
        // A successful request breaks a consecutive-failure sequence.
        this.consecutiveFailures = 0;
      }
      return result;
    } catch (error) {
      if (isProbe) {
        this._open(this.clock());
      } else if (this.state === "closed") {
        this.consecutiveFailures++;
        if (this.consecutiveFailures >= this.failureThreshold) {
          this._open(this.clock());
        }
      }
      throw error;
    } finally {
      if (isProbe && this.state === "half-open") {
        this.probeInFlight = false;
      }
    }
  }

  snapshot() {
    return Object.freeze({
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      openedAt: this.openedAt,
      probeInFlight: this.probeInFlight
    });
  }

  reset() {
    this._close();
  }
}

async function runTests() {
  const assert = require("node:assert/strict");
  let now = 1_000;
  const breaker = new CircuitBreaker({
    failureThreshold: 2,
    resetTimeoutMs: 100,
    clock: () => now
  });
  const failure = new Error("upstream unavailable");

  assert.equal(await breaker.execute(() => "healthy"), "healthy");
  await assert.rejects(breaker.execute(() => { throw failure; }), error => error === failure);
  assert.equal(breaker.snapshot().consecutiveFailures, 1);
  await assert.rejects(breaker.execute(() => Promise.reject(failure)), error => error === failure);
  assert.equal(breaker.snapshot().state, "open");
  await assert.rejects(
    breaker.execute(() => "must not run"),
    error => error instanceof CircuitOpenError && error.retryAfterMs === 100
  );

  now += 100;
  let releaseProbe;
  const probe = breaker.execute(() => new Promise(resolve => { releaseProbe = resolve; }));
  assert.equal(breaker.snapshot().state, "half-open");
  assert.equal(breaker.snapshot().probeInFlight, true);
  await assert.rejects(
    breaker.execute(() => "second probe"),
    error => error instanceof CircuitOpenError && error.state === "half-open"
  );
  releaseProbe("recovered");
  assert.equal(await probe, "recovered");
  assert.deepEqual(breaker.snapshot(), {
    state: "closed",
    consecutiveFailures: 0,
    openedAt: null,
    probeInFlight: false
  });

  await assert.rejects(breaker.execute(() => { throw failure; }), error => error === failure);
  await assert.rejects(breaker.execute(() => { throw failure; }), error => error === failure);
  now += 100;
  await assert.rejects(breaker.execute(() => { throw failure; }), error => error === failure);
  assert.equal(breaker.snapshot().state, "open", "failed probe must reopen the circuit");
  breaker.reset();
  assert.equal(breaker.snapshot().state, "closed");
  assert.throws(() => new CircuitBreaker({ failureThreshold: 0 }), /failureThreshold/);
  console.log("CircuitBreaker: all tests passed");
}

if (require.main === module) {
  runTests().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
module.exports = { CircuitBreaker, CircuitOpenError };
