/**
 * Async stale-while-revalidate cache
 *
 * Practice goals:
 * - Return cached values immediately while refreshing stale entries.
 * - Deduplicate concurrent refreshes for the same key.
 * - Avoid caching failed refreshes and preserve a stale value on refresh failure.
 * - Support per-entry TTL and explicit invalidation.
 *
 * Run with Node.js: node async-stale-while-revalidate-cache.js
 */

class AsyncSWRCache {
  constructor({ ttlMs = 5_000, staleMs = 30_000, now = Date.now } = {}) {
    if (ttlMs < 0 || staleMs < 0) {
      throw new RangeError("ttlMs and staleMs must be non-negative");
    }

    this.ttlMs = ttlMs;
    this.staleMs = staleMs;
    this.now = now;
    this.entries = new Map();
    this.inFlight = new Map();
  }

  async get(key, loader) {
    if (typeof loader !== "function") {
      throw new TypeError("loader must be a function");
    }

    const entry = this.entries.get(key);
    const time = this.now();

    if (entry && time < entry.freshUntil) {
      return entry.value;
    }

    if (entry && time < entry.staleUntil) {
      // Kick off one background refresh, but do not delay the stale response.
      this.#refresh(key, loader).catch(() => {});
      return entry.value;
    }

    // No usable value remains. The caller must wait for the refresh.
    return this.#refresh(key, loader);
  }

  async #refresh(key, loader) {
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const refreshPromise = (async () => {
      const value = await loader();
      const storedAt = this.now();

      this.entries.set(key, {
        value,
        freshUntil: storedAt + this.ttlMs,
        staleUntil: storedAt + this.ttlMs + this.staleMs,
      });

      return value;
    })();

    this.inFlight.set(key, refreshPromise);

    try {
      return await refreshPromise;
    } catch (error) {
      // Keep any stale entry on failure; if there was no entry, nothing is cached.
      throw error;
    } finally {
      // Only delete the promise we registered; this guards against future refactors
      // where an entry for the same key could be replaced while work is pending.
      if (this.inFlight.get(key) === refreshPromise) {
        this.inFlight.delete(key);
      }
    }
  }

  invalidate(key) {
    this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
  }

  get size() {
    return this.entries.size;
  }
}

// Demo: concurrent cold reads share one loader call, then stale reads return fast.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function demo() {
  let loads = 0;
  const cache = new AsyncSWRCache({ ttlMs: 20, staleMs: 200 });

  const loader = async () => {
    loads += 1;
    await sleep(30);
    return { version: loads };
  };

  const [first, second] = await Promise.all([
    cache.get("profile:42", loader),
    cache.get("profile:42", loader),
  ]);

  console.log("Cold reads deduplicated:", first.version === second.version);
  console.log("Loader calls after cold reads:", loads);

  await sleep(25); // entry is stale, but still inside its stale window
  const stale = await cache.get("profile:42", loader);
  console.log("Stale value returned immediately:", stale.version);
  await sleep(40); // allow background refresh to finish

  const fresh = await cache.get("profile:42", loader);
  console.log("Refreshed value:", fresh.version);
  console.log("Total loader calls:", loads);

  cache.invalidate("profile:42");
  console.log("Cache size after invalidation:", cache.size);
}

demo().catch((error) => {
  console.error("Demo failed:", error);
  process.exitCode = 1;
});
