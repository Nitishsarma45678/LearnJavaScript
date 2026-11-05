"use strict";

const assert = require("node:assert/strict");

function getIterator(iterable) {
  if (iterable == null) throw new TypeError("iterable is required");
  const asyncMethod = iterable[Symbol.asyncIterator];
  const syncMethod = iterable[Symbol.iterator];
  const method = typeof asyncMethod === "function" ? asyncMethod : syncMethod;
  if (typeof method !== "function") throw new TypeError("value is not iterable");
  return method.call(iterable);
}

function abortError(signal) {
  return signal.reason ?? new Error("parallelMap aborted");
}

function awaitWithSignal(promise, signal) {
  if (signal.aborted) return Promise.reject(abortError(signal));

  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      cleanup();
      reject(abortError(signal));
    };

    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      }
    );
  });
}

/**
 * Map an iterable with bounded parallelism.
 *
 * ordered=true (default) yields in input order. ordered=false yields in
 * completion order. The source is pulled only while a worker slot is free,
 * so a slow consumer applies backpressure instead of causing unbounded work.
 *
 * Mapper signature: mapper(value, index, { signal }). Cancellation is
 * cooperative: mapper implementations should observe the supplied signal.
 */
async function* parallelMap(
  iterable,
  mapper,
  { concurrency = 4, ordered = true, signal: externalSignal } = {}
) {
  if (typeof mapper !== "function") throw new TypeError("mapper must be a function");
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError("concurrency must be a positive integer");
  }
  if (externalSignal !== undefined &&
      (!externalSignal || typeof externalSignal.addEventListener !== "function")) {
    throw new TypeError("signal must be an AbortSignal");
  }

  const iterator = getIterator(iterable);
  const controller = new AbortController();
  const signal = controller.signal;
  const pending = new Map();

  let sourceDone = false;
  let nextIndex = 0;
  let nextOrderedIndex = 0;

  const abortFromOutside = () => controller.abort(abortError(externalSignal));
  if (externalSignal) {
    if (externalSignal.aborted) abortFromOutside();
    else externalSignal.addEventListener("abort", abortFromOutside, { once: true });
  }

  const throwIfAborted = () => {
    if (signal.aborted) throw abortError(signal);
  };

  const fill = async () => {
    while (!sourceDone && pending.size < concurrency) {
      throwIfAborted();
      const step = await awaitWithSignal(Promise.resolve(iterator.next()), signal);

      if (step.done) {
        sourceDone = true;
        break;
      }

      const index = nextIndex;
      nextIndex += 1;

      // Convert rejection into a fulfilled record so every in-flight task has
      // a handler immediately, even if an earlier ordered result is pending.
      const task = Promise.resolve()
        .then(() => mapper(step.value, index, { signal }))
        .then(
          (value) => ({ index, ok: true, value }),
          (error) => ({ index, ok: false, error })
        );

      pending.set(index, task);
    }
  };

  try {
    await fill();

    while (pending.size > 0) {
      throwIfAborted();

      let settled;
      if (ordered) {
        const task = pending.get(nextOrderedIndex);
        if (!task) throw new Error("internal ordering invariant was violated");
        settled = await awaitWithSignal(task, signal);
        pending.delete(nextOrderedIndex);
        nextOrderedIndex += 1;
      } else {
        settled = await awaitWithSignal(Promise.race(pending.values()), signal);
        pending.delete(settled.index);
      }

      if (!settled.ok) throw settled.error;
      yield settled.value;
      await fill();
    }
  } finally {
    controller.abort(new Error("parallelMap iteration stopped"));

    if (externalSignal) {
      externalSignal.removeEventListener("abort", abortFromOutside);
    }
    if (!sourceDone && typeof iterator.return === "function") {
      await iterator.return();
    }
  }
}

async function collect(iterable) {
  const values = [];
  for await (const value of iterable) values.push(value);
  return values;
}

async function runTests() {
  const ordered = await collect(parallelMap(
    [3, 1, 2],
    async (value) => {
      await Promise.resolve();
      return value * 2;
    },
    { concurrency: 2 }
  ));
  assert.deepEqual(ordered, [6, 2, 4]);

  let active = 0;
  let peak = 0;
  const bounded = await collect(parallelMap(
    [1, 2, 3, 4, 5, 6],
    async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return value;
    },
    { concurrency: 2 }
  ));
  assert.deepEqual(bounded, [1, 2, 3, 4, 5, 6]);
  assert.equal(peak, 2);

  const unordered = await collect(parallelMap(
    [1, 2, 3, 4],
    async (value) => value * 10,
    { concurrency: 3, ordered: false }
  ));
  assert.deepEqual(unordered.slice().sort((a, b) => a - b), [10, 20, 30, 40]);

  await assert.rejects(
    () => collect(parallelMap(
      [1, 2, 3],
      async (value) => {
        if (value === 2) throw new Error("worker failed");
        return value;
      },
      { concurrency: 2 }
    )),
    /worker failed/
  );

  let workerSignal;
  const iterator = parallelMap(
    [7, 8, 9],
    async (value, index, context) => {
      workerSignal = context.signal;
      await Promise.resolve();
      return value + index;
    },
    { concurrency: 3 }
  );
  assert.deepEqual(await iterator.next(), { value: 7, done: false });
  await iterator.return();
  assert.equal(workerSignal.aborted, true);

  assert.deepEqual(await collect(parallelMap([], async (value) => value)), []);
  await assert.rejects(
    () => collect(parallelMap([1], async (value) => value, { concurrency: 0 })),
    /concurrency/
  );
}

runTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

module.exports = { parallelMap };
