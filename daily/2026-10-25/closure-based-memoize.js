/**
 * Closure-based memoization with stable argument keys.
 * Practice: closures, serialization, cache management.
 */
function memoize(fn, keyOf = (...args) => JSON.stringify(args), maxSize = 100) {
  if (typeof fn !== "function") throw new TypeError("fn must be a function");
  if (!Number.isInteger(maxSize) || maxSize < 1) throw new RangeError("maxSize must be positive");
  const cache = new Map();

  function memoized(...args) {
    const key = keyOf(...args);
    if (cache.has(key)) {
      const value = cache.get(key);
      cache.delete(key); // refresh recency
      cache.set(key, value);
      return value;
    }
    const value = fn.apply(this, args);
    cache.set(key, value);
    if (cache.size > maxSize) cache.delete(cache.keys().next().value);
    return value;
  }

  memoized.clear = () => cache.clear();
  memoized.cacheSize = () => cache.size;
  return memoized;
}

let calls = 0;
const squareSum = memoize((a, b) => { calls++; return a * a + b * b; }, undefined, 2);
console.assert(squareSum(3, 4) === 25);
console.assert(squareSum(3, 4) === 25 && calls === 1);
squareSum(1, 2); squareSum(5, 6);
console.assert(squareSum.cacheSize() === 2);
console.log("memoize practice passed");
