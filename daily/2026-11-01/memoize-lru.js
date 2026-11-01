const assert = require('node:assert/strict');

function memoizeLRU(fn, limit = 100) {
  if (typeof fn !== 'function') throw new TypeError('fn must be a function');
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('limit must be positive');
  const cache = new Map();
  function memoized(...args) {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      const value = cache.get(key);
      cache.delete(key);
      cache.set(key, value);
      return value;
    }
    const value = fn.apply(this, args);
    cache.set(key, value);
    if (cache.size > limit) cache.delete(cache.keys().next().value);
    return value;
  }
  memoized.clear = () => cache.clear();
  memoized.cacheSize = () => cache.size;
  return memoized;
}

let calls = 0;
const square = memoizeLRU(n => { calls++; return n * n; }, 2);
assert.equal(square(2), 4);
assert.equal(square(2), 4);
assert.equal(calls, 1);
square(3); square(2); square(4);
assert.equal(square.cacheSize(), 2);
assert.equal(square(3), 9);
assert.equal(calls, 5);
square.clear();
assert.equal(square.cacheSize(), 0);
console.log('LRU memoization tests passed');