// Daily JavaScript practice — 2026-09-06
// Async concurrency limiter with retry + exponential backoff.

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runWithRetry(task, retries = 3, baseDelay = 100) {
  let attempt = 0;
  while (true) {
    try {
      return await task();
    } catch (error) {
      if (attempt++ >= retries) throw error;
      await sleep(baseDelay * 2 ** (attempt - 1));
    }
  }
}

async function mapWithConcurrency(items, worker, limit = 2) {
  const results = new Array(items.length);
  let cursor = 0;

  async function consume() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await runWithRetry(() => worker(items[index], index));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, consume)
  );

  return results;
}

const jobs = [1, 2, 3, 4, 5];

mapWithConcurrency(
  jobs,
  async value => {
    await sleep(50);
    if (value === 3 && Math.random() < 0.5) throw new Error("transient failure");
    return value * value;
  },
  2
).then(console.log).catch(console.error);
