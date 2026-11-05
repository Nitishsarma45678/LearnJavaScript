"use strict";

/*
 * Stable k-way merge for sorted synchronous or asynchronous iterables.
 *
 * Only one look-ahead value is held per source, so memory usage is O(k),
 * where k is the number of input streams. Equal values are emitted in
 * source order. If the consumer stops early or a source fails, all remaining
 * iterators receive return() so generator finally blocks can run.
 *
 * Every source must already be sorted according to the supplied comparator.
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
    let index = items.length;
    items.push(value);

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
    const result = items[0];
    const last = items.pop();

    if (items.length > 0) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= items.length) break;

        let child = left;
        if (right < items.length && this.compare(items[right], items[left]) < 0) {
          child = right;
        }
        if (this.compare(last, items[child]) <= 0) break;

        items[index] = items[child];
        index = child;
      }
      items[index] = last;
    }

    return result;
  }
}

function defaultCompare(a, b) {
  if (Object.is(a, b)) return 0;
  return a < b ? -1 : 1;
}

async function* mergeSorted(iterables, compare = defaultCompare) {
  if (!Array.isArray(iterables)) {
    throw new TypeError("iterables must be an array");
  }
  if (typeof compare !== "function") {
    throw new TypeError("compare must be a function");
  }

  const states = [];
  const heap = new MinHeap((a, b) => {
    const order = compare(a.value, b.value);
    return order === 0 ? a.index - b.index : order;
  });

  try {
    for (const source of iterables) {
      if (source == null) throw new TypeError("Every source must be iterable");

      const iterator =
        typeof source[Symbol.asyncIterator] === "function"
          ? source[Symbol.asyncIterator]()
          : source[Symbol.iterator]();

      if (!iterator || typeof iterator.next !== "function") {
        throw new TypeError("Source did not produce an iterator");
      }

      states.push({ iterator, index: states.length, done: false });
    }

    // Start all first reads together so a slow first stream does not block
    // initialization of later streams.
    const initial = await Promise.all(states.map(async (state) => {
      try {
        return { state, step: await state.iterator.next() };
      } catch (error) {
        return { state, error };
      }
    }));

    const failed = initial.find((entry) => entry.error);
    if (failed) throw failed.error;

    for (const { state, step } of initial) {
      if (step.done) {
        state.done = true;
      } else {
        heap.push({ value: step.value, index: state.index, state });
      }
    }

    while (heap.size > 0) {
      const current = heap.pop();
      yield current.value;

      const step = await current.state.iterator.next();
      if (step.done) {
        current.state.done = true;
      } else {
        heap.push({
          value: step.value,
          index: current.state.index,
          state: current.state
        });
      }
    }
  } finally {
    const closing = states
      .filter((state) => !state.done && typeof state.iterator.return === "function")
      .map(async (state) => {
        state.done = true;
        await state.iterator.return();
      });

    // Cleanup errors must not hide the original source error or consumer exit.
    await Promise.allSettled(closing);
  }
}

module.exports = { mergeSorted, MinHeap, defaultCompare };

if (require.main === module) {
  const assert = require("node:assert/strict");

  async function* delayed(values) {
    for (const value of values) {
      await Promise.resolve();
      yield value;
    }
  }

  async function* tracked(values, index, closed) {
    try {
      for (const value of values) {
        await Promise.resolve();
        yield value;
      }
    } finally {
      closed[index] = true;
    }
  }

  async function runTests() {
    const merged = [];
    for await (const value of mergeSorted([
      [1, 4, 7],
      delayed([1, 3, 9]),
      [2, 6]
    ])) {
      merged.push(value);
    }
    assert.deepEqual(merged, [1, 1, 2, 3, 4, 6, 7, 9]);

    const stable = [];
    for await (const value of mergeSorted([[1, 3], [1, 2]])) {
      stable.push(value);
    }
    assert.deepEqual(stable, [1, 1, 2, 3]);

    const closed = [false, false];
    const first = tracked([1, 3, 5], 0, closed);
    const second = tracked([2, 4, 6], 1, closed);
    for await (const value of mergeSorted([first, second])) {
      assert.equal(value, 1);
      break;
    }
    assert.deepEqual(closed, [true, true]);

    const custom = [];
    for await (const value of mergeSorted(
      [["b", "d"], ["a", "c"]],
      (a, b) => a.localeCompare(b)
    )) {
      custom.push(value);
    }
    assert.deepEqual(custom, ["a", "b", "c", "d"]);

    await assert.rejects(async () => {
      for await (const ignored of mergeSorted([null])) void ignored;
    }, TypeError);
  }

  runTests().then(
    () => console.log("Async iterable k-way merge: all tests passed"),
    (error) => {
      console.error(error);
      process.exitCode = 1;
    }
  );
}
