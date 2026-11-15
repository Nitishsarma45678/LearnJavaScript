/**
 * Stable Merge of Sorted Sync/Async Iterables
 * -------------------------------------------
 * Merge k individually sorted iterables into one globally sorted async stream.
 * The implementation keeps one head per source in a binary min-heap, so it
 * uses O(k) auxiliary memory and performs O(log k) work per emitted value.
 *
 * Equal values are stable: values from the lower source index are emitted
 * first. The generator closes unfinished iterators when cancelled or when the
 * consumer stops early.
 */

'use strict';

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
        if (right < items.length && this.compare(items[right], items[left]) < 0) {
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

function abortReason(signal) {
  if (signal && signal.reason instanceof Error) return signal.reason;
  const error = new Error('The merge operation was aborted');
  error.name = 'AbortError';
  return error;
}

function nextWithAbort(iterator, signal) {
  const pending = Promise.resolve().then(() => iterator.next());
  if (!signal) return pending;
  if (signal.aborted) return Promise.reject(abortReason(signal));

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(abortReason(signal));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    pending.then(
      value => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
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

async function* mergeSortedAsync(sources, options = {}) {
  const {
    compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0),
    signal
  } = options;

  if (typeof compare !== 'function') throw new TypeError('compare must be a function');
  if (signal !== undefined && (
    !signal || typeof signal.addEventListener !== 'function' ||
    typeof signal.removeEventListener !== 'function'
  )) {
    throw new TypeError('signal must be an AbortSignal');
  }

  const iterators = [];
  const active = [];
  const heapCompare = (a, b) => {
    const order = compare(a.value, b.value);
    if (!Number.isFinite(order)) throw new TypeError('comparator must return a finite number');
    return order || a.sourceIndex - b.sourceIndex;
  };
  const heap = new MinHeap(heapCompare);

  try {
    for (const source of sources) {
      if (source == null) throw new TypeError('every source must be iterable');
      const factory = source[Symbol.asyncIterator] || source[Symbol.iterator];
      if (typeof factory !== 'function') throw new TypeError('every source must be iterable');
      const iterator = factory.call(source);
      if (!iterator || typeof iterator.next !== 'function') {
        throw new TypeError('iterator must provide next()');
      }
      iterators.push(iterator);
      active.push(true);
    }

    const firstSteps = await Promise.all(
      iterators.map(iterator => nextWithAbort(iterator, signal))
    );

    for (let i = 0; i < firstSteps.length; i += 1) {
      const step = firstSteps[i];
      if (step.done) {
        active[i] = false;
      } else {
        heap.push({ value: step.value, sourceIndex: i });
      }
    }

    while (heap.size > 0) {
      if (signal && signal.aborted) throw abortReason(signal);
      const entry = heap.pop();
      yield entry.value;

      // Defer advancing this source until the consumer requests another value.
      // This makes early return cheap and avoids unnecessary reads.
      const step = await nextWithAbort(iterators[entry.sourceIndex], signal);
      if (step.done) {
        active[entry.sourceIndex] = false;
      } else {
        heap.push({ value: step.value, sourceIndex: entry.sourceIndex });
      }
    }
  } finally {
    const closing = iterators.map((iterator, index) => {
      if (!active[index] || typeof iterator.return !== 'function') return Promise.resolve();
      active[index] = false;
      return Promise.resolve().then(() => iterator.return());
    });
    await Promise.allSettled(closing);
  }
}

async function runTests() {
  const assert = require('node:assert/strict');

  const asyncValues = async function* (values) {
    for (const value of values) {
      await Promise.resolve();
      yield value;
    }
  };

  const merged = [];
  for await (const value of mergeSortedAsync([
    [1, 4, 7, 10],
    asyncValues([1, 3, 8]),
    [2, 5, 9]
  ])) merged.push(value);
  assert.deepEqual(merged, [1, 1, 2, 3, 4, 5, 7, 8, 9, 10]);

  const stable = [];
  for await (const value of mergeSortedAsync(
    [['a', 'c'], ['a', 'b']],
    { compare: (a, b) => a.localeCompare(b) }
  )) stable.push(value);
  assert.deepEqual(stable, ['a', 'a', 'b', 'c']);

  let closed = false;
  async function* tracked() {
    try {
      yield 2;
      yield 4;
    } finally {
      closed = true;
    }
  }
  const iterator = mergeSortedAsync([tracked(), [1, 3]])[Symbol.asyncIterator]();
  assert.deepEqual(await iterator.next(), { value: 1, done: false });
  await iterator.return();
  assert.equal(closed, true);

  const controller = new AbortController();
  controller.abort(new Error('stop now'));
  const cancelled = mergeSortedAsync([[1, 2]], { signal: controller.signal })[Symbol.asyncIterator]();
  await assert.rejects(cancelled.next(), /stop now/);

  const empty = [];
  for await (const value of mergeSortedAsync([[], asyncValues([])])) empty.push(value);
  assert.deepEqual(empty, []);
  await assert.rejects(async () => {
    for await (const value of mergeSortedAsync([[1, 2]], {
      compare: () => NaN
    })) void value;
  }, /finite number/);

  console.log('async-merge-sorted-iterables: all tests passed');
}

if (require.main === module) {
  runTests().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { mergeSortedAsync };
