/**
 * Practice: Async Deduplicating Task Pool
 *
 * Build a reusable async task pool that combines:
 * - closures for private state
 * - higher-order functions
 * - Promise-based concurrency control
 * - task deduplication by key
 * - retries with exponential backoff
 * - priority scheduling
 * - failure isolation and statistics
 *
 * Challenge:
 * Multiple callers requesting the same key should share one in-flight
 * Promise instead of starting duplicate work. Independent tasks should
 * respect the configured concurrency limit.
 */

function createTaskPool({ concurrency = 2, retries = 2, backoffMs = 100 } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new TypeError("concurrency must be a positive integer");
  }

  const queue = [];
  const pending = new Map();
  const stats = {
    completed: 0,
    failed: 0,
    deduplicated: 0,
    retries: 0
  };

  let active = 0;
  let sequence = 0;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  const runWithRetry = async task => {
    let attempt = 0;

    while (true) {
      try {
        return await task();
      } catch (error) {
        if (attempt >= retries) {
          throw error;
        }

        attempt++;
        stats.retries++;
        await sleep(backoffMs * 2 ** (attempt - 1));
      }
    }
  };

  const pump = () => {
    while (active < concurrency && queue.length > 0) {
      queue.sort((a, b) => b.priority - a.priority || a.sequence - b.sequence);

      const job = queue.shift();
      active++;

      runWithRetry(job.task)
        .then(value => {
          stats.completed++;
          job.resolve(value);
        })
        .catch(error => {
          stats.failed++;
          job.reject(error);
        })
        .finally(() => {
          active--;
          pending.delete(job.key);
          pump();
        });
    }
  };

  const submit = (key, task, priority = 0) => {
    if (typeof task !== "function") {
      throw new TypeError("task must be a function");
    }

    const existing = pending.get(key);
    if (existing) {
      stats.deduplicated++;
      return existing;
    }

    const promise = new Promise((resolve, reject) => {
      queue.push({
        key,
        task,
        priority,
        sequence: sequence++,
        resolve,
        reject
      });
    });

    pending.set(key, promise);
    pump();

    return promise;
  };

  return {
    submit,

    getStats() {
      return {
        ...stats,
        active,
        queued: queue.length,
        pending: pending.size
      };
    },

    clearQueued() {
      while (queue.length) {
        const job = queue.shift();
        pending.delete(job.key);
        job.reject(new Error("Queued task cancelled"));
      }
    }
  };
}

// Example
const pool = createTaskPool({
  concurrency: 2,
  retries: 2,
  backoffMs: 50
});

let attempts = 0;

const fetchUser = async () => {
  attempts++;

  if (attempts < 2) {
    throw new Error("Temporary network failure");
  }

  await new Promise(resolve => setTimeout(resolve, 100));
  return { id: 42, name: "Nitish" };
};

(async () => {
  const first = pool.submit("user:42", fetchUser, 10);
  const duplicate = pool.submit("user:42", fetchUser, 100);

  console.log("Shared promise:", first === duplicate);
  console.log("User:", await first);
  console.log("Stats:", pool.getStats());
})();
