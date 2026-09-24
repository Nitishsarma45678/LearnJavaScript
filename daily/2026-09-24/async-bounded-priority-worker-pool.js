/**
 * Practice: Async Bounded Priority Worker Pool
 *
 * Build a reusable worker pool that combines:
 * - closures for private queue/state
 * - higher-order task factories
 * - async/await and Promise coordination
 * - priority scheduling
 * - bounded concurrency
 * - retries with exponential backoff
 * - cancellation of queued work
 * - execution statistics
 *
 * Challenge:
 * Keep at most `concurrency` tasks running at once. Higher-priority
 * tasks should run first, while tasks with the same priority preserve
 * FIFO order. A task may retry after failure without exceeding the
 * concurrency limit.
 */

function createWorkerPool({ concurrency = 2, retryLimit = 2, backoffMs = 100 } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new TypeError("concurrency must be a positive integer");
  }

  const queue = [];
  const jobs = new Map();
  let active = 0;
  let sequence = 0;
  let completed = 0;
  let failed = 0;
  let cancelled = 0;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function sortQueue() {
    queue.sort((a, b) => b.priority - a.priority || a.sequence - b.sequence);
  }

  function schedule() {
    while (active < concurrency && queue.length) {
      const job = queue.shift();
      if (job.cancelled) continue;
      run(job);
    }
  }

  async function run(job) {
    active++;
    job.state = "running";

    try {
      while (job.attempt <= retryLimit) {
        try {
          job.attempt++;
          const value = await job.task(job.attempt);

          job.state = "fulfilled";
          job.resolve(value);
          completed++;
          return;
        } catch (error) {
          if (job.attempt > retryLimit) {
            job.state = "rejected";
            job.reject(error);
            failed++;
            return;
          }

          await sleep(backoffMs * 2 ** (job.attempt - 1));
        }
      }
    } finally {
      active--;
      jobs.delete(job.id);
      schedule();
    }
  }

  function submit(task, { priority = 0 } = {}) {
    if (typeof task !== "function") {
      throw new TypeError("task must be a function");
    }

    const id = `job-${++sequence}`;

    let resolve;
    let reject;

    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });

    const job = {
      id,
      task,
      priority,
      sequence,
      attempt: 0,
      state: "queued",
      cancelled: false,
      resolve,
      reject
    };

    jobs.set(id, job);
    queue.push(job);
    sortQueue();
    schedule();

    return {
      id,
      promise,
      cancel() {
        if (job.state !== "queued") return false;

        job.cancelled = true;
        job.state = "cancelled";
        jobs.delete(id);
        cancelled++;
        reject(new Error(`Job ${id} was cancelled`));
        schedule();
        return true;
      }
    };
  }

  return {
    submit,

    stats() {
      return {
        queued: queue.filter(job => !job.cancelled).length,
        active,
        trackedJobs: jobs.size,
        completed,
        failed,
        cancelled
      };
    }
  };
}

// Example: a flaky asynchronous operation.
const pool = createWorkerPool({
  concurrency: 2,
  retryLimit: 2,
  backoffMs: 50
});

const makeTask = (name, failuresBeforeSuccess) => {
  let failures = 0;

  return async attempt => {
    await new Promise(resolve => setTimeout(resolve, 80));

    if (failures++ < failuresBeforeSuccess) {
      throw new Error(`${name} failed on attempt ${attempt}`);
    }

    return `${name} completed on attempt ${attempt}`;
  };
};

const low = pool.submit(makeTask("low", 0), { priority: 1 });
const high = pool.submit(makeTask("high", 1), { priority: 10 });
const medium = pool.submit(makeTask("medium", 0), { priority: 5 });
const cancelled = pool.submit(makeTask("cancelled", 0), { priority: 2 });

cancelled.cancel();

Promise.allSettled([
  low.promise,
  high.promise,
  medium.promise,
  cancelled.promise
]).then(results => {
  console.table(results);
  console.log("Pool statistics:", pool.stats());
});
