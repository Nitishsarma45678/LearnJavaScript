// Practice: closure-based query cache with TTL, LRU eviction, and statistics.
// Concepts: closures, higher-order functions, Map, async functions, and cache invalidation.

function createQueryCache(fetcher, { maxSize = 3, ttl = 1000 } = {}) {
  const cache = new Map();
  let hits = 0;
  let misses = 0;

  function isFresh(entry, now) {
    return now - entry.createdAt < ttl;
  }

  function touch(key, entry) {
    cache.delete(key);
    cache.set(key, entry); // newest entry becomes the most recently used
  }

  async function get(key) {
    const now = Date.now();
    const cached = cache.get(key);

    if (cached && isFresh(cached, now)) {
      hits++;
      touch(key, cached);
      return cached.value;
    }

    if (cached) cache.delete(key);
    misses++;

    const value = await fetcher(key);
    cache.set(key, { value, createdAt: Date.now() });

    if (cache.size > maxSize) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }

    return value;
  }

  function invalidate(key) {
    return cache.delete(key);
  }

  function clear() {
    cache.clear();
  }

  function stats() {
    return {
      size: cache.size,
      hits,
      misses,
      hitRate: hits + misses === 0 ? 0 : hits / (hits + misses),
    };
  }

  return Object.freeze({ get, invalidate, clear, stats });
}

const fakeFetch = async (id) => {
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { id, name: `User ${id}` };
};

const users = createQueryCache(fakeFetch, { maxSize: 2, ttl: 5000 });

(async () => {
  console.log(await users.get(1)); // miss
  console.log(await users.get(1)); // hit
  console.log(await users.get(2)); // miss
  console.log(await users.get(3)); // miss + evicts least recently used key
  console.log(await users.get(1)); // hit because key 1 was recently accessed
  console.log(users.stats());

  users.invalidate(1);
  console.log(await users.get(1)); // miss after explicit invalidation
  console.log(users.stats());
})();
