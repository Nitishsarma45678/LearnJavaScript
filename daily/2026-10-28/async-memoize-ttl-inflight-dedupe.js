/**
 * Exercise: memoize an async function with:
 * - in-flight request deduplication,
 * - a TTL measured from successful completion,
 * - rejection eviction so failed calls can be retried,
 * - clear/delete controls for cache invalidation.
 *
 * Supply keyFn for arguments that cannot be represented safely by JSON.stringify.
 */
function memoizeAsync(fn, options = {}) {
  if (typeof fn !== "function") throw new TypeError("fn must be a function");

  const {
    ttlMs = 1000,
    keyFn = (...args) => JSON.stringify(args),
    now = () => Date.now()
  } = options;

  if (!Number.isFinite(ttlMs) || ttlMs < 0) {
    throw new RangeError("ttlMs must be a finite non-negative number");
  }
  if (typeof keyFn !== "function" || typeof now !== "function") {
    throw new TypeError("keyFn and now must be functions");
  }

  const cache = new Map();

  function memoized(...args) {
    const key = keyFn(...args);
    const existing = cache.get(key);

    if (existing && (existing.expiresAt === Infinity || existing.expiresAt > now())) {
      return existing.promise;
    }
    if (existing) cache.delete(key);

    const entry = { expiresAt: Infinity, promise: null };
    const receiver = this;

    entry.promise = Promise.resolve()
      .then(() => fn.apply(receiver, args))
      .then(
        value => {
          if (cache.get(key) === entry) entry.expiresAt = now() + ttlMs;
          return value;
        },
        error => {
          if (cache.get(key) === entry) cache.delete(key);
          throw error;
        }
      );

    cache.set(key, entry);
    return entry.promise;
  }

  memoized.clear = () => cache.clear();
  memoized.delete = (...args) => cache.delete(keyFn(...args));
  memoized.cacheSize = () => cache.size;
  return memoized;
}

if (require.main === module) {
  const assert = require("node:assert/strict");

  (async () => {
    let clock = 100;
    let calls = 0;
    const doubled = memoizeAsync(async value => {
      calls += 1;
      return value * 2;
    }, { ttlMs: 10, now: () => clock });

    const [first, concurrent] = await Promise.all([doubled(4), doubled(4)]);
    assert.equal(first, 8);
    assert.equal(concurrent, 8);
    assert.equal(calls, 1); // same in-flight promise
    clock = 109;
    assert.equal(await doubled(4), 8);
    assert.equal(calls, 1);
    clock = 110; // expiration boundary is exclusive
    assert.equal(await doubled(4), 8);
    assert.equal(calls, 2);

    let attempts = 0;
    const retryable = memoizeAsync(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("temporary failure");
      return "recovered";
    }, { ttlMs: 50, now: () => clock });

    await assert.rejects(retryable(), /temporary failure/);
    assert.equal(await retryable(), "recovered");
    assert.equal(attempts, 2);

    assert.equal(retryable.cacheSize(), 1);
    retryable.clear();
    assert.equal(retryable.cacheSize(), 0);
    console.log("Async memoization tests passed");
  })().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { memoizeAsync };
