/**
 * Retry an async operation with exponential backoff and optional jitter.
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function retryWithBackoff(task, {
  retries = 3, baseDelayMs = 50, maxDelayMs = 1_000,
  jitter = 0, shouldRetry = () => true, wait = sleep
} = {}) {
  if (typeof task !== "function") throw new TypeError("task must be a function");
  let attempt = 0;

  while (true) {
    try { return await task(attempt); }
    catch (error) {
      if (attempt >= retries || !shouldRetry(error, attempt)) throw error;
      const exponential = Math.min(maxDelayMs, baseDelayMs * (2 ** attempt));
      const spread = exponential * jitter;
      const delay = Math.max(0, exponential - spread + Math.random() * spread * 2);
      await wait(delay);
      attempt++;
    }
  }
}

(async () => {
  let calls = 0;
  const result = await retryWithBackoff(async () => {
    if (++calls < 3) throw new Error("temporary");
    return "ok";
  }, { retries: 3, wait: async () => {} });
  console.assert(result === "ok" && calls === 3);
  console.log("retry backoff practice passed");
})().catch(console.error);
