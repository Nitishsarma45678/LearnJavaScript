'use strict';

// Exercise: implement an external merge sort over an async iterable.
// Sorted chunks are delegated to storage adapters; only one head per run
// is kept in the merge heap. The adapter can represent files or object storage.

const assert = require('node:assert/strict');

class MinHeap {
  constructor(compare) { this.items = []; this.compare = compare; }
  push(value) {
    const a = this.items;
    a.push(value);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.compare(a[p], value) <= 0) break;
      a[i] = a[p];
      i = p;
    }
    a[i] = value;
  }
  pop() {
    const a = this.items;
    if (!a.length) return null;
    const first = a[0], last = a.pop();
    if (a.length) {
      let i = 0;
      while (true) {
        let child = i * 2 + 1;
        if (child >= a.length) break;
        if (child + 1 < a.length && this.compare(a[child + 1], a[child]) < 0) child += 1;
        if (this.compare(last, a[child]) <= 0) break;
        a[i] = a[child];
        i = child;
      }
      a[i] = last;
    }
    return first;
  }
  get size() { return this.items.length; }
}

async function* asAsync(iterable) {
  if (iterable?.[Symbol.asyncIterator]) {
    yield* iterable;
  } else if (iterable?.[Symbol.iterator]) {
    yield* iterable;
  } else {
    throw new TypeError('run reader must return an iterable');
  }
}

async function* externalMergeSort(source, {
  chunkSize = 1000,
  compare = (a, b) => a - b,
  writeRun,
  readRun,
  deleteRun = async () => {}
} = {}) {
  if (!source?.[Symbol.asyncIterator] || !Number.isInteger(chunkSize) || chunkSize < 1 ||
      typeof compare !== 'function' || typeof writeRun !== 'function' ||
      typeof readRun !== 'function' || typeof deleteRun !== 'function') {
    throw new TypeError('source, chunkSize, comparator, and run storage adapters are required');
  }

  const runIds = [];
  let chunk = [];
  async function flush() {
    if (!chunk.length) return;
    chunk.sort(compare);
    const id = await writeRun(chunk);
    runIds.push(id);
    chunk = [];
  }

  try {
    for await (const value of source) {
      chunk.push(value);
      if (chunk.length === chunkSize) await flush();
    }
    await flush();

    const heap = new MinHeap((a, b) =>
      compare(a.value, b.value) || a.runIndex - b.runIndex);
    const iterators = [];
    for (let runIndex = 0; runIndex < runIds.length; runIndex += 1) {
      const iterator = asAsync(await readRun(runIds[runIndex]))[Symbol.asyncIterator]();
      iterators.push(iterator);
      const first = await iterator.next();
      if (!first.done) heap.push({ value: first.value, runIndex });
    }

    while (heap.size) {
      const entry = heap.pop();
      yield entry.value;
      const next = await iterators[entry.runIndex].next();
      if (!next.done) heap.push({ value: next.value, runIndex: entry.runIndex });
    }
  } finally {
    await Promise.allSettled(runIds.map((id) => deleteRun(id)));
  }
}

async function demo() {
  const storage = new Map();
  let nextId = 0;
  const source = async function* () {
    for (const value of [8, 1, 7, 2, 6, 3, 5, 4, 2]) yield value;
  };
  const result = [];
  for await (const value of externalMergeSort(source(), {
    chunkSize: 3,
    writeRun: async (values) => {
      const id = nextId++;
      storage.set(id, [...values]);
      return id;
    },
    readRun: async (id) => storage.get(id),
    deleteRun: async (id) => storage.delete(id)
  })) result.push(value);

  assert.deepEqual(result, [1, 2, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(storage.size, 0);
  assert.deepEqual([...await (async () => {
    const values = [];
    for await (const x of externalMergeSort((async function*(){ yield 3; yield 1; })(), {
      chunkSize: 1,
      writeRun: async (items) => { const id = nextId++; storage.set(id, items); return id; },
      readRun: async (id) => storage.get(id),
      deleteRun: async (id) => storage.delete(id)
    })) values.push(x);
    return values;
  })()], [1, 3]);
}

if (require.main === module) demo().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

module.exports = { externalMergeSort, MinHeap };
