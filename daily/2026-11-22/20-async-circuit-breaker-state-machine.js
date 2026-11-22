/**
 * Exercise: Implement an asynchronous circuit breaker.
 * CLOSED calls pass through until consecutive failures reach the threshold.
 * OPEN rejects immediately until the reset timeout elapses. HALF_OPEN permits
 * exactly one probe; success closes the breaker and failure reopens it.
 * Inject the clock so transitions can be tested without real timers.
 * Run: node 20-async-circuit-breaker-state-machine.js
 */
"use strict";
const assert = require("node:assert/strict");

class CircuitOpenError extends Error {
  constructor(state) {
    super("circuit breaker is " + state);
    this.name = "CircuitOpenError";
    this.state = state;
  }
}

class CircuitBreaker {
  constructor({ failureThreshold = 3, resetTimeoutMs = 1000, now = Date.now } = {}) {
    if (!Number.isInteger(failureThreshold) || failureThreshold < 1 ||
        !Number.isFinite(resetTimeoutMs) || resetTimeoutMs < 0) {
      throw new RangeError("invalid circuit breaker configuration");
    }
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
    this.now = now;
    this.state = "CLOSED";
    this.failures = 0;
    this.openedAt = null;
    this.probeInFlight = false;
  }
  snapshot() {
    return { state: this.state, failures: this.failures, openedAt: this.openedAt,
      probeInFlight: this.probeInFlight };
  }
  async execute(action) {
    if (typeof action !== "function") throw new TypeError("action must be a function");
    if (this.state === "OPEN") {
      if (this.now() - this.openedAt < this.resetTimeoutMs) throw new CircuitOpenError(this.state);
      this.state = "HALF_OPEN";
      this.probeInFlight = false;
    }
    const isProbe = this.state === "HALF_OPEN";
    if (isProbe) {
      if (this.probeInFlight) throw new CircuitOpenError(this.state);
      this.probeInFlight = true;
    }
    try {
      const result = await action();
      if (isProbe) {
        this.state = "CLOSED";
        this.failures = 0;
        this.openedAt = null;
        this.probeInFlight = false;
      } else if (this.state === "CLOSED") {
        this.failures = 0;
      }
      return result;
    } catch (error) {
      if (isProbe) {
        this.state = "OPEN";
        this.openedAt = this.now();
        this.probeInFlight = false;
        this.failures = this.failureThreshold;
      } else if (this.state === "CLOSED") {
        this.failures++;
        if (this.failures >= this.failureThreshold) {
          this.state = "OPEN";
          this.openedAt = this.now();
        }
      }
      throw error;
    }
  }
}

(async () => {
  let clock = 100, attempts = 0;
  const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 50, now: () => clock });
  const failing = async () => { attempts++; throw new Error("service unavailable"); };
  await assert.rejects(breaker.execute(failing), /service unavailable/);
  await assert.rejects(breaker.execute(failing), /service unavailable/);
  assert.equal(breaker.snapshot().state, "OPEN");
  await assert.rejects(breaker.execute(async () => "blocked"), CircuitOpenError);
  assert.equal(attempts, 2);

  clock += 51;
  assert.equal(await breaker.execute(async () => "recovered"), "recovered");
  assert.equal(breaker.snapshot().state, "CLOSED");
  assert.equal(breaker.snapshot().failures, 0);
  console.log("async circuit breaker tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });

module.exports = { CircuitBreaker, CircuitOpenError };
