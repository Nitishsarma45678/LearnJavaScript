// Exercise: Batch loads scheduled in the same event-loop turn, deduplicate
// concurrent keys, enforce a maximum batch size, and allow cache management.
// batchLoadFn(keys) must resolve to an array with one result per input key.

"use strict";

class BatchLoader {
  constructor(batchLoadFn, options = {}) {
    if (typeof batchLoadFn !== "function") {
      throw new TypeError("batchLoadFn must be a function");
    }
    const maxBatchSize = options.maxBatchSize === undefined
      ? Infinity
      : options.maxBatchSize;
    if (!(maxBatchSize === Infinity ||
          (Number.isInteger(maxBatchSize) && maxBatchSize > 0))) {
      throw new RangeError("maxBatchSize must be a positive integer");
    }

    this.batchLoadFn = batchLoadFn;
    this.cacheEnabled = options.cache !== false;
    this.maxBatchSize = maxBatchSize;
    this.cache = new Map();
    this.queue = [];
    this.scheduled = false;
  }

  load(key) {
    if (this.cacheEnabled && this.cache.has(key)) return this.cache.get(key);

    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const item = { key, resolve, reject, promise };
    if (this.cacheEnabled) this.cache.set(key, promise);
    this.queue.push(item);
    this.scheduleDispatch();
    return promise;
  }

  clear(key) {
    this.cache.delete(key);
    return this;
  }

  clearAll() {
    this.cache.clear();
    return this;
  }

  prime(key, value) {
    if (this.cacheEnabled && !this.cache.has(key)) {
      this.cache.set(key, Promise.resolve(value));
    }
    return this;
  }

  scheduleDispatch() {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => this.dispatch());
  }

  async dispatch() {
    this.scheduled = false;
    const batch = this.queue.splice(0, this.maxBatchSize);
    if (this.queue.length > 0) this.scheduleDispatch();
    if (batch.length === 0) return;

    try {
      const values = await this.batchLoadFn(batch.map((item) => item.key));
      if (!Array.isArray(values) || values.length !== batch.length) {
        throw new Error("batchLoadFn must return one result per key");
      }

      batch.forEach((item, index) => {
        const value = values[index];
        if (value instanceof Error) {
          if (this.cache.get(item.key) === item.promise) this.cache.delete(item.key);
          item.reject(value);
        } else {
          item.resolve(value);
        }
      });
    } catch (error) {
      for (const item of batch) {
        if (this.cache.get(item.key) === item.promise) this.cache.delete(item.key);
        item.reject(error);
      }
    }
  }
}

module.exports = { BatchLoader };

if (require.main === module) {
  const assert = require("node:assert/strict");

  async function runTests() {
    const batches = [];
    const loader = new BatchLoader(async (keys) => {
      batches.push(keys);
      return keys.map((key) => key.toUpperCase());
    }, { maxBatchSize: 2 });

    const pA1 = loader.load("a");
    const pB = loader.load("b");
    const pA2 = loader.load("a");
    assert.equal(pA1, pA2, "duplicate keys share the same pending promise");
    assert.deepEqual(await Promise.all([pA1, pB, loader.load("c")]), ["A", "B", "C"]);
    assert.deepEqual(batches, [["a", "b"], ["c"]]);

    loader.clear("a");
    assert.equal(await loader.load("a"), "A");
    loader.prime("cached", "READY");
    assert.equal(await loader.load("cached"), "READY");

    const retryLoader = new BatchLoader(async (keys) => {
      return keys.map((key) => key === "bad" ? new Error("missing") : key);
    });
    await assert.rejects(retryLoader.load("bad"), /missing/);
    assert.equal(await retryLoader.load("good"), "good");

    const invalidLoader = new BatchLoader(async () => []);
    await assert.rejects(invalidLoader.load("x"), /one result per key/);
    assert.throws(() => new BatchLoader(() => [], { maxBatchSize: 0 }), RangeError);
    console.log("async-batch-loader: all tests passed");
  }

  runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
