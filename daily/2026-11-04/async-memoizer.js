'use strict';

/**
 * Exercise: build an async memoizer with single-flight deduplication, TTL,
 * LRU eviction, rejection eviction, invalidation generations and per-caller
 * AbortSignal handling. Aborting one waiter must not cancel shared work.
 */

function abortError(reason) {
  const error = new Error(reason == null ? 'The operation was aborted' : String(reason));
  error.name = 'AbortError';
  return error;
}

function withAbort(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError(signal.reason));
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => { cleanup(); reject(abortError(signal.reason)); };
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(
      value => { cleanup(); resolve(value); },
      error => { cleanup(); reject(error); }
    );
  });
}

function createAsyncMemoizer(loader, {
  ttlMs = Infinity,
  maxEntries = 100,
  now = Date.now
} = {}) {
  if (typeof loader !== 'function') throw new TypeError('loader must be a function');
  if (!(ttlMs === Infinity || (Number.isFinite(ttlMs) && ttlMs >= 0))) throw new RangeError('ttlMs must be non-negative');
  if (!Number.isInteger(maxEntries) || maxEntries < 0) throw new RangeError('maxEntries must be a non-negative integer');
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  const cache = new Map(); // key -> { value, expiresAt }
  const pending = new Map(); // key -> { promise, generation }
  const generations = new Map();
  const counters = { hits: 0, misses: 0, coalesced: 0, evictions: 0, expirations: 0 };

  function remember(key, value) {
    if (ttlMs === 0 || maxEntries === 0) return;
    cache.delete(key); // Map insertion order is the LRU order.
    cache.set(key, { value, expiresAt: ttlMs === Infinity ? Infinity : now() + ttlMs });
    while (cache.size > maxEntries) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
      counters.evictions++;
    }
  }

  function get(key, { signal } = {}) {
    if (signal?.aborted) return Promise.reject(abortError(signal.reason));
    const cached = cache.get(key);
    if (cached) {
      if (cached.expiresAt > now()) {
        cache.delete(key);
        cache.set(key, cached);
        counters.hits++;
        return withAbort(Promise.resolve(cached.value), signal);
      }
      cache.delete(key);
      counters.expirations++;
    }

    const active = pending.get(key);
    if (active) {
      counters.coalesced++;
      return withAbort(active.promise, signal);
    }

    counters.misses++;
    const generation = generations.get(key) ?? 0;
    const promise = Promise.resolve().then(() => loader(key));
    const record = { promise, generation };
    pending.set(key, record);
    promise.then(value => {
      if (pending.get(key) !== record) return; // invalidated or superseded
      pending.delete(key);
      if ((generations.get(key) ?? 0) === generation) remember(key, value);
    }, () => {
      if (pending.get(key) === record) pending.delete(key); // failures are never cached
    });
    return withAbort(promise, signal);
  }

  function invalidate(key) {
    if (arguments.length === 0) {
      cache.clear();
      for (const pendingKey of pending.keys()) generations.set(pendingKey, (generations.get(pendingKey) ?? 0) + 1);
      pending.clear();
      return;
    }
    cache.delete(key);
    generations.set(key, (generations.get(key) ?? 0) + 1);
    pending.delete(key);
  }

  function clearExpired() {
    const time = now();
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= time) {
        cache.delete(key);
        counters.expirations++;
      }
    }
  }

  function stats() {
    return Object.freeze({ ...counters, cached: cache.size, pending: pending.size });
  }

  return Object.freeze({ get, invalidate, clearExpired, stats });
}

module.exports = { createAsyncMemoizer };

if (require.main === module) {
  const assert = require('node:assert/strict');
  const deferred = () => {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };

  (async () => {
    let calls = 0;
    const gate = deferred();
    const memo = createAsyncMemoizer(async key => { calls++; await gate.promise; return key.toUpperCase(); });
    const first = memo.get('alpha');
    const second = memo.get('alpha');
    await Promise.resolve();
    assert.equal(calls, 1);
    gate.resolve();
    assert.deepEqual(await Promise.all([first, second]), ['ALPHA', 'ALPHA']);
    assert.equal(await memo.get('alpha'), 'ALPHA');
    assert.equal(memo.stats().coalesced, 1);
    assert.equal(memo.stats().hits, 1);

    let clock = 0;
    let ttlCalls = 0;
    const ttlMemo = createAsyncMemoizer(async key => `${key}-${++ttlCalls}`, { ttlMs: 10, now: () => clock });
    assert.equal(await ttlMemo.get('x'), 'x-1');
    clock = 9;
    assert.equal(await ttlMemo.get('x'), 'x-1');
    clock = 10;
    assert.equal(await ttlMemo.get('x'), 'x-2');

    let loadCount = 0;
    const gates = [];
    const invalidating = createAsyncMemoizer(key => {
      const callId = ++loadCount;
      const gateForCall = deferred(); gates.push(gateForCall);
      return gateForCall.promise.then(() => `${key}-${callId}`);
    });
    const stale = invalidating.get('item');
    await Promise.resolve();
    invalidating.invalidate('item');
    const fresh = invalidating.get('item');
    await Promise.resolve();
    gates[0].resolve();
    assert.equal(await stale, 'item-1');
    gates[1].resolve();
    assert.equal(await fresh, 'item-2');
    assert.equal(await invalidating.get('item'), 'item-2');

    const sharedGate = deferred();
    const abortMemo = createAsyncMemoizer(() => sharedGate.promise);
    const controller = new AbortController();
    const abandoned = abortMemo.get('shared', { signal: controller.signal });
    const survivor = abortMemo.get('shared');
    controller.abort('not interested');
    await assert.rejects(abandoned, { name: 'AbortError' });
    sharedGate.resolve(17);
    assert.equal(await survivor, 17);

    let attempts = 0;
    const retryMemo = createAsyncMemoizer(async () => {
      if (++attempts === 1) throw new Error('temporary');
      return 'recovered';
    });
    await assert.rejects(retryMemo.get('retry'), /temporary/);
    assert.equal(await retryMemo.get('retry'), 'recovered');

    let lruCalls = 0;
    const lru = createAsyncMemoizer(async key => `${key}-${++lruCalls}`, { maxEntries: 2 });
    await lru.get('a'); await lru.get('b'); await lru.get('a'); await lru.get('c');
    await lru.get('a');
    assert.equal(lru.stats().evictions, 1);
    assert.equal(lru.stats().cached, 2);
    console.log('Async memoizer: all tests passed');
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
