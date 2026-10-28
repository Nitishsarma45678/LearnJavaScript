// Async circuit breaker with closed, open, and half-open states.
// The clock is injectable so tests are deterministic and need no real timers.
// Run: node daily/2026-10-28/async-circuit-breaker.js

"use strict";

const assert = require("node:assert/strict");

class CircuitOpenError extends Error {
  constructor(retryAfterMs) {
    super("circuit is open");
    this.name = "CircuitOpenError";
    this.retryAfterMs = Math.max(0, retryAfterMs);
  }
}

function createCircuitBreaker({
  failureThreshold = 3,
  resetTimeoutMs = 1_000,
  now = () => Date.now()
} = {}) {
  if (!Number.isInteger(failureThreshold) || failureThreshold < 1) {
    throw new RangeError("failureThreshold must be a positive integer");
  }
  if (!Number.isFinite(resetTimeoutMs) || resetTimeoutMs < 0) {
    throw new RangeError("resetTimeoutMs must be non-negative");
  }

  let state = "closed";
  let consecutiveFailures = 0;
  let openedAt = 0;
  let probeInFlight = false;

  function openCircuit() {
    state = "open";
    openedAt = now();
    probeInFlight = false;
  }

  async function execute(operation) {
    if (typeof operation !== "function") throw new TypeError("operation must be a function");

    if (state === "open") {
      const elapsed = now() - openedAt;
      if (elapsed < resetTimeoutMs) {
        throw new CircuitOpenError(resetTimeoutMs - elapsed);
      }
      state = "half-open";
    }

    if (state === "half-open") {
      if (probeInFlight) throw new CircuitOpenError(resetTimeoutMs);
      probeInFlight = true;
    }

    const startedAsProbe = state === "half-open";
    try {
      const result = await operation();
      if (startedAsProbe) {
        state = "closed";
        consecutiveFailures = 0;
        probeInFlight = false;
      } else {
        consecutiveFailures = 0;
      }
      return result;
    } catch (error) {
      if (startedAsProbe) {
        openCircuit();
      } else {
        consecutiveFailures += 1;
        if (consecutiveFailures >= failureThreshold) openCircuit();
      }
      throw error;
    }
  }

  return Object.freeze({
    execute,
    getState: () => state,
    getFailureCount: () => consecutiveFailures
  });
}

(async () => {
  let clock = 100;
  const breaker = createCircuitBreaker({
    failureThreshold: 2,
    resetTimeoutMs: 50,
    now: () => clock
  });

  await assert.rejects(breaker.execute(async () => { throw new Error("down"); }), /down/);
  assert.equal(breaker.getState(), "closed");
  await assert.rejects(breaker.execute(async () => { throw new Error("still down"); }), /still down/);
  assert.equal(breaker.getState(), "open");
  await assert.rejects(breaker.execute(async () => "blocked"), CircuitOpenError);

  clock += 50;
  assert.equal(await breaker.execute(async () => "recovered"), "recovered");
  assert.equal(breaker.getState(), "closed");
  assert.equal(breaker.getFailureCount(), 0);
  console.log("async-circuit-breaker: all tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

module.exports = { createCircuitBreaker, CircuitOpenError };
