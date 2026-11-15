'use strict';

/**
 * In-flight request coalescer with a small TTL/LRU result cache.
 *
 * Concurrent callers for the same key share one loader invocation. Each caller
 * owns an independent AbortSignal: cancelling one waiter does not cancel work
 * needed by others. The underlying loader is aborted only after its final
 * waiter leaves. Rejections are never cached, and abandoned late results are
 * ignored even if a loader does not honor AbortSignal.
 */

const assert = require('node:assert/strict');

function abortReason(signal) {
  if (signal && signal.reason !== undefined) return signal.reason;
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

function raceWithSignal(value, signal) {
  if (!signal) return Promise.resolve(value);
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(abortReason(signal));
    };
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(value).then(
      result => { cleanup(); resolve(result); },
      error => { cleanup(); reject(error); }
    );
  });
}

function createRequestCoalescer(loader, options = {}) {
  if (typeof loader !== 'function') throw new TypeError('loader must be a function');
  const ttlMs = options.ttlMs ?? 30_000;
  const maxEntries = options.maxEntries ?? 100;
  const clock = options.clock ?? Date.now;
  if (!Number.isFinite(ttlMs) || ttlMs < 0) throw new RangeError('ttlMs must be non-negative');
  if (!Number.isInteger(maxEntries) || maxEntries < 0) throw new RangeError('maxEntries must be a non-negative integer');
  if (typeof clock !== 'function') throw new TypeError('clock must be a function');

  const entries = new Map();

  function removeWaiter(entry, waiter) {
    if (!waiter.active) return;
    waiter.active = false;
    entry.waiters.delete(waiter);
    if (waiter.signal) waiter.signal.removeEventListener('abort', waiter.onAbort);
  }

  function settleWaiters(entry, method, value) {
    for (const waiter of [...entry.waiters]) {
      removeWaiter(entry, waiter);
      waiter[method](value);
    }
  }

  function touch(key, entry) {
    entries.delete(key);
    entries.set(key, entry);
  }

  function trimCache() {
    let cached = 0;
    for (const entry of entries.values()) if (entry.state === 'fulfilled') cached++;
    if (cached <= maxEntries) return;
    for (const [key, entry] of entries) {
      if (entry.state !== 'fulfilled') continue;
      entries.delete(key);
      if (--cached <= maxEntries) break;
    }
  }

  function attachWaiter(key, entry, signal) {
    if (signal && signal.aborted) return Promise.reject(abortReason(signal));
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, signal, active: true, onAbort: null };
      waiter.onAbort = () => {
        removeWaiter(entry, waiter);
        reject(abortReason(signal));
        if (entry.state === 'pending' && entry.waiters.size === 0) {
          if (entries.get(key) === entry) entries.delete(key);
          entry.controller.abort();
        }
      };
      entry.waiters.add(waiter);
      if (signal) signal.addEventListener('abort', waiter.onAbort, { once: true });
      // Close the small race between the initial check and listener registration.
      if (signal && signal.aborted) waiter.onAbort();
    });
  }

  function startLoader(key, entry) {
    Promise.resolve()
      .then(() => loader(key, { signal: entry.controller.signal }))
      .then(value => {
        if (entries.get(key) !== entry || entry.state !== 'pending') return;
        if (entry.waiters.size === 0) {
          entries.delete(key);
          return;
        }
        entry.state = 'fulfilled';
        entry.value = value;
        entry.expiresAt = clock() + ttlMs;
        settleWaiters(entry, 'resolve', value);
        if (ttlMs === 0 || maxEntries === 0) entries.delete(key);
        else trimCache();
      }, error => {
        if (entries.get(key) === entry) entries.delete(key);
        settleWaiters(entry, 'reject', error);
      });
  }

  function request(key, requestOptions = {}) {
    const signal = requestOptions.signal;
    if (signal && signal.aborted) return Promise.reject(abortReason(signal));
    let entry = entries.get(key);
    if (entry && entry.state === 'fulfilled' && entry.expiresAt <= clock()) {
      entries.delete(key);
      entry = undefined;
    }
    if (entry && entry.state === 'fulfilled') {
      touch(key, entry);
      return raceWithSignal(entry.value, signal);
    }
    if (!entry) {
      entry = { state: 'pending', controller: new AbortController(), waiters: new Set() };
      entries.set(key, entry);
      const promise = attachWaiter(key, entry, signal);
      startLoader(key, entry);
      return promise;
    }
    return attachWaiter(key, entry, signal);
  }

  function clear(reason = new Error('Request coalescer cleared')) {
    for (const entry of entries.values()) {
      if (entry.state === 'pending') {
        entry.controller.abort(reason);
        settleWaiters(entry, 'reject', reason);
      }
    }
    entries.clear();
  }

  return Object.freeze({
    request,
    clear,
    get size() { return entries.size; },
    get pendingCount() {
      let count = 0;
      for (const entry of entries.values()) if (entry.state === 'pending') count++;
      return count;
    },
    get cacheSize() {
      let count = 0;
      for (const entry of entries.values()) if (entry.state === 'fulfilled') count++;
      return count;
    }
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function runTests() {
  const first = deferred();
  let calls = 0;
  const shared = createRequestCoalescer(async key => {
    calls++;
    assert.equal(key, 'shared');
    return first.promise;
  });
  const a = shared.request('shared');
  const b = shared.request('shared');
  await Promise.resolve();
  assert.equal(calls, 1, 'same-key callers must share one loader');
  first.resolve({ answer: 42 });
  assert.deepEqual(await Promise.all([a, b]), [{ answer: 42 }, { answer: 42 }]);
  assert.deepEqual(await shared.request('shared'), { answer: 42 });
  assert.equal(calls, 1, 'successful result should be cached');

  const gate = deferred();
  let sharedSignal;
  const cancellable = createRequestCoalescer((key, { signal }) => {
    sharedSignal = signal;
    return gate.promise;
  });
  const controller = new AbortController();
  const cancelled = cancellable.request('job', { signal: controller.signal });
  const survivor = cancellable.request('job');
  await Promise.resolve();
  controller.abort();
  await assert.rejects(cancelled, { name: 'AbortError' });
  assert.equal(sharedSignal.aborted, false, 'one cancelled waiter must not abort shared work');
  gate.resolve('finished');
  assert.equal(await survivor, 'finished');

  const abandonedGate = deferred();
  let abandonedSignal;
  const abandoned = createRequestCoalescer((key, { signal }) => {
    abandonedSignal = signal;
    return abandonedGate.promise;
  });
  const onlyController = new AbortController();
  const only = abandoned.request('lonely', { signal: onlyController.signal });
  await Promise.resolve();
  onlyController.abort();
  await assert.rejects(only, { name: 'AbortError' });
  assert.equal(abandonedSignal.aborted, true, 'last waiter cancellation should abort loader');
  abandonedGate.resolve('late result');
  await Promise.resolve();
  assert.equal(abandoned.cacheSize, 0, 'abandoned late result must not be cached');

  let attempts = 0;
  const retryable = createRequestCoalescer(async () => {
    if (++attempts === 1) throw new Error('temporary');
    return 'recovered';
  });
  await assert.rejects(retryable.request('retry'), /temporary/);
  assert.equal(await retryable.request('retry'), 'recovered');
  assert.equal(attempts, 2, 'rejections must be evicted');

  let now = 100;
  const counts = new Map();
  const lru = createRequestCoalescer(async key => {
    counts.set(key, (counts.get(key) || 0) + 1);
    return `${key}:${counts.get(key)}`;
  }, { ttlMs: 50, maxEntries: 2, clock: () => now });
  assert.equal(await lru.request('a'), 'a:1');
  assert.equal(await lru.request('b'), 'b:1');
  await lru.request('a'); // a becomes most recently used
  assert.equal(await lru.request('c'), 'c:1'); // evicts b
  assert.equal(lru.cacheSize, 2);
  assert.equal(await lru.request('b'), 'b:2');
  now += 51;
  assert.equal(await lru.request('a'), 'a:2', 'expired entry must reload');

  const clearedGate = deferred();
  const cleared = createRequestCoalescer(() => clearedGate.promise);
  const pending = cleared.request('clear-me');
  await Promise.resolve();
  cleared.clear();
  await assert.rejects(pending, /cleared/);
  assert.equal(cleared.pendingCount, 0);
  clearedGate.resolve('ignored');
  console.log('Async Request Coalescer: all tests passed');
}

if (require.main === module) runTests().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { createRequestCoalescer, raceWithSignal, runTests };
