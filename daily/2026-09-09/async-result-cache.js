// Daily JavaScript practice — 2026-09-09
// Async result cache with TTL, in-flight request deduplication, and stale fallback.

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function createAsyncCache({ ttl = 1000, staleWhileRevalidate = true } = {}) {
  const entries = new Map();

  async function get(key, loader) {
    const now = Date.now();
    const entry = entries.get(key);

    if (entry?.value !== undefined && now < entry.expiresAt) {
      return entry.value;
    }

    // Reuse an existing promise so concurrent callers do not trigger duplicate work.
    if (entry?.pending) {
      if (staleWhileRevalidate && entry.value !== undefined) {
        return entry.value;
      }
      return entry.pending;
    }

    const pending = Promise.resolve().then(loader);
    entries.set(key, {
      value: entry?.value,
      expiresAt: entry?.expiresAt ?? 0,
      pending
    });

    try {
      const value = await pending;
      entries.set(key, {
        value,
        expiresAt: Date.now() + ttl,
        pending: null
      });
      return value;
    } catch (error) {
      // Keep a previously successful value available when revalidation fails.
      if (entry?.value !== undefined && staleWhileRevalidate) {
        entries.set(key, { ...entry, pending: null });
        return entry.value;
      }
      entries.delete(key);
      throw error;
    }
  }

  function invalidate(key) {
    return entries.delete(key);
  }

  function clear() {
    entries.clear();
  }

  return { get, invalidate, clear };
}

// Example: the second and third callers share the same in-flight request.
let requestCount = 0;
const cache = createAsyncCache({ ttl: 150 });

const fetchUser = async () => {
  requestCount++;
  await sleep(80);
  return { id: 42, name: "Ada" };
};

Promise.all([
  cache.get("user:42", fetchUser),
  cache.get("user:42", fetchUser),
  cache.get("user:42", fetchUser)
])
  .then(users => {
    console.log(users);
    console.log("Loader calls:", requestCount); // 1
  })
  .catch(console.error);
