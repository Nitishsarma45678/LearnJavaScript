// Map an iterable concurrently while preserving input order and bounding active mapper calls.
// Mapper failures are propagated; iterator.return() is called during cleanup when available.
// Run with: node async-iterator-bounded-prefetch.js
const assert = require("node:assert/strict");

async function* mapAsyncOrdered(iterable, mapper, { concurrency = 4 } = {}) {
  if (iterable == null ||
      (typeof iterable[Symbol.asyncIterator] !== "function" &&
       typeof iterable[Symbol.iterator] !== "function")) {
    throw new TypeError("iterable must be iterable or async iterable");
  }
  if (typeof mapper !== "function") throw new TypeError("mapper must be a function");
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError("concurrency must be a positive integer");
  }

  const iterator = typeof iterable[Symbol.asyncIterator] === "function"
    ? iterable[Symbol.asyncIterator]()
    : iterable[Symbol.iterator]();

  const pending = [];
  let nextIndex = 0;
  let sourceDone = false;

  try {
    while (pending.length > 0 || !sourceDone) {
      while (!sourceDone && pending.length < concurrency) {
        const step = await iterator.next();
        if (step.done) {
          sourceDone = true;
          break;
        }

        const index = nextIndex++;
        // Convert rejection into a value immediately so later tasks cannot create
        // unhandled rejections while an earlier, slower result is being awaited.
        const promise = Promise.resolve()
          .then(() => mapper(step.value, index))
          .then(
            (value) => ({ ok: true, value }),
            (error) => ({ ok: false, error })
          );
        pending.push(promise);
      }

      if (pending.length > 0) {
        const result = await pending.shift();
        if (!result.ok) throw result.error;
        yield result.value;
      }
    }
  } finally {
    if (typeof iterator.return === "function") await iterator.return();
  }
}

async function collect(iterable) {
  const values = [];
  for await (const value of iterable) values.push(value);
  return values;
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function runTests() {
  let active = 0;
  let peak = 0;
  const result = await collect(mapAsyncOrdered([3, 1, 2, 0], async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await delay((4 - value) * 2);
    active -= 1;
    return value * 10;
  }, { concurrency: 2 }));

  assert.deepEqual(result, [30, 10, 20, 0], "output remains in input order");
  assert.equal(peak, 2, "never exceeds the concurrency limit");

  async function* generated() {
    yield 1;
    yield 2;
    yield 3;
  }
  assert.deepEqual(await collect(mapAsyncOrdered(generated(), (value, index) => value + index)), [1, 3, 5]);

  await assert.rejects(
    () => collect(mapAsyncOrdered([1, 2, 3], async (value) => {
      if (value === 2) throw new Error("mapper failed");
      return value;
    }, { concurrency: 2 })),
    /mapper failed/
  );

  assert.deepEqual(await collect(mapAsyncOrdered([], (value) => value)), []);
  assert.throws(() => mapAsyncOrdered([1], (value) => value, { concurrency: 0 }), /concurrency/);
  console.log("mapAsyncOrdered: all assertions passed");
}

runTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
