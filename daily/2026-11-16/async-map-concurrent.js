'use strict';

/**
 * EXERCISE: Implement a bounded-concurrency async iterator map operator.
 *
 * Requirements:
 * - Accept sync or async iterables and an async mapper.
 * - Never have more than `concurrency` mapper calls in flight.
 * - Support ordered output (default) and completion-order output.
 * - Pass an AbortSignal to every mapper invocation.
 * - Propagate mapper/source errors, close the source iterator, abort siblings,
 *   and await all started mapper tasks before finishing cleanup.
 * - Consumer early-return (for example, breaking a for-await loop) must also
 *   abort outstanding work and call iterator.return when available.
 *
 * Run: node async-map-concurrent.js
 */

function abortError(signal) {
  return signal?.reason ?? new DOMException('The operation was aborted', 'AbortError');
}

async function* mapConcurrent(source, mapper, options = {}) {
  const { concurrency = 4, ordered = true, signal: externalSignal } = options;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError('concurrency must be a positive integer');
  }
  if (typeof mapper !== 'function') throw new TypeError('mapper must be a function');
  if (externalSignal?.aborted) throw abortError(externalSignal);

  const iterator = source?.[Symbol.asyncIterator]?.() ?? source?.[Symbol.iterator]?.();
  if (!iterator || typeof iterator.next !== 'function') throw new TypeError('source must be iterable');

  const controller = new AbortController();
  const active = new Map();
  let nextIndex = 0;
  let nextOrdered = 0;
  let sourceDone = false;
  let sourceClosed = false;
  let completedNormally = false;
  let order = 0;

  const relayAbort = () => controller.abort(abortError(externalSignal));
  externalSignal?.addEventListener('abort', relayAbort, { once: true });

  function assertNotAborted() {
    if (externalSignal?.aborted) relayAbort();
    if (controller.signal.aborted) throw abortError(controller.signal);
  }

  async function closeSource() {
    if (sourceClosed || sourceDone) return;
    sourceClosed = true;
    if (typeof iterator.return === 'function') await iterator.return();
  }

  async function fill() {
    while (!sourceDone && active.size < concurrency) {
      assertNotAborted();
      const step = await iterator.next();
      if (step.done) {
        sourceDone = true;
        break;
      }
      const index = nextIndex++;
      const task = Promise.resolve()
        .then(() => mapper(step.value, index, controller.signal))
        .then(value => ({ ok: true, value, index, order: order++ }), error => ({ ok: false, error, index, order: order++ }));
      active.set(index, task);
    }
  }

  try {
    while (true) {
      assertNotAborted();
      await fill();
      if (!active.size) {
        completedNormally = true;
        break;
      }

      let result;
      if (ordered) {
        const task = active.get(nextOrdered);
        result = await task;
        active.delete(nextOrdered);
        nextOrdered++;
      } else {
        result = await Promise.race(active.values());
        active.delete(result.index);
      }

      if (!result.ok) throw result.error;
      assertNotAborted();
      yield result.value;
    }
  } finally {
    externalSignal?.removeEventListener('abort', relayAbort);
    if (!completedNormally) {
      controller.abort(new Error('mapConcurrent stopped before completing'));
      if (!sourceDone) {
        try { await closeSource(); } catch { /* preserve the original completion reason */ }
      }
    }
    await Promise.allSettled(active.values());
  }
}

async function collect(iterable) {
  const values = [];
  for await (const value of iterable) values.push(value);
  return values;
}

async function runTests() {
  const assert = require('node:assert/strict');
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  const ordered = await collect(mapConcurrent([0, 1, 2, 3], async (n) => {
    await delay((3 - n) * 3);
    return n * 10;
  }, { concurrency: 3 }));
  assert.deepEqual(ordered, [0, 10, 20, 30]);

  const completionOrder = await collect(mapConcurrent([0, 1, 2], async n => {
    await delay((2 - n) * 5);
    return n;
  }, { concurrency: 3, ordered: false }));
  assert.deepEqual(completionOrder, [2, 1, 0]);

  let inFlight = 0;
  let maximum = 0;
  await collect(mapConcurrent(Array.from({ length: 20 }, (_, i) => i), async n => {
    inFlight++;
    maximum = Math.max(maximum, inFlight);
    await delay(1);
    inFlight--;
    return n;
  }, { concurrency: 4 }));
  assert.equal(maximum, 4);

  let returned = false;
  let receivedSignal;
  const source = {
    [Symbol.asyncIterator]() {
      let value = 0;
      return {
        async next() { return { value: value++, done: false }; },
        async return() { returned = true; return { done: true }; },
      };
    },
  };
  for await (const value of mapConcurrent(source, async (_n, _i, signal) => {
    receivedSignal = signal;
    await delay(10);
    return _n;
  }, { concurrency: 2 })) {
    assert.equal(typeof value, 'number');
    break;
  }
  assert.equal(returned, true);
  assert.equal(receivedSignal.aborted, true);

  const finiteSignals = [];
  for await (const value of mapConcurrent([10, 20], async (n, _i, signal) => {
    finiteSignals.push(signal);
    await delay(5);
    return n;
  }, { concurrency: 2 })) {
    assert.equal(value, 10);
    break; // source was already exhausted while both tasks were in flight
  }
  assert.equal(finiteSignals.length, 2);
  assert.equal(finiteSignals.every(signal => signal.aborted), true);

  let closedAfterError = false;
  const failingSource = {
    [Symbol.iterator]() {
      let n = 0;
      return {
        next() { return n < 4 ? { value: n++, done: false } : { done: true }; },
        return() { closedAfterError = true; return { done: true }; },
      };
    },
  };
  await assert.rejects(collect(mapConcurrent(failingSource, async n => {
    if (n === 1) throw new Error('mapper boom');
    await delay(2);
    return n;
  }, { concurrency: 3 })), /mapper boom/);
  assert.equal(closedAfterError, true);

  const external = new AbortController();
  external.abort(new Error('caller cancelled'));
  await assert.rejects(collect(mapConcurrent([1], x => x, { signal: external.signal })), /caller cancelled/);
  await assert.rejects(collect(mapConcurrent([1], x => x, { concurrency: 0 })), /positive integer/);

  console.log('async-map-concurrent: all tests passed');
}

if (require.main === module) runTests().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { mapConcurrent, collect, runTests };
