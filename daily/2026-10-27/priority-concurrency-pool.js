/**
 * Exercise: Run async jobs with a concurrency limit and priority ordering.
 * Higher priority jobs start first; equal priorities preserve input order.
 * A job is { priority: number, run: (signal) => Promise|value }.
 * A failure or abort rejects the pool and prevents queued jobs from starting.
 */

function runPriorityPool(jobs, options) {
  const settings = options || {};
  const concurrency = settings.concurrency === undefined ? 2 : settings.concurrency;
  const signal = settings.signal;

  if (!Number.isInteger(concurrency) || concurrency < 1) {
    return Promise.reject(new RangeError("concurrency must be a positive integer"));
  }
  if (!Array.isArray(jobs)) {
    return Promise.reject(new TypeError("jobs must be an array"));
  }
  for (const job of jobs) {
    if (!job || typeof job.run !== "function" || !Number.isFinite(job.priority)) {
      return Promise.reject(new TypeError("Each job needs a finite priority and run function"));
    }
  }
  if (signal && signal.aborted) {
    return Promise.reject(signal.reason || new Error("Operation aborted"));
  }
  if (jobs.length === 0) return Promise.resolve([]);

  return new Promise((resolve, reject) => {
    const queue = jobs.map((job, index) => ({ job, index }))
      .sort((a, b) => b.job.priority - a.job.priority || a.index - b.index);
    const results = new Array(jobs.length);
    let active = 0;
    let completed = 0;
    let settled = false;

    const cleanup = () => {
      if (signal) signal.removeEventListener("abort", onAbort);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error || new Error("Operation failed"));
    };
    const onAbort = () => fail(signal.reason || new Error("Operation aborted"));

    const pump = () => {
      if (settled) return;
      if (completed === jobs.length) {
        settled = true;
        cleanup();
        resolve(results);
        return;
      }

      while (!settled && active < concurrency && queue.length > 0) {
        const item = queue.shift();
        active += 1;
        Promise.resolve()
          .then(() => item.job.run(signal))
          .then((value) => {
            if (settled) return;
            results[item.index] = value;
            active -= 1;
            completed += 1;
            pump();
          }, fail);
      }
    };

    if (signal) signal.addEventListener("abort", onAbort, { once: true });
    pump();
  });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function testPriorityPool() {
  const startOrder = [];
  const jobs = [
    { priority: 1, run: async () => { startOrder.push("low"); await delay(2); return "L"; } },
    { priority: 9, run: async () => { startOrder.push("high"); await delay(2); return "H"; } },
    { priority: 5, run: async () => { startOrder.push("mid"); await delay(2); return "M"; } }
  ];
  const results = await runPriorityPool(jobs, { concurrency: 1 });
  if (startOrder.join(",") !== "high,mid,low") {
    throw new Error("Priority order incorrect: " + startOrder.join(","));
  }
  if (results.join(",") !== "L,H,M") {
    throw new Error("Results must retain input order: " + results.join(","));
  }

  let invalidConcurrencyRejected = false;
  try { await runPriorityPool([], { concurrency: 0 }); }
  catch (error) { invalidConcurrencyRejected = error instanceof RangeError; }
  if (!invalidConcurrencyRejected) throw new Error("Invalid concurrency should reject");

  let failureRejected = false;
  try {
    await runPriorityPool([
      { priority: 2, run: async () => { throw new Error("expected"); } },
      { priority: 1, run: async () => "not reached" }
    ], { concurrency: 1 });
  } catch (error) { failureRejected = error.message === "expected"; }
  if (!failureRejected) throw new Error("Job failure should reject the pool");

  console.log("Priority concurrency pool: all tests passed.");
}

testPriorityPool().catch((error) => {
  console.error(error);
  if (typeof process !== "undefined") process.exitCode = 1;
});
