/**
 * Run an async mapper with bounded concurrency and AbortSignal support.
 * Result order matches input order, regardless of completion order.
 */
function abortError() {
  const error = new Error("Operation aborted");
  error.name = "AbortError";
  return error;
}

function raceWithSignal(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());

  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(promise).then(
      value => { signal.removeEventListener("abort", onAbort); resolve(value); },
      error => { signal.removeEventListener("abort", onAbort); reject(error); }
    );
  });
}

async function asyncMapLimit(items, limit, mapper, { signal } = {}) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit must be >= 1");
  if (typeof mapper !== "function") throw new TypeError("mapper must be a function");
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      if (signal?.aborted) throw abortError();
      const index = cursor++;
      if (index >= items.length) return;
      const work = Promise.resolve().then(() => mapper(items[index], index, signal));
      results[index] = await raceWithSignal(work, signal);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

(async () => {
  const values = await asyncMapLimit([1, 2, 3, 4], 2,
    async value => value * value);
  console.assert(JSON.stringify(values) === "[1,4,9,16]");

  const controller = new AbortController();
  controller.abort();
  try {
    await asyncMapLimit([1], 1, async value => value, { signal: controller.signal });
    throw new Error("Expected abort");
  } catch (error) {
    console.assert(error.name === "AbortError");
  }
  console.log("abortable async map practice passed");
})().catch(console.error);
