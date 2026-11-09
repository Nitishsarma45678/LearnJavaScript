/**
 * Resilient Async Request Client
 * ------------------------------
 * Compose per-attempt timeouts, cancellation-aware exponential backoff with
 * jitter, retry classification, and a closed/open/half-open circuit breaker.
 * Inject sleep, clock, and randomness so policy tests are deterministic.
 *
 * Run: node resilient-request-client.js
 */

"use strict";

class TimeoutError extends Error {
  constructor(timeoutMs) {
    super("Request attempt timed out after " + timeoutMs + "ms");
    this.name = "TimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

class CircuitOpenError extends Error {
  constructor(retryAt) {
    super("Circuit breaker is open");
    this.name = "CircuitOpenError";
    this.retryAt = retryAt;
  }
}

function abortReason(signal) {
  return signal && signal.reason !== undefined
    ? signal.reason
    : Object.assign(new Error("Operation aborted"), { name: "AbortError" });
}

class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30000;
    this.now = options.now || Date.now;
    if (!Number.isInteger(this.failureThreshold) || this.failureThreshold < 1) {
      throw new RangeError("failureThreshold must be a positive integer");
    }
    if (!Number.isFinite(this.resetTimeoutMs) || this.resetTimeoutMs < 0) {
      throw new RangeError("resetTimeoutMs must be non-negative");
    }
    if (typeof this.now !== "function") throw new TypeError("now must be a function");
    this.state = "closed";
    this.failures = 0;
    this.openedAt = 0;
    this.probeInFlight = false;
  }

  acquire() {
    if (this.state === "open") {
      const retryAt = this.openedAt + this.resetTimeoutMs;
      if (this.now() < retryAt) throw new CircuitOpenError(retryAt);
      this.state = "half-open";
      this.probeInFlight = false;
    }
    if (this.state === "half-open") {
      if (this.probeInFlight) throw new CircuitOpenError(this.now() + this.resetTimeoutMs);
      this.probeInFlight = true;
      return { halfOpen: true };
    }
    return { halfOpen: false };
  }

  success(permit) {
    if (permit.halfOpen) {
      if (this.state === "half-open") {
        this.probeInFlight = false;
        this.state = "closed";
        this.failures = 0;
      }
    } else if (this.state === "closed") {
      this.failures = 0;
    }
  }

  failure(permit) {
    if (permit.halfOpen) {
      if (this.state === "half-open") this.open();
      return;
    }
    if (this.state !== "closed") return;
    this.failures++;
    if (this.failures >= this.failureThreshold) this.open();
  }

  release(permit) {
    if (permit.halfOpen && this.state === "half-open") this.probeInFlight = false;
  }

  open() {
    this.state = "open";
    this.openedAt = this.now();
    this.failures = 0;
    this.probeInFlight = false;
  }

  snapshot() {
    return {
      state: this.state,
      failures: this.failures,
      openedAt: this.openedAt,
      probeInFlight: this.probeInFlight
    };
  }
}

function defaultSleep(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      reject(abortReason(signal));
      return;
    }
    const timer = setTimeout(done, milliseconds);
    let listener;
    function cleanup() {
      clearTimeout(timer);
      if (signal && listener) signal.removeEventListener("abort", listener);
    }
    function done() {
      cleanup();
      resolve();
    }
    if (signal) {
      listener = () => {
        cleanup();
        reject(abortReason(signal));
      };
      signal.addEventListener("abort", listener, { once: true });
    }
  });
}

function createResilientClient(options) {
  if (!options || typeof options.request !== "function") {
    throw new TypeError("A request function is required");
  }
  const request = options.request;
  const retries = options.retries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 100;
  const maxDelayMs = options.maxDelayMs ?? 5000;
  const timeoutMs = options.timeoutMs ?? 0;
  const random = options.random || Math.random;
  const sleep = options.sleep || defaultSleep;
  const shouldRetry = options.shouldRetry || (() => true);
  const breaker = options.breaker || new CircuitBreaker();

  if (!Number.isInteger(retries) || retries < 0) throw new RangeError("retries must be non-negative");
  for (const [name, value] of [["baseDelayMs", baseDelayMs], ["maxDelayMs", maxDelayMs], ["timeoutMs", timeoutMs]]) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(name + " must be non-negative");
  }
  if (typeof random !== "function" || typeof sleep !== "function" || typeof shouldRetry !== "function") {
    throw new TypeError("random, sleep, and shouldRetry must be functions");
  }

  async function runAttempt(input, attempt, externalSignal) {
    if (externalSignal && externalSignal.aborted) throw abortReason(externalSignal);
    const controller = new AbortController();
    let timeoutId;
    let abortListener;
    let rejectAbort;
    const abortPromise = new Promise((resolve, reject) => { rejectAbort = reject; });

    if (externalSignal) {
      abortListener = () => {
        const reason = abortReason(externalSignal);
        controller.abort(reason);
        rejectAbort(reason);
      };
      externalSignal.addEventListener("abort", abortListener, { once: true });
    }

    let timeoutPromise = new Promise(() => {});
    if (timeoutMs > 0) {
      timeoutPromise = new Promise((resolve, reject) => {
        timeoutId = setTimeout(() => {
          const error = new TimeoutError(timeoutMs);
          controller.abort(error);
          reject(error);
        }, timeoutMs);
      });
    }

    try {
      const requestPromise = Promise.resolve().then(() =>
        request(input, { signal: controller.signal, attempt })
      );
      return await Promise.race([requestPromise, abortPromise, timeoutPromise]);
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (externalSignal && abortListener) {
        externalSignal.removeEventListener("abort", abortListener);
      }
    }
  }

  async function execute(input, executionOptions = {}) {
    const signal = executionOptions.signal;
    const permit = breaker.acquire();
    try {
      let lastError;
      for (let attempt = 0; attempt <= retries; attempt++) {
        if (signal && signal.aborted) throw abortReason(signal);
        try {
          const value = await runAttempt(input, attempt, signal);
          breaker.success(permit);
          return value;
        } catch (error) {
          lastError = error;
          if (signal && signal.aborted) throw abortReason(signal);
          if (attempt === retries || !shouldRetry(error, attempt, input)) throw error;
          const ceiling = Math.min(maxDelayMs, baseDelayMs * (2 ** attempt));
          const sample = random();
          if (!Number.isFinite(sample) || sample < 0 || sample > 1) {
            throw new RangeError("random() must return a value between 0 and 1");
          }
          await sleep(ceiling * (0.5 + sample * 0.5), signal);
        }
      }
      throw lastError;
    } catch (error) {
      if (signal && signal.aborted) breaker.release(permit);
      else breaker.failure(permit);
      throw error;
    }
  }

  return { execute, breaker };
}

async function runTests() {
  let checks = 0;
  function equal(actual, expected, label) {
    checks++;
    if (!Object.is(actual, expected)) {
      throw new Error(label + ": expected " + String(expected) + ", received " + String(actual));
    }
  }
  async function rejects(promise, ErrorType, label) {
    checks++;
    let error;
    try { await promise; } catch (caught) { error = caught; }
    if (!(error instanceof ErrorType)) throw new Error(label + ": expected " + ErrorType.name);
  }

  let attempts = 0;
  const delays = [];
  const client = createResilientClient({
    request: async (input, context) => {
      attempts++;
      if (context.attempt < 2) throw new Error("temporary failure");
      return input * 2;
    },
    retries: 2,
    baseDelayMs: 10,
    maxDelayMs: 100,
    random: () => 1,
    sleep: async milliseconds => { delays.push(milliseconds); }
  });
  equal(await client.execute(21), 42, "retry eventually succeeds");
  equal(attempts, 3, "attempt count");
  equal(delays.join(","), "10,20", "exponential backoff schedule");
  equal(client.breaker.snapshot().state, "closed", "successful request keeps breaker closed");

  let noRetryCalls = 0;
  const noRetry = createResilientClient({
    request: async () => { noRetryCalls++; throw new Error("permanent"); },
    retries: 4,
    shouldRetry: () => false,
    sleep: async () => {}
  });
  await rejects(noRetry.execute("x"), Error, "non-retryable failure");
  equal(noRetryCalls, 1, "retry classifier stops retries");

  let clock = 1000;
  const breaker = new CircuitBreaker({
    failureThreshold: 1,
    resetTimeoutMs: 50,
    now: () => clock
  });
  const failing = createResilientClient({
    request: async () => { throw new Error("offline"); },
    retries: 0,
    breaker,
    sleep: async () => {}
  });
  await rejects(failing.execute("first"), Error, "first breaker failure");
  equal(breaker.snapshot().state, "open", "threshold opens breaker");
  await rejects(failing.execute("blocked"), CircuitOpenError, "open breaker rejects immediately");
  clock += 51;

  const recovering = createResilientClient({
    request: async () => "healthy",
    retries: 0,
    breaker,
    sleep: async () => {}
  });
  equal(await recovering.execute("probe"), "healthy", "half-open probe succeeds");
  equal(breaker.snapshot().state, "closed", "successful probe closes breaker");

  const abortController = new AbortController();
  const abortError = Object.assign(new Error("caller cancelled"), { name: "AbortError" });
  const cancellable = createResilientClient({
    request: (_input, context) => new Promise((resolve, reject) => {
      context.signal.addEventListener("abort", () => reject(context.signal.reason), { once: true });
    }),
    retries: 3,
    sleep: async () => {}
  });
  const pending = cancellable.execute("slow", { signal: abortController.signal });
  abortController.abort(abortError);
  await rejects(pending, Error, "external cancellation propagates");
  equal(cancellable.breaker.snapshot().state, "closed", "caller cancellation does not count as breaker failure");

  const alreadyAborted = new AbortController();
  alreadyAborted.abort(abortError);
  await rejects(cancellable.execute("never", { signal: alreadyAborted.signal }), Error, "pre-aborted signal");
  equal(new CircuitBreaker({ now: () => 0 }).snapshot().state, "closed", "initial breaker state");
  return { passed: checks };
}

if (typeof require !== "undefined" && require.main === module) {
  runTests().then(result => {
    console.log("Resilient request client: " + result.passed + " checks passed");
  }).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  TimeoutError,
  CircuitOpenError,
  CircuitBreaker,
  createResilientClient,
  defaultSleep,
  runTests
};
