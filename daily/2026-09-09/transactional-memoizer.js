/**
 * Transactional Memoizer
 *
 * Practice: closures, higher-order functions, async JavaScript, caching,
 * Promise de-duplication, TTL expiration, and LRU-style eviction.
 *
 * The memoizer caches completed values, but while an async computation is
 * running all callers share the same Promise. Failed computations are never
 * cached, so a later call can retry normally.
 */

function createTransactionalMemoizer(fn, options = {}) {
  if (typeof fn !== "function") {
    throw new TypeError("fn must be a function");
  }

  const {
    ttlMs = Infinity,
    maxEntries = Infinity,
    keyResolver = (...args) => JSON.stringify(args),
  } = options;

  if (!(ttlMs > 0 || ttlMs === Infinity)) {
    throw new RangeError("ttlMs must be positive or Infinity");
  }
  if (!(maxEntries > 0 || maxEntries === Infinity)) {
    throw new RangeError("maxEntries must be positive or Infinity");
  }

  const cache = new Map();
  const pending = new Map();

  function isFresh(entry, now) {
    return entry.expiresAt === Infinity || now < entry.expiresAt;
  }

  function touch(key, entry) {
    cache.delete(key);
    cache.set(key, entry);
  }

  function evictIfNeeded() {
    while (cache.size > maxEntries) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }
  }

  async function memoized(...args) {
    const key = keyResolver(...args);
    const now = Date.now();
    const cached = cache.get(key);

    if (cached && isFresh(cached, now)) {
      touch(key, cached);
      return cached.value;
    }

    if (cached) cache.delete(key);

    // Promise de-duplication: concurrent callers share one computation.
    if (pending.has(key)) return pending.get(key);

    const computation = Promise.resolve().then(() => fn(...args));
    pending.set(key, computation);

    try {
      const value = await computation;

      cache.set(key, {
        value,
        expiresAt: ttlMs === Infinity ? Infinity : Date.now() + ttlMs,
      });
      evictIfNeeded();
      return value;
    } finally {
      // A rejected computation is not committed to the cache.
      pending.delete(key);
    }
  }

  memoized.clear = () => cache.clear();

  memoized.delete = (key) => cache.delete(key);

  memoized.size = () => cache.size;

  memoized.invalidate = (...args) => cache.delete(keyResolver(...args));

  return memoized;
}

// Example: three concurrent callers trigger only one expensive operation.
let executions = 0;

const expensiveLookup = createTransactionalMemoizer(
  async (userId) => {
    executions++;
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { userId, score: userId.length * 10 };
  },
  { ttlMs: 2000, maxEntries: 2 }
);

Promise.all([
  expensiveLookup("alice"),
  expensiveLookup("alice"),
  expensiveLookup("alice"),
]).then(([first, second, third]) => {
  console.log(first, second, third);
  console.log("Actual executions:", executions); // 1
});

module.exports = { createTransactionalMemoizer };
