'use strict';

const assert = require('node:assert/strict');

function toIterator(source) {
  if (source == null) throw new TypeError('source must be iterable');
  if (typeof source[Symbol.asyncIterator] === 'function') {
    return source[Symbol.asyncIterator]();
  }
  if (typeof source[Symbol.iterator] === 'function') {
    return source[Symbol.iterator]();
  }
  throw new TypeError('source must be iterable');
}

function heapPush(heap, value, compare) {
  let index = heap.length;
  heap.push(value);
  while (index > 0) {
    const parent = (index - 1) >> 1;
    if (compare(heap[parent], value) <= 0) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = value;
}

function heapPop(heap, compare) {
  if (heap.length === 0) return undefined;
  const first = heap[0];
  const last = heap.pop();
  if (heap.length > 0) {
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= heap.length) break;
      let child = left;
      if (right < heap.length && compare(heap[right], heap[left]) < 0) child = right;
      if (compare(last, heap[child]) <= 0) break;
      heap[index] = heap[child];
      index = child;
    }
    heap[index] = last;
  }
  return first;
}

/**
 * Merge already-sorted sync or async iterables into one sorted async stream.
 * Only one look-ahead value per source is retained (O(k) extra space).
 * Equal values are stable by source order. All iterators are closed on early
 * consumer cancellation or when any source fails.
 */
async function* mergeSortedAsync(iterables, compare = (a, b) => a - b) {
  if (!Array.isArray(iterables)) throw new TypeError('iterables must be an array');
  if (typeof compare !== 'function') throw new TypeError('compare must be a function');

  const iterators = iterables.map(toIterator);
  const previous = Array(iterators.length);
  const hasPrevious = Array(iterators.length).fill(false);
  const heap = [];
  const compareNodes = (a, b) =>
    compare(a.value, b.value) || a.sourceIndex - b.sourceIndex;

  try {
    const firstSteps = await Promise.all(iterators.map(iterator => iterator.next()));
    firstSteps.forEach((step, sourceIndex) => {
      if (!step.done) {
        previous[sourceIndex] = step.value;
        hasPrevious[sourceIndex] = true;
        heapPush(heap, { value: step.value, sourceIndex }, compareNodes);
      }
    });

    while (heap.length > 0) {
      const node = heapPop(heap, compareNodes);
      yield node.value;

      const { sourceIndex } = node;
      const step = await iterators[sourceIndex].next();
      if (!step.done) {
        if (hasPrevious[sourceIndex] &&
            compare(step.value, previous[sourceIndex]) < 0) {
          throw new Error(`source ${sourceIndex} is not sorted`);
        }
        previous[sourceIndex] = step.value;
        hasPrevious[sourceIndex] = true;
        heapPush(heap, { value: step.value, sourceIndex }, compareNodes);
      }
    }
  } finally {
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

async function runTests() {
  async function* delayed(values) {
    for (const value of values) {
      await Promise.resolve();
      yield value;
    }
  }

  const merged = await collect(mergeSortedAsync([
    delayed([1, 4, 7]),
    [1, 3, 8],
    delayed([2, 5])
  ]));
  assert.deepEqual(merged, [1, 1, 2, 3, 4, 5, 7, 8]);

  let closed = 0;
  async function* tracked() {
    try {
      yield 1;
      yield 2;
      yield 3;
    } finally {
      closed++;
    }
  }
  for await (const value of mergeSortedAsync([tracked()])) {
    assert.equal(value, 1);
    break;
  }
  assert.equal(closed, 1);

  async function* unsorted() {
    yield 2;
    yield 1;
  }
  await assert.rejects(() => collect(mergeSortedAsync([unsorted()])), /not sorted/);
  assert.deepEqual(await collect(mergeSortedAsync([])), []);
}

runTests()
  .then(() => console.log('Sorted async iterable merge tests passed'))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
