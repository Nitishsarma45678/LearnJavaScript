'use strict';

function makeAbortError(reason) {
  if (reason instanceof Error) return reason;
  const error = new Error(reason == null ? 'The operation was aborted' : String(reason));
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal) {
  if (signal && signal.aborted) throw makeAbortError(signal.reason);
}

function abortableSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    try {
      throwIfAborted(signal);
    } catch (error) {
      reject(error);
      return;
    }

    let settled = false;
    const cleanup = () => signal && signal.removeEventListener('abort', onAbort);
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      reject(makeAbortError(signal.reason));
    };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Retry an async operation with exponential backoff and an explicit total
 * sleep budget. The task receives (attemptNumber, signal). The caller's signal
 * cancels retries and abortable waits; in-flight tasks should also honor it.
 */
async function retryWithBudget(task, options = {}) {
  if (typeof task !== 'function') throw new TypeError('task must be a function');
  const {
    maxAttempts = 4,
    baseDelayMs = 100,
    maxDelayMs = 5000,
    maxTotalDelayMs = 10000,
    jitter = 0.2,
    shouldRetry = () => true,
    signal,
    sleep = abortableSleep,
    random = Math.random
  } = options;

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new RangeError('maxAttempts must be >= 1');
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new RangeError('baseDelayMs must be a finite non-negative number');
  }
  if (!Number.isFinite(maxDelayMs) || maxDelayMs < 0) {
    throw new RangeError('maxDelayMs must be a finite non-negative number');
  }
  if (!(Number.isFinite(maxTotalDelayMs) || maxTotalDelayMs === Infinity) || maxTotalDelayMs < 0) {
    throw new RangeError('maxTotalDelayMs must be a non-negative number or Infinity');
  }
  if (typeof shouldRetry !== 'function' || typeof sleep !== 'function' || typeof random !== 'function') {
    throw new TypeError('shouldRetry, sleep, and random must be functions');
  }
  if (typeof jitter !== 'number' || jitter < 0 || jitter > 1) throw new RangeError('jitter must be in [0, 1]');

  let totalDelayMs = 0;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    throwIfAborted(signal);
    try {
      return await task(attempt, signal);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !shouldRetry(error, attempt)) throw error;

      const exponential = baseDelayMs * (2 ** Math.min(attempt - 1, 52));
      const capped = Math.min(maxDelayMs, exponential);
      const randomValue = random();
      if (typeof randomValue !== 'number' || randomValue < 0 || randomValue >= 1) {
        throw new RangeError('random() must return a number in [0, 1)');
      }
      const delay = capped * (1 - jitter + 2 * jitter * randomValue);
      if (totalDelayMs + delay > maxTotalDelayMs) throw lastError;
      throwIfAborted(signal);
      if (delay > 0) await sleep(delay, signal);
      totalDelayMs += delay;
    }
  }
  throw lastError;
}

// Example tests use an injected sleep and random source, so they are fast and deterministic.
const assert = require('node:assert/strict');
(async () => {
  const waits = [];
  let calls = 0;
  const value = await retryWithBudget(async attempt => {
    calls += 1;
    if (attempt < 3) throw new Error(\`temporary-\${attempt}\`);
    return 'ready';
  }, {
    maxAttempts: 4,
    baseDelayMs: 10,
    maxDelayMs: 100,
    maxTotalDelayMs: 100,
    jitter: 0,
    random: () => 0.5,
    sleep: async ms => waits.push(ms)
  });
  assert.equal(value, 'ready');
  assert.equal(calls, 3);
  assert.deepEqual(waits, [10, 20]);

  let nonRetryCalls = 0;
  await assert.rejects(retryWithBudget(async () => {
    nonRetryCalls += 1;
    throw Object.assign(new Error('bad input'), { permanent: true });
  }, {
    shouldRetry: error => !error.permanent,
    sleep: async () => { throw new Error('should not sleep'); }
  }), /bad input/);
  assert.equal(nonRetryCalls, 1);

  const budgetWaits = [];
  let budgetCalls = 0;
  await assert.rejects(retryWithBudget(async () => {
    budgetCalls += 1;
    throw new Error(\`failure-\${budgetCalls}\`);
  }, {
    maxAttempts: 5,
    baseDelayMs: 10,
    maxDelayMs: 100,
    maxTotalDelayMs: 15,
    jitter: 0,
    random: () => 0.5,
    sleep: async ms => budgetWaits.push(ms)
  }), /failure-2/);
  assert.equal(budgetCalls, 2);
  assert.deepEqual(budgetWaits, [10]);

  const controller = new AbortController();
  controller.abort('cancelled before start');
  let abortedTaskCalls = 0;
  await assert.rejects(retryWithBudget(async () => {
    abortedTaskCalls += 1;
  }, { signal: controller.signal }), error => error.name === 'AbortError');
  assert.equal(abortedTaskCalls, 0);

  await assert.rejects(retryWithBudget(() => 1, { maxAttempts: 0 }), RangeError);
  await assert.rejects(retryWithBudget(() => 1, { baseDelayMs: Infinity }), RangeError);
  console.log('retry-with-budget: all tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
