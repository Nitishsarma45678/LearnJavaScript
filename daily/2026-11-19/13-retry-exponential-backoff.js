'use strict';

/**
 * Exercise: Retry an asynchronous operation with exponential backoff,
 * optional symmetric jitter, abort support, and a caller-defined retry policy.
 *
 * retries is the number of retries after the initial attempt. Inject sleep and
 * random to make timing deterministic in tests.
 */

function defaultSleep(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      reject(signal.reason || new Error('operation aborted'));
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);

    function onAbort() {
      clearTimeout(timer);
      cleanup();
      reject(signal.reason || new Error('operation aborted'));
    }

    function cleanup() {
      if (signal) signal.removeEventListener('abort', onAbort);
    }

    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function retry(fn, options = {}) {
  if (typeof fn !== 'function') throw new TypeError('fn must be a function');
  const {
    retries = 3,
    baseDelay = 100,
    maxDelay = 30000,
    factor = 2,
    jitter = 0,
    shouldRetry = () => true,
    sleep = defaultSleep,
    random = Math.random,
    signal
  } = options;

  if (!Number.isInteger(retries) || retries < 0) throw new RangeError('retries must be non-negative');
  if (!Number.isFinite(baseDelay) || baseDelay < 0 ||
      !Number.isFinite(maxDelay) || maxDelay < 0) throw new RangeError('delays must be non-negative');
  if (!Number.isFinite(factor) || factor < 1) throw new RangeError('factor must be at least 1');
  if (!Number.isFinite(jitter) || jitter < 0 || jitter > 1) throw new RangeError('jitter must be between 0 and 1');
  if (typeof shouldRetry !== 'function' || typeof sleep !== 'function' || typeof random !== 'function') {
    throw new TypeError('shouldRetry, sleep, and random must be functions');
  }

  for (let attempt = 0; ; attempt += 1) {
    if (signal && signal.aborted) throw signal.reason || new Error('operation aborted');

    try {
      return await fn(attempt + 1, signal);
    } catch (error) {
      if (attempt >= retries || !(await shouldRetry(error, attempt + 1))) throw error;
      const exponential = Math.min(maxDelay, baseDelay * (factor ** attempt));
      const multiplier = 1 + ((random() * 2) - 1) * jitter;
      const wait = Math.max(0, exponential * multiplier);
      await sleep(wait, signal);
    }
  }
}

async function runTests() {
  const assert = require('node:assert/strict');
  const waits = [];
  let attempts = 0;
  const value = await retry(async (attemptNumber) => {
    attempts += 1;
    if (attemptNumber < 3) throw new Error('temporary');
    return 'connected';
  }, {
    retries: 3,
    baseDelay: 10,
    factor: 2,
    jitter: 0.5,
    random: () => 0.5,
    sleep: async (milliseconds) => waits.push(milliseconds)
  });

  assert.equal(value, 'connected');
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [10, 20]);

  let policyCalls = 0;
  await assert.rejects(
    retry(async () => { throw new Error('permanent'); }, {
      retries: 5,
      shouldRetry: () => { policyCalls += 1; return false; },
      sleep: async () => { throw new Error('sleep should not run'); }
    }),
    /permanent/
  );
  assert.equal(policyCalls, 1);

  const controller = new AbortController();
  controller.abort(new Error('stop now'));
  await assert.rejects(
    retry(async () => 'never', { signal: controller.signal }),
    /stop now/
  );

  await assert.rejects(retry(async () => { throw new Error('exhausted'); }, {
    retries: 1,
    sleep: async () => {}
  }), /exhausted/);
}

if (require.main === module) {
  runTests().then(() => console.log('Retry with exponential backoff: all tests passed'));
}

module.exports = { retry, defaultSleep };
