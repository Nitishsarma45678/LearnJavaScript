/**
 * Practice: Closure-Based Memoized Rate Limiter
 *
 * Build a reusable function that combines:
 * - closures for private state
 * - higher-order functions
 * - memoization
 * - sliding-window rate limiting
 * - TTL expiration
 * - cache statistics
 *
 * Goal:
 * The returned function should reject calls when a key exceeds its
 * request limit, while avoiding repeated expensive computations during
 * the cache TTL.
 */

function createMemoizedRateLimiter(fn, {
  limit = 3,
  windowMs = 1000,
  ttlMs = 2000
} = {}) {
  const cache = new Map();
  const requests = new Map();

  let hits = 0;
  let misses = 0;
  let rejected = 0;

  function cleanup(key, now) {
    const timestamps = requests.get(key) || [];
    const valid = timestamps.filter(timestamp => now - timestamp < windowMs);

    if (valid.length === 0) {
      requests.delete(key);
    } else {
      requests.set(key, valid);
    }

    return valid;
  }

  return async function limited(key, ...args) {
    const now = Date.now();
    const timestamps = cleanup(key, now);

    if (timestamps.length >= limit) {
      rejected++;
      throw new Error(`Rate limit exceeded for key: ${key}`);
    }

    timestamps.push(now);
    requests.set(key, timestamps);

    const cached = cache.get(key);

    if (cached && now - cached.createdAt < ttlMs) {
      hits++;
      return cached.value;
    }

    cache.delete(key);
    misses++;

    const value = await fn(...args);

    cache.set(key, {
      value,
      createdAt: Date.now()
    });

    return value;
  };

  // Intentionally private: exposed through a separate factory API below.
}

// Factory with observable statistics.
function createService(fn, options = {}) {
  const cache = new Map();
  const requests = new Map();

  let hits = 0;
  let misses = 0;
  let rejected = 0;

  const {
    limit = 3,
    windowMs = 1000,
    ttlMs = 2000
  } = options;

  const cleanup = (key, now) => {
    const valid = (requests.get(key) || [])
      .filter(timestamp => now - timestamp < windowMs);

    valid.length ? requests.set(key, valid) : requests.delete(key);
    return valid;
  };

  const execute = async (key, ...args) => {
    const now = Date.now();
    const timestamps = cleanup(key, now);

    if (timestamps.length >= limit) {
      rejected++;
      throw new Error(`Rate limit exceeded for key: ${key}`);
    }

    timestamps.push(now);
    requests.set(key, timestamps);

    const cached = cache.get(key);

    if (cached && now - cached.createdAt < ttlMs) {
      hits++;
      return cached.value;
    }

    misses++;
    cache.delete(key);

    const value = await fn(...args);
    cache.set(key, { value, createdAt: Date.now() });

    return value;
  };

  return {
    execute,

    stats() {
      return {
        hits,
        misses,
        rejected,
        cacheSize: cache.size,
        activeKeys: requests.size
      };
    },

    clear(key) {
      cache.delete(key);
      requests.delete(key);
    }
  };
}

// Example
const expensiveLookup = async userId => {
  await new Promise(resolve => setTimeout(resolve, 100));
  return {
    userId,
    score: userId.length * 10
  };
};

const service = createService(expensiveLookup, {
  limit: 3,
  windowMs: 1000,
  ttlMs: 5000
});

(async () => {
  console.log(await service.execute("nitish", "nitish"));
  console.log(await service.execute("nitish", "nitish"));
  console.log(service.stats());
})();
