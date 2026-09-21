// Daily JavaScript Practice — 2026-09-21
// Challenge: Build a retrying, TTL-aware async cache with request deduplication.
// Topics: closures, higher-order functions, async/await, Promise coordination, Map,
//          TTL expiration, exponential backoff, and non-trivial state management.

function createAsyncCache({ ttl = 5000, maxRetries = 2, baseDelay = 100 } = {}) {
    const cache = new Map();
    const pending = new Map();

    const now = () => Date.now();

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    async function withRetry(task, retries = maxRetries) {
        let attempt = 0;

        while (true) {
            try {
                return await task();
            } catch (error) {
                if (attempt >= retries) {
                    throw error;
                }

                const delay = baseDelay * 2 ** attempt;
                attempt++;
                await sleep(delay);
            }
        }
    }

    async function get(key, loader) {
        const cached = cache.get(key);

        if (cached && cached.expiresAt > now()) {
            return cached.value;
        }

        if (cached) {
            cache.delete(key);
        }

        // Deduplicate simultaneous requests for the same key.
        if (pending.has(key)) {
            return pending.get(key);
        }

        const request = withRetry(loader)
            .then(value => {
                cache.set(key, {
                    value,
                    expiresAt: now() + ttl
                });
                return value;
            })
            .finally(() => {
                pending.delete(key);
            });

        pending.set(key, request);
        return request;
    }

    function invalidate(key) {
        return cache.delete(key);
    }

    function clear() {
        cache.clear();
    }

    function stats() {
        let activeEntries = 0;

        for (const entry of cache.values()) {
            if (entry.expiresAt > now()) {
                activeEntries++;
            }
        }

        return {
            cachedEntries: activeEntries,
            pendingRequests: pending.size
        };
    }

    return Object.freeze({ get, invalidate, clear, stats });
}

// Example: the loader fails twice before succeeding.
let attempts = 0;

const cache = createAsyncCache({
    ttl: 3000,
    maxRetries: 3,
    baseDelay: 200
});

const fetchUser = async () => {
    attempts++;

    if (attempts < 3) {
        throw new Error(`Temporary failure #${attempts}`);
    }

    return {
        id: 101,
        name: "Nitish",
        role: "Developer"
    };
};

async function demo() {
    // Both calls share the same in-flight Promise instead of invoking fetchUser twice.
    const [first, second] = await Promise.all([
        cache.get("user:101", fetchUser),
        cache.get("user:101", fetchUser)
    ]);

    console.log(first);
    console.log("Same result:", first === second);
    console.log("Attempts:", attempts);
    console.log("Stats:", cache.stats());

    // This is served directly from the TTL cache.
    const cached = await cache.get("user:101", fetchUser);
    console.log("Cached:", cached);

    cache.invalidate("user:101");
    console.log("After invalidation:", cache.stats());
}

demo().catch(error => console.error("Request failed:", error.message));
