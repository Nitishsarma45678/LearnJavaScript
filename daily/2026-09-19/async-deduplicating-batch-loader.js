/**
 * ASYNC DEDUPLICATING BATCH LOADER
 *
 * Practice challenge:
 * Build a batch loader that combines requests arriving within a short
 * time window, deduplicates repeated keys, limits concurrent batches,
 * retries failed batches, and caches successful results for a TTL.
 *
 * Concepts:
 * - Closures
 * - Higher-order functions
 * - Promises / async-await
 * - Map-based caching and deduplication
 * - Queueing and batching algorithms
 * - Retry with exponential backoff
 */

function createBatchLoader(fetchBatch, options = {}) {
    const {
        batchWindow = 25,
        maxBatchSize = 3,
        concurrency = 2,
        retries = 2,
        cacheTTL = 1000,
        backoff = 50
    } = options;

    const cache = new Map();
    const pending = new Map();
    const queue = [];
    let activeBatches = 0;
    let timer = null;

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    function getCached(key) {
        const entry = cache.get(key);

        if (!entry) return undefined;

        if (Date.now() - entry.time >= cacheTTL) {
            cache.delete(key);
            return undefined;
        }

        return entry.value;
    }

    async function runWithRetry(keys) {
        let attempt = 0;

        while (true) {
            try {
                return await fetchBatch(keys);
            } catch (error) {
                if (attempt >= retries) {
                    throw error;
                }

                const delay = backoff * 2 ** attempt;
                attempt++;
                await sleep(delay);
            }
        }
    }

    function scheduleFlush() {
        if (timer !== null) return;

        timer = setTimeout(() => {
            timer = null;
            flushQueue();
        }, batchWindow);
    }

    function flushQueue() {
        while (activeBatches < concurrency && queue.length > 0) {
            const batch = queue.splice(0, maxBatchSize);
            activeBatches++;
            processBatch(batch).finally(() => {
                activeBatches--;
                flushQueue();
            });
        }
    }

    async function processBatch(batch) {
        let result;

        try {
            result = await runWithRetry(batch.map(item => item.key));

            if (!(result instanceof Map)) {
                throw new TypeError("fetchBatch must return a Map");
            }

            for (const item of batch) {
                if (result.has(item.key)) {
                    const value = result.get(item.key);
                    cache.set(item.key, { value, time: Date.now() });
                    item.resolve(value);
                } else {
                    item.reject(new Error(`Missing result for key: ${item.key}`));
                }
            }
        } catch (error) {
            for (const item of batch) {
                item.reject(error);
            }
        } finally {
            for (const item of batch) {
                pending.delete(item.key);
            }
        }
    }

    return function load(key) {
        const cached = getCached(key);

        if (cached !== undefined) {
            return Promise.resolve(cached);
        }

        if (pending.has(key)) {
            return pending.get(key);
        }

        const promise = new Promise((resolve, reject) => {
            queue.push({ key, resolve, reject });
            scheduleFlush();
        });

        pending.set(key, promise);
        return promise;
    };
}

// ------------------------------------------------------------
// Example usage
// ------------------------------------------------------------

let serverCalls = 0;

async function fakeFetchBatch(keys) {
    serverCalls++;

    console.log("Fetching batch:", keys);
    await new Promise(resolve => setTimeout(resolve, 80));

    const result = new Map();

    for (const key of keys) {
        result.set(key, `User-${key}`);
    }

    return result;
}

const loadUser = createBatchLoader(fakeFetchBatch, {
    batchWindow: 30,
    maxBatchSize: 3,
    concurrency: 2,
    cacheTTL: 2000
});

(async () => {
    const results = await Promise.all([
        loadUser(101),
        loadUser(102),
        loadUser(101),
        loadUser(103),
        loadUser(104)
    ]);

    console.log("Results:", results);
    console.log("Server calls:", serverCalls);

    // This request should come directly from the TTL cache.
    console.log("Cached:", await loadUser(101));
})();
