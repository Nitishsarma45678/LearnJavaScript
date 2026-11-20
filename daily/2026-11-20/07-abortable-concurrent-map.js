// Exercise: Map an array with a concurrency limit, stable result ordering, and cancellation.
// A mapper receives (value, index, AbortSignal). First failure aborts remaining work.
// Run: node daily/2026-11-20/07-abortable-concurrent-map.js
"use strict";
const assert = require("node:assert/strict");
function abortReason(signal) {
  return signal.reason instanceof Error ? signal.reason : new Error("operation aborted");
}
async function mapConcurrent(items, mapper, { concurrency = 4, signal } = {}) {
  if (!Array.isArray(items)) throw new TypeError("items must be an array");
  if (typeof mapper !== "function") throw new TypeError("mapper must be a function");
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError("concurrency must be positive");
  if (signal?.aborted) throw abortReason(signal);
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(signal.reason);
  signal?.addEventListener("abort", forwardAbort, { once: true });
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (!controller.signal.aborted) {
      const index = nextIndex++;
      if (index >= items.length) return;
      try {
        results[index] = await mapper(items[index], index, controller.signal);
      } catch (error) {
        if (!controller.signal.aborted) controller.abort(error);
        throw error;
      }
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    if (controller.signal.aborted) throw abortReason(controller.signal);
    return results;
  } finally {
    signal?.removeEventListener("abort", forwardAbort);
  }
}
(async () => {
  let active = 0, peak = 0;
  const values = await mapConcurrent([5, 4, 3, 2, 1], async (value, index) => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, (5 - value) * 3));
    active--;
    return value * index;
  }, { concurrency: 2 });
  assert.deepEqual(values, [0, 4, 6, 6, 4]);
  assert.equal(peak, 2, "worker count must respect the limit");
  await assert.rejects(
    mapConcurrent([1, 2, 3], async value => {
      if (value === 2) throw new Error("mapper failed");
      await new Promise(resolve => setTimeout(resolve, 2));
      return value;
    }, { concurrency: 2 }),
    /mapper failed/
  );
  const alreadyAborted = new AbortController();
  alreadyAborted.abort(new Error("cancelled before start"));
  await assert.rejects(mapConcurrent([1], x => x, { signal: alreadyAborted.signal }), /cancelled before start/);
  assert.deepEqual(await mapConcurrent([], async x => x), []);
  console.log("abortable concurrent map: all tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
