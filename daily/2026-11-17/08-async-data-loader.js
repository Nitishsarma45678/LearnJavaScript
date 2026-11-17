'use strict';

/**
 * EXERCISE: Implement a DataLoader-style batching and memoization utility.
 *
 * `load(key)` calls made in the same scheduling window are sent together to a
 * batch function. Duplicate keys share one promise when caching is enabled.
 * Support bounded batch sizes, per-key Error values, whole-batch failures,
 * cache invalidation, priming, and `loadMany` (which resolves Error values).
 *
 * Run: node 08-async-data-loader.js
 */

function createDataLoader(batchLoadFn, options = {}) {
  if (typeof batchLoadFn !== 'function') throw new TypeError('batchLoadFn must be a function');
  const cache = options.cache !== false;
  const maxBatchSize = options.maxBatchSize ?? Infinity;
  const cacheKeyFn = options.cacheKeyFn ?? (key => key);
  const schedule = options.schedule ?? queueMicrotask;
  if (!(maxBatchSize === Infinity || (Number.isInteger(maxBatchSize) && maxBatchSize > 0))) {
    throw new RangeError('maxBatchSize must be a positive integer or Infinity');
  }
  if (typeof cacheKeyFn !== 'function' || typeof schedule !== 'function') {
    throw new TypeError('cacheKeyFn and schedule must be functions');
  }

  const promiseCache = new Map();
  let queue = [];
  let scheduled = false;

  function removeCached(entry) {
    if (cache && promiseCache.get(entry.cacheKey) === entry.promise) promiseCache.delete(entry.cacheKey);
  }

  function scheduleDispatch() {
    if (scheduled) return;
    scheduled = true;
    schedule(dispatch);
  }

  function dispatch() {
    scheduled = false;
    if (queue.length === 0) return;
    const entries = queue.splice(0, maxBatchSize);
    if (queue.length) scheduleDispatch();
    const keys = entries.map(entry => entry.key);
    Promise.resolve().then(() => batchLoadFn(keys)).then(values => {
      if (!Array.isArray(values) || values.length !== entries.length) {
        throw new TypeError("Batch function must return an array of length " + entries.length);
      }
      values.forEach((value, index) => {
        const entry = entries[index];
        if (value instanceof Error) {
          removeCached(entry);
          entry.reject(value);
        } else entry.resolve(value);
      });
    }).catch(error => {
      for (const entry of entries) {
        removeCached(entry);
        entry.reject(error);
      }
    });
  }

  function load(key) {
    const cacheKey = cacheKeyFn(key);
    if (cache && promiseCache.has(cacheKey)) return promiseCache.get(cacheKey);
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    const entry = { key, cacheKey, promise, resolve, reject };
    if (cache) promiseCache.set(cacheKey, promise);
    queue.push(entry);
    scheduleDispatch();
    return promise;
  }

  function clear(key) {
    promiseCache.delete(cacheKeyFn(key));
    return loader;
  }

  function clearAll() {
    promiseCache.clear();
    return loader;
  }

  function prime(key, value) {
    if (cache) {
      const cacheKey = cacheKeyFn(key);
      if (!promiseCache.has(cacheKey)) {
        promiseCache.set(cacheKey, value instanceof Error ? Promise.reject(value) : Promise.resolve(value));
      }
    }
    return loader;
  }

  async function loadMany(keys) {
    return Promise.all(keys.map(key => load(key).catch(error => error)));
  }

  const loader = { load, loadMany, clear, clearAll, prime };
  return loader;
}

// -------------------------------- Tests -----------------------------------
if (require.main === module) {
  const assert = require('node:assert/strict');
  const tick = () => new Promise(resolve => setImmediate(resolve));
  (async () => {
    const batches = [];
    const loader = createDataLoader(async keys => {
      batches.push(keys.slice());
      return keys.map(key => key * 10);
    }, { maxBatchSize: 2 });
    const p1 = loader.load(1);
    const p1Again = loader.load(1);
    const p2 = loader.load(2);
    const p3 = loader.load(3);
    assert.equal(p1, p1Again, 'duplicate loads share the cached promise');
    assert.deepEqual(await Promise.all([p1, p2, p3]), [10, 20, 30]);
    assert.deepEqual(batches, [[1, 2], [3]]);

    let calls = 0;
    const partial = createDataLoader(async keys => {
      calls++;
      return keys.map(key => key === 'bad' ? new Error('missing') : key.toUpperCase());
    });
    await assert.rejects(partial.load('bad'), /missing/);
    assert.equal(await partial.load('ok'), 'OK');
    assert.equal(await partial.load('ok'), 'OK');
    assert.equal(calls, 2, 'a per-key failure is evicted while successes are cached');

    let wholeCalls = 0;
    const flaky = createDataLoader(async keys => {
      wholeCalls++;
      if (wholeCalls === 1) throw new Error('temporary outage');
      return keys;
    });
    await assert.rejects(flaky.load('x'), /temporary outage/);
    assert.equal(await flaky.load('x'), 'x');

    const primed = createDataLoader(async keys => keys.map(key => key * 2));
    primed.prime(4, 99);
    assert.equal(await primed.load(4), 99);
    primed.clear(4);
    assert.equal(await primed.load(4), 8);
    primed.clearAll();

    const many = await primed.loadMany([1, 2, 1]);
    assert.deepEqual(many, [2, 4, 2]);

    const uncachedBatches = [];
    const uncached = createDataLoader(async keys => {
      uncachedBatches.push(keys.slice());
      return keys;
    }, { cache: false });
    await Promise.all([uncached.load('same'), uncached.load('same')]);
    assert.deepEqual(uncachedBatches, [['same', 'same']]);

    const keyed = createDataLoader(async keys => keys.map(key => key.id), {
      cacheKeyFn: key => key.id
    });
    assert.equal(await keyed.load({ id: 'u1', extra: 1 }), 'u1');
    assert.equal(await keyed.load({ id: 'u1', extra: 2 }), 'u1');

    await tick();
    console.log('Async DataLoader: all tests passed');
  })().catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { createDataLoader };
