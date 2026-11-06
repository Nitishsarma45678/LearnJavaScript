'use strict';

// DataLoader-style utility: microtask batching, per-key de-duplication,
// bounded batch sizes, cache controls, per-caller cancellation and loadMany.
function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error((message || "Values differ") +
    ": expected " + String(expected) + ", got " + String(actual));
}
class LoadAbortError extends Error {
  constructor(message = "load was aborted") {
    super(message); this.name = "AbortError";
  }
}
class AsyncBatchLoader {
  constructor(batchLoadFn, options = {}) {
    if (typeof batchLoadFn !== "function") throw new TypeError("batchLoadFn must be a function");
    const maxBatchSize = options.maxBatchSize === undefined ? Infinity : options.maxBatchSize;
    if (!(maxBatchSize === Infinity || (Number.isInteger(maxBatchSize) && maxBatchSize > 0))) {
      throw new RangeError("maxBatchSize must be a positive integer or Infinity");
    }
    this.batchLoadFn = batchLoadFn; this.maxBatchSize = maxBatchSize;
    this.cacheEnabled = options.cache !== false;
    this.cacheKeyFn = options.cacheKeyFn || ((key) => key);
    this.schedule = options.schedule || queueMicrotask;
    this.cache = new Map(); this.queue = []; this.scheduled = false;
  }
  load(key, options = {}) {
    const signal = options.signal;
    if (signal && signal.aborted) return Promise.reject(new LoadAbortError());
    const cacheKey = this.cacheKeyFn(key);
    let entry = this.cacheEnabled ? this.cache.get(cacheKey) : undefined;
    if (entry && entry.status === "settled") return Promise.resolve(entry.value);
    if (!entry) {
      entry = { key, cacheKey, status: "queued", waiters: new Set(), value: undefined };
      if (this.cacheEnabled) this.cache.set(cacheKey, entry);
      this.queue.push(entry); this._scheduleFlush();
    }
    return this._addWaiter(entry, signal);
  }
  loadMany(keys) {
    return Promise.all(keys.map((key) => this.load(key).catch((error) => error)));
  }
  clear(key) { this.cache.delete(this.cacheKeyFn(key)); return this; }
  clearAll() { this.cache.clear(); return this; }
  prime(key, value) {
    if (!this.cacheEnabled) return this;
    const cacheKey = this.cacheKeyFn(key);
    if (!this.cache.has(cacheKey)) {
      this.cache.set(cacheKey, { key, cacheKey, status: "settled", waiters: new Set(), value });
    }
    return this;
  }
  _addWaiter(entry, signal) {
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, signal, active: true, onAbort: null };
      waiter.onAbort = () => {
        if (!waiter.active) return;
        waiter.active = false;
        if (signal) signal.removeEventListener("abort", waiter.onAbort);
        entry.waiters.delete(waiter); reject(new LoadAbortError());
        if (entry.status === "queued" && entry.waiters.size === 0 &&
            this.cache.get(entry.cacheKey) === entry) this.cache.delete(entry.cacheKey);
      };
      entry.waiters.add(waiter);
      if (signal) {
        signal.addEventListener("abort", waiter.onAbort, { once: true });
        if (signal.aborted) waiter.onAbort();
      }
    });
  }
  _scheduleFlush() {
    if (this.scheduled) return;
    this.scheduled = true;
    this.schedule(() => {
      this._flush().catch((error) => {
        const pending = this.queue.splice(0);
        for (const entry of pending) this._settle(entry, error);
      });
    });
  }
  async _flush() {
    this.scheduled = false;
    const queued = this.queue.splice(0).filter((entry) => entry.waiters.size > 0);
    const batches = [];
    for (let i = 0; i < queued.length; i += this.maxBatchSize) {
      batches.push(queued.slice(i, i + this.maxBatchSize));
    }
    await Promise.all(batches.map(async (entries) => {
      for (const entry of entries) entry.status = "inflight";
      try {
        const values = await this.batchLoadFn(entries.map((entry) => entry.key));
        if (!Array.isArray(values) || values.length !== entries.length) {
          throw new Error("batchLoadFn must return one result per key");
        }
        entries.forEach((entry, index) => {
          const value = values[index];
          this._settle(entry, value instanceof Error ? value : null, value);
        });
      } catch (error) {
        for (const entry of entries) this._settle(entry, error);
      }
    }));
    if (this.queue.length) this._scheduleFlush();
  }
  _settle(entry, error, value) {
    entry.status = "settled"; entry.value = error ? undefined : value;
    if (error && this.cache.get(entry.cacheKey) === entry) this.cache.delete(entry.cacheKey);
    const waiters = Array.from(entry.waiters); entry.waiters.clear();
    for (const waiter of waiters) {
      if (!waiter.active) continue;
      waiter.active = false;
      if (waiter.signal) waiter.signal.removeEventListener("abort", waiter.onAbort);
      if (error) waiter.reject(error); else waiter.resolve(value);
    }
  }
}
async function runTests() {
  const batches = [];
  const loader = new AsyncBatchLoader(async (keys) => {
    batches.push(keys.slice());
    return keys.map((key) => key === "missing" ? new Error("not found") : key * 10);
  }, { maxBatchSize: 2 });
  const p1 = loader.load(1), p2 = loader.load(1), p3 = loader.load(2), p4 = loader.load(3);
  const values = await Promise.all([p1, p2, p3, p4]);
  equal(values.join(","), "10,10,20,30");
  equal(batches.length, 2); equal(batches[0].length, 2); equal(batches[1].length, 1);
  let rejected = false;
  try { await loader.load("missing"); } catch (error) { rejected = error.message === "not found"; }
  assert(rejected);
  const callsBeforeRetry = batches.length;
  try { await loader.load("missing"); } catch (_) {}
  equal(batches.length, callsBeforeRetry + 1);
  const controller = new AbortController();
  const cancelled = loader.load(4, { signal: controller.signal });
  const survivor = loader.load(4); controller.abort();
  let wasAborted = false;
  try { await cancelled; } catch (error) { wasAborted = error.name === "AbortError"; }
  assert(wasAborted); equal(await survivor, 40);
  loader.prime(99, 990); equal(await loader.load(99), 990);
  loader.clear(99); equal(await loader.load(5), 50);
  const mixed = await loader.loadMany([6, "missing"]);
  equal(mixed[0], 60); assert(mixed[1] instanceof Error);
  console.log("Async batch loader: all tests passed");
}
if (typeof module !== "undefined" && require.main === module) runTests().catch((error) => {
  console.error(error); process.exitCode = 1;
});
if (typeof module !== "undefined") module.exports = { AsyncBatchLoader, LoadAbortError };