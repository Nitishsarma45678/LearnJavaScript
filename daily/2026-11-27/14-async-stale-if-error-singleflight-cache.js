'use strict';

// Exercise: implement a TTL cache with stale-if-error behavior and single-flight
// refreshes. Concurrent callers for the same key share one loader invocation.

function createCache(loader, options = {}) {
  const ttl = options.ttl ?? 1000;
  const staleIfError = options.staleIfError ?? 5000;
  const now = options.now ?? Date.now;
  const entries = new Map();
  const inflight = new Map();

  async function refresh(key, staleEntry) {
    if (inflight.has(key)) return inflight.get(key);
    const promise = Promise.resolve().then(() => loader(key)).then(value => {
      const loadedAt = now();
      const entry = { value, freshUntil: loadedAt + ttl, staleUntil: loadedAt + ttl + staleIfError };
      entries.set(key, entry);
      return value;
    }).catch(error => {
      if (staleEntry && now() <= staleEntry.staleUntil) return staleEntry.value;
      throw error;
    }).finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  }

  return {
    async get(key) {
      const entry = entries.get(key);
      const time = now();
      if (entry && time <= entry.freshUntil) return entry.value;
      return refresh(key, entry && time <= entry.staleUntil ? entry : null);
    },
    invalidate(key) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    },
    get pendingCount() {
      return inflight.size;
    }
  };
}

const assert = require('node:assert/strict');
(async () => {
  let time = 0;
  let calls = 0;
  let shouldFail = false;
  const cache = createCache(async key => {
    calls += 1;
    if (shouldFail) throw new Error('origin unavailable');
    return key + ':' + calls;
  }, { ttl: 10, staleIfError: 20, now: () => time });

  assert.equal(await cache.get('user'), 'user:1');
  time = 5;
  assert.equal(await cache.get('user'), 'user:1');
  assert.equal(calls, 1);
  time = 11;
  shouldFail = true;
  assert.equal(await cache.get('user'), 'user:1', 'stale value is served on refresh failure');
  time = 40;
  await assert.rejects(cache.get('user'), /origin unavailable/);
  cache.invalidate('user');
  shouldFail = false;
  const [a, b] = await Promise.all([cache.get('user'), cache.get('user')]);
  assert.equal(a, b);
  assert.equal(calls, 4);
  console.log('Stale-if-error cache tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

module.exports = { createCache };
