/*
 * Lazy K-Way Merge of Sorted Async Iterables
 * -------------------------------------------
 * Merge any mixture of synchronous and asynchronous sorted iterables using
 * a binary min-heap. At most one value per source is buffered, so memory is
 * O(k) for k sources. Pulling from a source happens only when the consumer
 * asks for another merged value. Equal values are stable by source index.
 *
 * Each source must be sorted according to compare. An AbortSignal cancels
 * pending reads where possible, and iterator.return() is called for cleanup.
 */

"use strict";

const assert = require("node:assert/strict");

function makeAbortError(reason) {
  const error = new Error(
    reason instanceof Error ? reason.message : "The merge was aborted"
  );
  error.name = "AbortError";
  return error;
}

function toIterator(source) {
  if (source && typeof source[Symbol.asyncIterator] === "function") {
    return source[Symbol.asyncIterator]();
  }
  if (source && typeof source[Symbol.iterator] === "function") {
    return source[Symbol.iterator]();
  }
  throw new TypeError("Every source must be iterable or async iterable");
}

function nextWithSignal(iterator, signal) {
  if (!signal) {
    return Promise.resolve().then(() => iterator.next());
  }
  if (signal.aborted) {
    return Promise.reject(makeAbortError(signal.reason));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(makeAbortError(signal.reason));
    };

    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve()
      .then(() => iterator.next())
      .then(
        step => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(step);
        },
        error => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        }
      );
  });
}

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
      const parent = (index - 1) >>> 1;
      if (this.compare(items[parent], value) <= 0) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = value;
  }

  pop() {
    if (this.items.length === 0) return undefined;
    const items = this.items;
    const minimum = items[0];
    const last = items.pop();

    if (items.length > 0) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= items.length) break;

        let child = left;
        if (
          right < items.length &&
          this.compare(items[right], items[left]) < 0
        ) {
          child = right;
        }
        if (this.compare(last, items[child]) <= 0) break;
        items[index] = items[child];
        index = child;
      }
      items[index] = last;
    }

    return minimum;
  }
}

async function* mergeSortedAsync(sources, {
  compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0),
  signal
} = {}) {
  if (typeof compare !== "function") {
    throw new TypeError("compare must be a function");
  }

  const iterators = Array.from(sources, toIterator);
  const lastValues = new Array(iterators.length);
  const hasLast = new Array(iterators.length).fill(false);
  const heap = new MinHeap((a, b) => {
    const order = compare(a.value, b.value);
    return order === 0 ? a.sourceIndex - b.sourceIndex : order;
  });

  async function pull(sourceIndex) {
    const step = await nextWithSignal(iterators[sourceIndex], signal);
    if (!step || typeof step.done !== "boolean") {
      throw new TypeError("Iterator next() must return an iterator result");
    }
    if (step.done) return;

    if (
      hasLast[sourceIndex] &&
      compare(step.value, lastValues[sourceIndex]) < 0
    ) {
      throw new RangeError("An input source is not sorted");
    }

    hasLast[sourceIndex] = true;
    lastValues[sourceIndex] = step.value;
    heap.push({ value: step.value, sourceIndex });
  }

  try {
    await Promise.all(iterators.map((_, index) => pull(index)));

    while (heap.size > 0) {
      if (signal && signal.aborted) {
        throw makeAbortError(signal.reason);
      }

      const item = heap.pop();
      yield item.value;
      await pull(item.sourceIndex);
    }
  } finally {
    // Closing every iterator is important when a consumer breaks early.
    await Promise.allSettled(
      iterators.map(iterator => {
        if (typeof iterator.return === "function") {
          return iterator.return();
        }
        return undefined;
      })
    );
  }
}

async function collect(iterable) {
  const values = [];
  for await (const value of iterable) values.push(value);
  return values;
}

async function runTests() {
  assert.deepEqual(
    await collect(mergeSortedAsync([
      [1, 4, 9],
      [1, 3, 8],
      [],
      [2, 7]
    ])),
    [1, 1, 2, 3, 4, 7, 8, 9]
  );

  async function* delayed(values) {
    for (const value of values) {
      await Promise.resolve();
      yield value;
    }
  }

  assert.deepEqual(
    await collect(mergeSortedAsync([
      delayed([0, 5, 10]),
      [2, 4, 12]
    ])),
    [0, 2, 4, 5, 10, 12]
  );

  // Equal keys are stable by source index.
  assert.deepEqual(
    await collect(mergeSortedAsync([
      [{ key: 1, source: "A" }, { key: 1, source: "A" }],
      [{ key: 1, source: "B" }]
    ], {
      compare: (a, b) => a.key - b.key
    })).then(items => items.map(item => item.source)),
    ["A", "A", "B"]
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

  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(
    collect(mergeSortedAsync([[1, 2]], { signal: aborted.signal })),
    { name: "AbortError" }
  );

  await assert.rejects(
    collect(mergeSortedAsync([[1, 3, 2]])),
    /not sorted/
  );

  assert.deepEqual(await collect(mergeSortedAsync([])), []);
  console.log("mergeSortedAsync: all tests passed");
}

module.exports = { mergeSortedAsync };

if (require.main === module) {
  runTests().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
