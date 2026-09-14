// Practice: retryable async queue with bounded concurrency and exponential backoff.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runWithRetry(task, options = {}) {
  const retries = options.retries ?? 3;
  const baseDelay = options.baseDelay ?? 25;

  for (let attempt = 0; ; attempt++) {
    try {
      return await task();
    } catch (error) {
      if (attempt >= retries) throw error;
      await sleep(baseDelay * 2 ** attempt);
    }
  }
}

async function processQueue(tasks, { concurrency = 2, retries = 2 } = {}) {
  const results = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= tasks.length) return;

      results[index] = await runWithRetry(tasks[index], { retries });
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    () => worker()
  );

  await Promise.all(workers);
  return results;
}

const attempts = new Map();
const tasks = [
  async () => "A completed",
  async () => {
    const count = (attempts.get("B") ?? 0) + 1;
    attempts.set("B", count);
    if (count < 3) throw new Error("B temporary failure");
    return "B completed after retry";
  },
  async () => "C completed",
];

processQueue(tasks, { concurrency: 2, retries: 3 })
  .then(console.log)
  .catch(console.error);
