"use strict";
// Poll an async probe until a predicate succeeds, with exponential backoff,
// a total deadline, and AbortSignal support. A timed-out probe may continue if
// the underlying operation itself cannot be cancelled, but its result is ignored.
const assert = require("node:assert/strict");

class PollTimeoutError extends Error {
  constructor() {
    super("Polling timed out");
    this.name = "PollTimeoutError";
  }
}
function makeAbortError() {
  const error = new Error("Polling was aborted");
  error.name = "AbortError";
  return error;
}

function waitWithControls(operation, signal, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => finish(reject, new PollTimeoutError()), timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
    }
    function finish(callback, value) {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    }
    function onAbort() { finish(reject, makeAbortError()); }

    if (signal && signal.aborted) {
      finish(reject, makeAbortError());
      return;
    }
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(operation).then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error)
    );
  });
}

async function pollUntil(probe, options = {}) {
  if (typeof probe !== "function") throw new TypeError("probe must be a function");
  const {
    isDone = Boolean,
    intervalMs = 100,
    backoff = 1.5,
    maxIntervalMs = 2000,
    timeoutMs = 10000,
    signal
  } = options;
  if (typeof isDone !== "function") throw new TypeError("isDone must be a function");
  if (![intervalMs, maxIntervalMs, timeoutMs].every(Number.isFinite) ||
      intervalMs < 0 || maxIntervalMs < 0 || timeoutMs <= 0) {
    throw new RangeError("intervals must be non-negative and timeoutMs must be positive");
  }
  if (!Number.isFinite(backoff) || backoff < 1) {
    throw new RangeError("backoff must be a finite number greater than or equal to 1");
  }

  const deadline = Date.now() + timeoutMs;
  let delayMs = intervalMs;
  while (true) {
    if (signal && signal.aborted) throw makeAbortError();
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new PollTimeoutError();

    const value = await waitWithControls(
      Promise.resolve().then(probe),
      signal,
      remaining
    );
    if (isDone(value)) return value;

    const sleepFor = Math.min(delayMs, deadline - Date.now());
    if (sleepFor <= 0) throw new PollTimeoutError();
    await waitWithControls(new Promise((resolve) => setTimeout(resolve, sleepFor)), signal, sleepFor + 1);
    delayMs = Math.min(maxIntervalMs, delayMs === 0 ? 0 : delayMs * backoff);
  }
}

// Example tests
async function runTests() {
  let attempts = 0;
  const value = await pollUntil(async () => ++attempts, {
    isDone: (n) => n === 3,
    intervalMs: 1,
    backoff: 2,
    maxIntervalMs: 4,
    timeoutMs: 200
  });
  assert.equal(value, 3);
  assert.equal(attempts, 3);

  await assert.rejects(
    pollUntil(() => new Promise(() => {}), { timeoutMs: 15 }),
    PollTimeoutError
  );

  const controller = new AbortController();
  const pending = pollUntil(() => new Promise(() => {}), {
    timeoutMs: 500,
    signal: controller.signal
  });
  setTimeout(() => controller.abort(), 5);
  await assert.rejects(pending, { name: "AbortError" });
  assert.throws(() => pollUntil(null), /probe must be a function/);
  console.log("Async polling tests passed");
}
runTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
