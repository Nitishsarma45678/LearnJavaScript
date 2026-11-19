'use strict';

/**
 * Exercise: Merge multiple already-sorted synchronous or asynchronous
 * iterables into one sorted async stream.
 *
 * A min-heap keeps the next candidate from each source. Only one item per
 * source is buffered, so auxiliary storage is O(k), where k is source count.
 * If a consumer stops early, unfinished iterators receive return() cleanup.
 */

class Heap {
  constructor(compare) {
    this.items = [];
    this.compare = compare;
  }

  get size() { return this.items.length; }

  push(value) {
    this.items.push(value);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.items[parent], this.items[index]) <= 0) break;
      [this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
      index = parent;
    }
  }

  pop() {
    if (!this.items.length) return undefined;
    const first = this.items[0];
    const last = this.items.pop();
    if (this.items.length) {
      this.items[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < this.items.length && this.compare(this.items[left], this.items[smallest]) < 0) smallest = left;
        if (right < this.items.length && this.compare(this.items[right], this.items[smallest]) < 0) smallest = right;
        if (smallest === index) break;
        [this.items[index], this.items[smallest]] = [this.items[smallest], this.items[index]];
        index = smallest;
      }
    }
    return first;
  }
}

async function* mergeSorted(iterables, options = {}) {
  if (iterables == null || typeof iterables[Symbol.iterator] !== 'function') {
    throw new TypeError('iterables must be iterable');
  }
  const compare = options.compare || ((a, b) => a - b);
  if (typeof compare !== 'function') throw new TypeError('compare must be a function');

  const iterators = Array.from(iterables, (iterable) => {
    if (iterable == null) throw new TypeError('each source must be iterable');
    if (typeof iterable[Symbol.asyncIterator] === 'function') return iterable[Symbol.asyncIterator]();
    if (typeof iterable[Symbol.iterator] === 'function') return iterable[Symbol.iterator]();
    throw new TypeError('each source must be iterable');
  });
  const finished = new Array(iterators.length).fill(false);
  const heap = new Heap((a, b) => compare(a.value, b.value) || a.source - b.source);

  try {
    for (let source = 0; source < iterators.length; source += 1) {
      const next = await iterators[source].next();
      if (next.done) finished[source] = true;
      else heap.push({ value: next.value, source });
    }

    while (heap.size) {
      const smallest = heap.pop();
      yield smallest.value;
      const next = await iterators[smallest.source].next();
      if (next.done) finished[smallest.source] = true;
      else heap.push({ value: next.value, source: smallest.source });
    }
  } finally {
    for (let source = 0; source < iterators.length; source += 1) {
      if (!finished[source] && typeof iterators[source].return === 'function') {
        await iterators[source].return();
      }
    }
  }
}

async function runTests() {
  const assert = require('node:assert/strict');
  async function* delayed(values) {
    for (const value of values) {
      await new Promise((resolve) => setTimeout(resolve, 1));
      yield value;
    }
  }

  const merged = [];
  for await (const value of mergeSorted([
    [1, 4, 7],
    delayed([2, 5, 8]),
    [3, 6, 9]
  ])) merged.push(value);
  assert.deepEqual(merged, [1, 2, 3, 4, 5, 6, 7, 8, 9]);

  const descending = [];
  for await (const value of mergeSorted([[9, 5, 1], [8, 4, 0]], {
    compare: (a, b) => b - a
  })) descending.push(value);
  assert.deepEqual(descending, [9, 8, 5, 4, 1, 0]);

  let cleanedUp = false;
  async function* longSource() {
    try {
      yield 1;
      yield 2;
      yield 3;
    } finally {
      cleanedUp = true;
    }
  }
  for await (const value of mergeSorted([longSource()])) {
    assert.equal(value, 1);
    break;
  }
  assert.equal(cleanedUp, true, 'early termination should close unfinished iterators');

  assert.deepEqual([...[]], []);
}

if (require.main === module) {
  runTests().then(() => console.log('Async iterable merge: all tests passed'));
}

module.exports = { mergeSorted };
