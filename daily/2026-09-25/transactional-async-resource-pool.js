/**
 * Practice: Transactional Async Resource Pool
 *
 * Build a reusable async resource pool that:
 * - limits concurrent work
 * - queues requests by priority
 * - deduplicates requests for the same resource
 * - retries transient failures
 * - supports cancellation before execution
 * - keeps private state through closures
 * - exposes immutable statistics snapshots
 *
 * Challenge:
 * Complete the missing implementation without changing the public API.
 */

function createResourcePool(resourceLoader, {
  concurrency = 3,
  maxRetries = 2,
  retryDelay = 100
} = {}) {
  if (typeof resourceLoader !== "function") {
    throw new TypeError("resourceLoader must be a function");
  }

  if (concurrency < 1) {
    throw new RangeError("concurrency must be at least 1");
  }

  const queue = [];
  const inFlight = new Map();
  const cache = new Map();

  let active = 0;
  let completed = 0;
  let failed = 0;
  let cancelled = 0;
  let sequence = 0;

  const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

  const snapshotStats = () => Object.freeze({
    queued: queue.length,
    active,
    completed,
    failed,
    cancelled,
    cached: cache.size,
    deduplicated: inFlight.size
  });

  function sortQueue() {
    queue.sort((a, b) =>
      b.priority - a.priority || a.sequence - b.sequence
    );
  }

  async function execute(job) {
    active++;

    try {
      let attempt = 0;

      while (true) {
        try {
          const value = await resourceLoader(job.key, job.signal);

          if (job.signal?.aborted) {
            throw new Error("Operation cancelled");
          }

          cache.set(job.key, value);
          completed++;
          job.resolve(value);
          return;
        } catch (error) {
          if (job.signal?.aborted) {
            cancelled++;
            job.reject(new Error("Operation cancelled"));
            return;
          }

          if (attempt >= maxRetries) {
            failed++;
            job.reject(error);
            return;
          }

          attempt++;

          // Exponential backoff with a small deterministic jitter.
          const jitter = (job.sequence % 7) * 5;
          await sleep(retryDelay * 2 ** (attempt - 1) + jitter);
        }
      }
    } finally {
      active--;
      inFlight.delete(job.key);
      drain();
    }
  }

  function drain() {
    sortQueue();

    while (active < concurrency && queue.length) {
      const job = queue.shift();

      if (job.signal?.aborted) {
        cancelled++;
        job.reject(new Error("Operation cancelled"));
        continue;
      }

      execute(job);
    }
  }

  function load(key, {
    priority = 0,
    signal
  } = {}) {
    if (cache.has(key)) {
      return Promise.resolve(cache.get(key));
    }

    const existing = inFlight.get(key);

    if (existing) {
      return existing.promise;
    }

    const job = {
      key,
      priority,
      signal,
      sequence: sequence++,
      resolve: null,
      reject: null,
      promise: null
    };

    job.promise = new Promise((resolve, reject) => {
      job.resolve = resolve;
      job.reject = reject;
    });

    inFlight.set(key, job);
    queue.push(job);
    drain();

    return job.promise;
  }

  function invalidate(key) {
    return cache.delete(key);
  }

  function clear() {
    cache.clear();
  }

  return Object.freeze({
    load,
    invalidate,
    clear,
    stats: snapshotStats
  });
}

// Example resource loader.
let attempts = 0;

async function loadUser(userId, signal) {
  if (signal?.aborted) {
    throw new Error("Aborted");
  }

  await new Promise(resolve => setTimeout(resolve, 75));

  attempts++;

  // Simulate a transient failure.
  if (attempts % 4 === 1) {
    throw new Error("Temporary upstream failure");
  }

  return {
    id: userId,
    name: "User " + userId
  };
}

const pool = createResourcePool(loadUser, {
  concurrency: 2,
  maxRetries: 2,
  retryDelay: 50
});

const controller = new AbortController();

Promise.all([
  pool.load("101", { priority: 1 }),
  pool.load("102", { priority: 5 }),
  pool.load("101", { priority: 10 }), // deduplicated
  pool.load("103", { priority: 2 }),
  pool.load("104", { priority: 3, signal: controller.signal })
])
  .then(results => console.log("Results:", results))
  .catch(error => console.error("Pool error:", error))
  .finally(() => {
    console.log("Stats:", pool.stats());
  });

// Uncomment to test cancellation before the queued job starts.
// controller.abort();
