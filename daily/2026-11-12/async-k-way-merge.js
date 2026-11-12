/**
 * Stable k-way merge for sorted sync or async iterables.
 *
 * Only one value per input is buffered. After yielding the smallest value,
 * the corresponding iterator alone is advanced. Equal keys are ordered by
 * source index, making ties deterministic and stable across input streams.
 *
 * Early consumer termination closes every iterator. An AbortSignal is checked
 * while waiting for next(), and sortedness can be validated per source.
 *
 * Run: node async-k-way-merge.js
 */

class MinHeap {
  constructor(compare) {
    this.items = [];
    this.compare = compare;
  }

  get size() {
    return this.items.length;
  }

  push(value) {
    const items = this.items;
    items.push(value);
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.compare(items[parent], value) <= 0) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = value;
  }

  pop() {
    if (this.items.length === 0) return undefined;
    const items = this.items;
    const root = items[0];
    const last = items.pop();
    if (items.length > 0) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= items.length) break;
        let child = left;
        if (right < items.length &&
            this.compare(items[right], items[left]) < 0) {
          child = right;
        }
        if (this.compare(last, items[child]) <= 0) break;
        items[index] = items[child];
        index = child;
      }
      items[index] = last;
    }
    return root;
  }
}

function defaultCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function makeAbortError(reason) {
  const error = new Error(reason instanceof Error ? reason.message : "The operation was aborted");
  error.name = "AbortError";
  if (reason !== undefined) error.cause = reason;
  return error;
}

function toIterator(source) {
  if (source && typeof source[Symbol.asyncIterator] === "function") {
    return source[Symbol.asyncIterator]();
  }
  if (source && typeof source[Symbol.iterator] === "function") {
    return source[Symbol.iterator]();
  }
  throw new TypeError("each source must be iterable or async iterable");
}

function nextWithAbort(iterator, signal) {
  if (!signal) return Promise.resolve().then(() => iterator.next());
  if (signal.aborted) return Promise.reject(makeAbortError(signal.reason));
  if (typeof signal.addEventListener !== "function") {
    return Promise.reject(new TypeError("signal must be an AbortSignal"));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const onAbort = () => finish(reject, makeAbortError(signal.reason));

    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }
    Promise.resolve()
      .then(() => iterator.next())
      .then(
        (value) => finish(resolve, value),
        (error) => finish(reject, error)
      );
  });
}

async function* mergeSortedAsync(sources, options = {}) {
  if (!sources || typeof sources[Symbol.iterator] !== "function") {
    throw new TypeError("sources must be an iterable of iterables");
  }

  const compare = options.compare || defaultCompare;
  const signal = options.signal;
  const verifySorted = options.verifySorted !== false;
  if (typeof compare !== "function") throw new TypeError("compare must be a function");

  const iterators = Array.from(sources, toIterator);
  const lastValues = new Array(iterators.length);
  const hasLastValue = new Array(iterators.length).fill(false);
  const compareEntries = (a, b) => {
    const result = compare(a.value, b.value);
    if (!Number.isFinite(result)) throw new TypeError("compare must return a finite number");
    return result || a.sourceIndex - b.sourceIndex;
  };
  const heap = new MinHeap(compareEntries);

  try {
    const firstValues = await Promise.all(
      iterators.map((iterator) => nextWithAbort(iterator, signal))
    );

    for (let sourceIndex = 0; sourceIndex < firstValues.length; sourceIndex += 1) {
      const item = firstValues[sourceIndex];
      if (!item.done) {
        lastValues[sourceIndex] = item.value;
        hasLastValue[sourceIndex] = true;
        heap.push({ value: item.value, sourceIndex });
      }
    }

    while (heap.size > 0) {
      if (signal?.aborted) throw makeAbortError(signal.reason);
      const smallest = heap.pop();
      yield smallest.value;

      const sourceIndex = smallest.sourceIndex;
      const next = await nextWithAbort(iterators[sourceIndex], signal);
      if (next.done) continue;

      if (verifySorted && hasLastValue[sourceIndex] &&
          compare(next.value, lastValues[sourceIndex]) < 0) {
        throw new RangeError("input source " + sourceIndex + " is not sorted");
      }

      lastValues[sourceIndex] = next.value;
      hasLastValue[sourceIndex] = true;
      heap.push({ value: next.value, sourceIndex });
    }
  } finally {
    await Promise.allSettled(iterators.map((iterator) => {
      return typeof iterator.return === "function" ? iterator.return() : undefined;
    }));
  }
}

async function collect(iterable) {
  const values = [];
  for await (const value of iterable) values.push(value);
  return values;
}

async function runTests() {
  const assert = require("node:assert/strict");

  async function* delayed(values) {
    for (const value of values) {
      await Promise.resolve();
      yield value;
    }
  }

  assert.deepEqual(
    await collect(mergeSortedAsync([
      [1, 4, 7],
      delayed([2, 5, 8]),
      [0, 3, 9]
    ])),
    [0, 1, 2, 3, 4, 5, 7, 8, 9]
  );

  const objects = await collect(mergeSortedAsync([
    [{ key: 1, source: "A" }, { key: 2, source: "A" }],
    [{ key: 1, source: "B" }, { key: 2, source: "B" }]
  ], { compare: (a, b) => a.key - b.key }));
  assert.deepEqual(objects.map((item) => item.source), ["A", "B", "A", "B"]);
  assert.deepEqual(await collect(mergeSortedAsync([])), []);

  await assert.rejects(
    () => collect(mergeSortedAsync([[1, 4, 2]])),
    /not sorted/
  );
  await assert.rejects(
    () => collect(mergeSortedAsync([42])),
    TypeError
  );

  let closed = false;
  async function* tracked() {
    try {
      yield 1;
      yield 2;
      yield 3;
    } finally {
      closed = true;
    }
  }
  for await (const value of mergeSortedAsync([tracked()])) {
    assert.equal(value, 1);
    break;
  }
  assert.equal(closed, true);

  const controller = new AbortController();
  controller.abort("test cancellation");
  await assert.rejects(
    () => collect(mergeSortedAsync([[1, 2, 3]], { signal: controller.signal })),
    { name: "AbortError" }
  );

  console.log("Async k-way merge tests passed");
}

module.exports = { mergeSortedAsync, MinHeap };

if (require.main === module) {
  runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
