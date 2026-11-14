/**
 * Deadline-Aware Retry Executor with a Shared Retry Budget
 * ---------------------------------------------------------
 * Retry asynchronous operations with exponential backoff, configurable jitter,
 * Retry-After support, an overall deadline, per-attempt timeouts, AbortSignal
 * propagation, and a token-bucket budget shared by multiple callers.
 *
 * A retry consumes one budget token. The initial attempt does not.
 *
 * Run: node deadline-aware-retry-budget.js
 */
'use strict';

const assert = require('node:assert/strict');

function asAbortError(reason) {
  if (reason instanceof Error) return reason;
  const error = new Error(
    reason === undefined ? 'The operation was aborted' : String(reason)
  );
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal) {
  if (signal && signal.aborted) throw asAbortError(signal.reason);
}

function abortableSleep(milliseconds, signal) {
  if (milliseconds <= 0) {
    throwIfAborted(signal);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    throwIfAborted(signal);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);

    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(asAbortError(signal.reason));
    };

    function cleanup() {
      if (signal) signal.removeEventListener('abort', onAbort);
    }

    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}

class RetryBudget {
  constructor({
    capacity = 10,
    refillPerSecond = 1,
    now = Date.now
  } = {}) {
    if (!Number.isFinite(capacity) || capacity <= 0) {
      throw new RangeError('capacity must be positive and finite');
    }
    if (!Number.isFinite(refillPerSecond) || refillPerSecond < 0) {
      throw new RangeError('refillPerSecond must be finite and non-negative');
    }
    if (typeof now !== 'function') throw new TypeError('now must be a function');

    this.capacity = capacity;
    this.refillPerSecond = refillPerSecond;
    this.now = now;
    this.tokens = capacity;
    this.lastRefill = now();
  }

  _refill() {
    const current = this.now();
    const elapsed = Math.max(0, current - this.lastRefill);
    this.tokens = Math.min(
      this.capacity,
      this.tokens + elapsed * this.refillPerSecond / 1000
    );
    this.lastRefill = current;
  }

  tryConsume(amount = 1) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new RangeError('amount must be positive and finite');
    }
    this._refill();
    if (this.tokens + Number.EPSILON < amount) return false;
    this.tokens -= amount;
    return true;
  }

  snapshot() {
    this._refill();
    return { tokens: this.tokens, capacity: this.capacity };
  }
}

class RetryBudgetExhaustedError extends Error {
  constructor(cause) {
    super('Shared retry budget exhausted', { cause });
    this.name = 'RetryBudgetExhaustedError';
  }
}

class RetryDeadlineExceededError extends Error {
  constructor(cause) {
    super('Overall retry deadline exceeded', { cause });
    this.name = 'RetryDeadlineExceededError';
  }
}

function retryAfterMilliseconds(error, now) {
  let value = error && error.retryAfterMs;
  if (value == null && error) value = error.retryAfter;
  if (value == null && error && error.response &&
      error.response.headers && typeof error.response.headers.get === 'function') {
    value = error.response.headers.get('retry-after');
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value);
  }
  if (typeof value !== 'string' || value.trim() === '') return 0;

  const trimmed = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return Math.max(0, Number(trimmed) * 1000);
  }
  const date = Date.parse(trimmed);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}

function calculateBackoff(attempt, baseDelayMs, maxDelayMs, jitter, random) {
  const exponent = Math.min(attempt - 1, 52);
  const ceiling = Math.min(maxDelayMs, baseDelayMs * (2 ** exponent));
  const sample = Math.min(1, Math.max(0, random()));

  if (jitter === 'full') return sample * ceiling;
  if (jitter === 'equal') return ceiling / 2 + sample * ceiling / 2;
  return ceiling;
}

async function runAttempt(operation, attempt, parentSignal, timeoutMs) {
  throwIfAborted(parentSignal);
  const controller = new AbortController();
  const onParentAbort = () => controller.abort(parentSignal.reason);

  if (parentSignal) {
    parentSignal.addEventListener('abort', onParentAbort, { once: true });
    if (parentSignal.aborted) onParentAbort();
  }

  let timer;
  let timeoutPromise;
  if (Number.isFinite(timeoutMs)) {
    timeoutPromise = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        const error = new Error('Attempt timed out after ' + timeoutMs + 'ms');
        error.name = 'TimeoutError';
        controller.abort(error);
        reject(error);
      }, Math.max(0, timeoutMs));
    });
  }

  const work = Promise.resolve().then(() =>
    operation({ attempt, signal: controller.signal })
  );

  try {
    return timeoutPromise ? await Promise.race([work, timeoutPromise]) : await work;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (parentSignal) parentSignal.removeEventListener('abort', onParentAbort);
  }
}

async function retry(operation, options = {}) {
  if (typeof operation !== 'function') throw new TypeError('operation must be a function');

  const {
    maxAttempts = 4,
    baseDelayMs = 100,
    maxDelayMs = 30000,
    maxElapsedMs = Infinity,
    timeoutMs = Infinity,
    jitter = 'full',
    random = Math.random,
    now = Date.now,
    sleep = abortableSleep,
    shouldRetry = () => true,
    onRetry,
    signal,
    budget
  } = options;

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError('maxAttempts must be a positive integer');
  }
  for (const [name, value] of Object.entries({
    baseDelayMs, maxDelayMs, timeoutMs
  })) {
    if (value !== Infinity && (!Number.isFinite(value) || value < 0)) {
      throw new RangeError(name + ' must be non-negative');
    }
  }
  if (maxDelayMs < baseDelayMs) {
    throw new RangeError('maxDelayMs must be at least baseDelayMs');
  }
  if (maxElapsedMs !== Infinity &&
      (!Number.isFinite(maxElapsedMs) || maxElapsedMs < 0)) {
    throw new RangeError('maxElapsedMs must be non-negative');
  }
  if (!['none', 'full', 'equal'].includes(jitter)) {
    throw new RangeError('jitter must be none, full, or equal');
  }
  if (typeof random !== 'function' || typeof now !== 'function' ||
      typeof sleep !== 'function' || typeof shouldRetry !== 'function') {
    throw new TypeError('random, now, sleep, and shouldRetry must be functions');
  }

  const startedAt = now();
  const deadline = maxElapsedMs === Infinity
    ? Infinity
    : startedAt + maxElapsedMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    throwIfAborted(signal);
    const remaining = deadline - now();
    if (remaining <= 0) throw new RetryDeadlineExceededError();

    const deadlineLimitsAttempt = remaining < timeoutMs;
    const attemptTimeout = Math.min(timeoutMs, remaining);

    try {
      const result = await runAttempt(
        operation,
        attempt,
        signal,
        attemptTimeout
      );
      if (now() > deadline) throw new RetryDeadlineExceededError();
      return result;
    } catch (error) {
      if (signal && signal.aborted) throw asAbortError(signal.reason);
      if (error instanceof RetryDeadlineExceededError) throw error;
      if (deadlineLimitsAttempt && error && error.name === 'TimeoutError') {
        throw new RetryDeadlineExceededError(error);
      }
      if (now() >= deadline) throw new RetryDeadlineExceededError(error);
      if (attempt >= maxAttempts || !shouldRetry(error, { attempt })) {
        throw error;
      }

      if (budget && !budget.tryConsume()) {
        throw new RetryBudgetExhaustedError(error);
      }

      const backoff = calculateBackoff(
        attempt, baseDelayMs, maxDelayMs, jitter, random
      );
      const delayMs = Math.max(backoff, retryAfterMilliseconds(error, now));
      if (now() + delayMs >= deadline) {
        throw new RetryDeadlineExceededError(error);
      }

      if (onRetry) {
        await onRetry({
          error,
          attempt,
          nextAttempt: attempt + 1,
          delayMs
        });
      }
      await sleep(delayMs, signal);
    }
  }

  throw new Error('Unreachable retry state');
}

// ---------------------------------------------------------------------------
// Examples and tests
// ---------------------------------------------------------------------------

async function runTests() {
  let clock = 0;
  const delays = [];
  let calls = 0;
  const result = await retry(async () => {
    calls += 1;
    if (calls < 3) throw new Error('temporary');
    return 'ready';
  }, {
    maxAttempts: 4,
    baseDelayMs: 10,
    maxDelayMs: 50,
    jitter: 'none',
    now: () => clock,
    sleep: async (ms) => {
      delays.push(ms);
      clock += ms;
    }
  });
  assert.equal(result, 'ready');
  assert.equal(calls, 3);
  assert.deepEqual(delays, [10, 20]);

  clock = 0;
  const retryAfterResult = await retry(async () => {
    const error = new Error('busy');
    error.retryAfterMs = 25;
    throw error;
  }, {
    maxAttempts: 2,
    baseDelayMs: 5,
    maxDelayMs: 10,
    jitter: 'none',
    now: () => clock,
    sleep: async (ms) => { delays.push(ms); clock += ms; }
  }).catch((error) => error);
  assert.equal(retryAfterResult.message, 'busy');
  assert.equal(clock, 0, 'a Retry-After delay that exceeds maxAttempts is not slept');

  clock = 0;
  const budget = new RetryBudget({
    capacity: 1,
    refillPerSecond: 0,
    now: () => clock
  });
  let budgetCalls = 0;
  await assert.rejects(
    retry(async () => {
      budgetCalls += 1;
      throw new Error('still failing');
    }, {
      maxAttempts: 5,
      baseDelayMs: 1,
      maxDelayMs: 4,
      jitter: 'none',
      budget,
      now: () => clock,
      sleep: async (ms) => { clock += ms; }
    }),
    RetryBudgetExhaustedError
  );
  assert.equal(budgetCalls, 2);
  assert.equal(budget.snapshot().tokens, 0);

  clock = 0;
  const refill = new RetryBudget({
    capacity: 2,
    refillPerSecond: 2,
    now: () => clock
  });
  assert.equal(refill.tryConsume(2), true);
  clock = 500;
  assert.equal(refill.snapshot().tokens, 1);

  const alreadyAborted = new AbortController();
  alreadyAborted.abort(new Error('cancelled by caller'));
  let invoked = false;
  await assert.rejects(
    retry(async () => { invoked = true; }, { signal: alreadyAborted.signal }),
    /cancelled by caller/
  );
  assert.equal(invoked, false);

  await assert.rejects(
    retry(
      () => new Promise((resolve) => setTimeout(resolve, 30)),
      { maxAttempts: 1, timeoutMs: 5 }
    ),
    (error) => error.name === 'TimeoutError'
  );

  await assert.rejects(
    retry(async () => { throw new Error('permanent'); }, {
      maxAttempts: 4,
      shouldRetry: () => false
    }),
    /permanent/
  );

  console.log('Deadline-aware retry tests passed.');
}

runTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
