'use strict';

// Exercise: map inputs concurrently while preserving output order. Stop
// scheduling after the first failure or abort, but let active workers settle.

async function mapConcurrentOrdered(values, mapper, { concurrency = 4, signal } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError('concurrency must be positive');
  if (typeof mapper !== 'function') throw new TypeError('mapper must be a function');
  const input = Array.from(values);
  const output = new Array(input.length);
  let nextIndex = 0;
  let failure = null;

  const abortError = () => {
    if (signal && signal.reason instanceof Error) return signal.reason;
    const error = new Error('operation aborted');
    error.name = 'AbortError';
    return error;
  };

  async function worker() {
    while (true) {
      if (failure) return;
      if (signal && signal.aborted) { failure = abortError(); return; }
      const index = nextIndex++;
      if (index >= input.length) return;
      try {
        output[index] = await mapper(input[index], index, signal);
      } catch (error) {
        if (!failure) failure = error;
        return;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, input.length) }, worker));
  if (failure) throw failure;
  if (signal && signal.aborted) throw abortError();
  return output;
}

if (require.main === module) {
  const assert = require('node:assert/strict');

  (async () => {
    const active = { count: 0, peak: 0 };
    const result = await mapConcurrentOrdered([30, 10, 20, 5], async (delay, index) => {
      active.count++;
      active.peak = Math.max(active.peak, active.count);
      await new Promise(resolve => setTimeout(resolve, delay));
      active.count--;
      return index * 10;
    }, { concurrency: 2 });
    assert.deepEqual(result, [0, 10, 20, 30]);
    assert.equal(active.peak, 2);

    await assert.rejects(
      mapConcurrentOrdered([1, 2, 3], async value => {
        if (value === 2) throw new Error('boom');
        await Promise.resolve();
        return value;
      }, { concurrency: 2 }),
      /boom/
    );

    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      mapConcurrentOrdered([1], value => value, { signal: controller.signal }),
      error => error.name === 'AbortError'
    );
    assert.deepEqual(await mapConcurrentOrdered([], async x => x), []);
    console.log('ordered concurrent map: all tests passed');
  })().catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { mapConcurrentOrdered };
