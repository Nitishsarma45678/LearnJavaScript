/**
 * Map tasks with a maximum number of active workers while preserving result order.
 */
async function mapWithConcurrency(items, limit, mapper) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit must be >= 1");
  if (typeof mapper !== "function") throw new TypeError("mapper must be a function");
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

(async () => {
  const results = await mapWithConcurrency([3, 1, 4, 2], 2, async (n) => n * n);
  console.assert(JSON.stringify(results) === "[9,1,16,4]");
  console.log("concurrency limiter practice passed");
})().catch(console.error);
