// Merge already-sorted sync or async iterables in ascending order.
// A min-heap keeps the next candidate from each source, so memory is O(k)
// apart from the iterators' own buffers. Equal values are stable by source index.

class MinHeap {
  constructor(compare) {
    this.items = [];
    this.compare = compare;
  }
  size() { return this.items.length; }
  push(value) {
    const items = this.items;
    items.push(value);
    let index = items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(items[parent], value) <= 0) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = value;
  }
  pop() {
    if (this.items.length === 0) return undefined;
    const root = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= this.items.length) break;
        let child = left;
        if (right < this.items.length && this.compare(this.items[right], this.items[left]) < 0) {
          child = right;
        }
        if (this.compare(last, this.items[child]) <= 0) break;
        this.items[index] = this.items[child];
        index = child;
      }
      this.items[index] = last;
    }
    return root;
  }
}

function defaultCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

async function* mergeSorted(iterables, compare = defaultCompare) {
  if (!Array.isArray(iterables)) throw new TypeError('iterables must be an array');
  if (typeof compare !== 'function') throw new TypeError('compare must be a function');

  const iterators = [];
  const heap = new MinHeap((a, b) => compare(a.value, b.value) || a.sourceIndex - b.sourceIndex);
  try {
    for (const source of iterables) {
      if (source == null) throw new TypeError('each source must be iterable');
      const iterator = typeof source[Symbol.asyncIterator] === 'function'
        ? source[Symbol.asyncIterator]()
        : typeof source[Symbol.iterator] === 'function'
          ? source[Symbol.iterator]()
          : null;
      if (!iterator || typeof iterator.next !== 'function') {
        throw new TypeError('each source must provide an iterator');
      }
      iterators.push(iterator);
    }

    const firstItems = await Promise.all(iterators.map(iterator => iterator.next()));
    for (let sourceIndex = 0; sourceIndex < firstItems.length; sourceIndex += 1) {
      const item = firstItems[sourceIndex];
      if (!item.done) heap.push({ value: item.value, sourceIndex });
    }

    while (heap.size() > 0) {
      const smallest = heap.pop();
      yield smallest.value;
      const next = await iterators[smallest.sourceIndex].next();
      if (!next.done) heap.push({ value: next.value, sourceIndex: smallest.sourceIndex });
    }
  } finally {
    // Closing all sources also handles consumers that stop the merged stream early.
    await Promise.allSettled(iterators.map(iterator =>
      typeof iterator.return === 'function' ? iterator.return() : undefined
    ));
  }
}

async function collect(iterable) {
  const values = [];
  for await (const value of iterable) values.push(value);
  return values;
}

const assert = require('node:assert/strict');

async function* delayed(values) {
  for (const value of values) {
    await Promise.resolve();
    yield value;
  }
}

(async () => {
  assert.deepEqual(await collect(mergeSorted([
    [1, 4, 7],
    delayed([2, 2, 8]),
    [0, 3, 9]
  ])), [0, 1, 2, 2, 3, 4, 7, 8, 9]);

  assert.deepEqual(await collect(mergeSorted([])), []);
  assert.deepEqual(await collect(mergeSorted([[], [1], [], [2, 3]])), [1, 2, 3]);

  const byKey = (a, b) => a.key - b.key;
  const merged = await collect(mergeSorted([
    [{ key: 1, source: 'A' }, { key: 2, source: 'A' }],
    [{ key: 1, source: 'B' }]
  ], byKey));
  assert.deepEqual(merged.map(item => item.source), ['A', 'B', 'A']);

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
  for await (const value of mergeSorted([tracked()])) {
    assert.equal(value, 1);
    break;
  }
  assert.equal(closed, true, 'early consumer exit should close source iterators');
  await assert.rejects(async () => collect(mergeSorted([null])), TypeError);

  console.log('async iterable merge tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
