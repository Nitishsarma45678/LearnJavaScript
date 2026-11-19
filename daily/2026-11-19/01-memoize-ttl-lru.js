'use strict';

/**
 * Exercise: Build a memoizer with both time-to-live expiry and LRU eviction.
 *
 * Requirements:
 * - Preserve the wrapped function's this value.
 * - Accept a custom key resolver and an injectable clock for deterministic tests.
 * - Expire entries after ttl milliseconds and evict the least-recently-used
 *   entry when maxSize is exceeded.
 * - Expose clear(), delete(key), has(key), and a read-only size getter.
 *
 * The default multi-argument key uses JSON.stringify, so use keyResolver when
 * arguments contain cycles, functions, or identity-sensitive objects.
 */

function memoize(fn, options = {}) {
  if (typeof fn !== 'function') throw new TypeError('fn must be a function');
  const {
    maxSize = Infinity,
    ttl = Infinity,
    keyResolver = (...args) => args.length === 1 ? args[0] : JSON.stringify(args),
    now = Date.now
  } = options;

  if (!(maxSize === Infinity || Number.isInteger(maxSize) && maxSize > 0)) {
    throw new RangeError('maxSize must be a positive integer or Infinity');
  }
  if (!(ttl === Infinity || Number.isFinite(ttl) && ttl >= 0)) {
    throw new RangeError('ttl must be a non-negative number or Infinity');
  }
  if (typeof keyResolver !== 'function' || typeof now !== 'function') {
    throw new TypeError('keyResolver and now must be functions');
  }

  const cache = new Map();

  function memoized(...args) {
    const key = keyResolver.apply(this, args);
    const timestamp = now();
    const cached = cache.get(key);

    if (cached && (ttl === Infinity || timestamp - cached.createdAt < ttl)) {
      cache.delete(key);
      cache.set(key, cached);
      return cached.value;
    }
    if (cached) cache.delete(key);

    const value = fn.apply(this, args);
    cache.set(key, { value, createdAt: timestamp });

    while (cache.size > maxSize) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }
    return value;
  }

  memoized.clear = () => cache.clear();
  memoized.delete = (key) => cache.delete(key);
  memoized.has = (key) => {
    const entry = cache.get(key);
    if (!entry) return false;
    if (ttl !== Infinity && now() - entry.createdAt >= ttl) {
      cache.delete(key);
      return false;
    }
    return true;
  };
  Object.defineProperty(memoized, 'size', {
    enumerable: true,
    get: () => cache.size
  });

  return memoized;
}

function runTests() {
  const assert = require('node:assert/strict');
  let clock = 100;
  let calls = 0;
  const add = memoize((a, b) => { calls += 1; return a + b; }, {
    maxSize: 2,
    ttl: 50,
    now: () => clock
  });

  assert.equal(add(2, 3), 5);
  assert.equal(add(2, 3), 5);
  assert.equal(calls, 1, 'a repeated key should be cached');
  assert.equal(add(4, 1), 5);
  assert.equal(add(7, 1), 8);
  assert.equal(add.size, 2, 'the cache should respect maxSize');
  assert.equal(add.has('[2,3]'), false, 'the least-recently-used entry should be evicted');

  add(4, 1); // Refresh this entry before inserting another key.
  add(9, 9);
  assert.equal(add.has('[4,1]'), true);
  assert.equal(add.has('[7,1]'), false);

  clock += 51;
  assert.equal(add.has('[4,1]'), false, 'expired entries should be removed on lookup');
  assert.equal(add(4, 1), 5);
  assert.equal(calls, 6);

  const receiverAware = memoize(function (amount) { return this.rate * amount; });
  assert.equal(receiverAware.call({ rate: 3 }, 4), 12);
  assert.equal(receiverAware.call({ rate: 5 }, 4), 12,
    'default keys do not include this; document this behavior or supply a resolver');

  const identityMemo = memoize((object) => object.value, {
    keyResolver: (object) => object
  });
  const first = { value: 10 };
  const second = { value: 10 };
  assert.equal(identityMemo(first), 10);
  assert.equal(identityMemo(second), 10);
  assert.equal(identityMemo.size, 2);

  add.clear();
  assert.equal(add.size, 0);
  assert.equal(add.delete('[4,1]'), false);
  assert.throws(() => memoize(42), /function/);
  assert.throws(() => memoize(() => 1, { maxSize: 0 }), /maxSize/);
}

if (require.main === module) {
  runTests();
  console.log('TTL-aware LRU memoization: all tests passed');
}

module.exports = { memoize };
