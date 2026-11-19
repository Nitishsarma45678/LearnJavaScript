'use strict';

/**
 * Exercise: Map an iterable with a strict concurrency limit.
 *
 * Results retain input order even when tasks finish out of order. A mapper
 * failure stops new work from being scheduled; already-running tasks are
 * allowed to settle before the returned promise rejects.
 */

function abortError(signal) {
  if (signal && signal.reason instanceof Error) return signal.reason;
  const error = new Error('operation aborted');
  error.name = 'AbortError';
  return error;
}

async function mapLimit(iterable, limit, mapper, options = {}) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('limit must be a positive integer');
  if (typeof mapper !== 'function') throw new TypeError('mapper must be a function');

  const values = Array.from(iterable);
  const { signal } = options;
  const output = new Array(values.length);
  let nextIndex = 0;
  let failed = false;
  let firstError;

  async function worker() {
    while (!failed) {
      if (signal && signal.aborted) {
        failed = true;
        firstError = firstError || abortError(signal);
        return;
      }

      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) return;

      try {
        output[index] = await mapper(values[index], index, signal);
      } catch (error) {
        failed = true;
        if (!firstError) firstError = error;
        return;
      }
    }
  }

  const workerCount = Math.min(limit, values.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (firstError) throw firstError;
  return output;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runTests() {
  const assert = require('node:assert/strict');
  let active = 0;
  let maximumActive = 0;
  const values = [1, 2, 3, 4, 5, 6];

  const result = await mapLimit(values, 2, async (value) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await delay((7 - value) * 2);
    active -= 1;
    return value * 10;
  });

  assert.deepEqual(result, [10, 20, 30, 40, 50, 60]);
  assert.equal(maximumActive, 2, 'no more than two tasks should run concurrently');

  await assert.rejects(
    mapLimit([1, 2, 3, 4], 2, async (value) => {
      await delay(2);
      if (value === 2) throw new Error('mapper failed');
      return value;
    }),
    /mapper failed/
  );

  const controller = new AbortController();
  controller.abort(new Error('cancelled by caller'));
  await assert.rejects(
    mapLimit([1, 2], 1, async (value) => value, { signal: controller.signal }),
    /cancelled by caller/
  );

  assert.deepEqual(await mapLimit([], 3, async (value) => value), []);
  assert.throws(() => mapLimit([1], 0, async (value) => value), /limit/);
}

if (require.main === module) {
  runTests().then(() => console.log('Bounded async map: all tests passed'));
}

module.exports = { mapLimit };
