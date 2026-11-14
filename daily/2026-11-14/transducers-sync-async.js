/**
 * Composable Transducers for Sync and Async Iterables
 * ---------------------------------------------------
 * Implement map, filter, take, and flatMap as reducer transformations.
 * The same composition can drive synchronous iteration or asynchronous
 * pipelines with awaited mapping, predicates, reducers, and flat-mapping.
 *
 * Reduced values provide short-circuit termination. Both drivers close their
 * source iterator when processing stops early or throws.
 *
 * Run: node transducers-sync-async.js
 */
'use strict';

const assert = require('node:assert/strict');

const REDUCED = Symbol('reduced');

function reduced(value) {
  return { [REDUCED]: true, value };
}

function isReduced(value) {
  return Boolean(value && value[REDUCED] === true);
}

function composeT(...transducers) {
  return (reducer) =>
    transducers.reduceRight((next, transform) => transform(next), reducer);
}

function mapT(mapper) {
  if (typeof mapper !== 'function') throw new TypeError('mapper must be a function');
  return (reducer) => (accumulator, value) =>
    reducer(accumulator, mapper(value));
}

function filterT(predicate) {
  if (typeof predicate !== 'function') throw new TypeError('predicate must be a function');
  return (reducer) => (accumulator, value) =>
    predicate(value) ? reducer(accumulator, value) : accumulator;
}

function takeT(count) {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError('takeT count must be a positive integer');
  }
  return (reducer) => {
    let seen = 0;
    return (accumulator, value) => {
      if (seen >= count) return reduced(accumulator);
      seen += 1;
      const next = reducer(accumulator, value);
      return seen >= count ? reduced(next) : next;
    };
  };
}

function flatMapT(project) {
  if (typeof project !== 'function') throw new TypeError('project must be a function');
  return (reducer) => (accumulator, value) => {
    let current = accumulator;
    for (const item of project(value)) {
      current = reducer(current, item);
      if (isReduced(current)) return current;
    }
    return current;
  };
}

function mapAsyncT(mapper) {
  if (typeof mapper !== 'function') throw new TypeError('mapper must be a function');
  return (reducer) => async (accumulator, value) =>
    reducer(accumulator, await mapper(value));
}

function filterAsyncT(predicate) {
  if (typeof predicate !== 'function') throw new TypeError('predicate must be a function');
  return (reducer) => async (accumulator, value) =>
    await predicate(value) ? reducer(accumulator, value) : accumulator;
}

function flatMapAsyncT(project) {
  if (typeof project !== 'function') throw new TypeError('project must be a function');
  return (reducer) => async (accumulator, value) => {
    const produced = await project(value);
    let current = accumulator;
    for await (const item of produced) {
      current = await reducer(current, item);
      if (isReduced(current)) return current;
    }
    return current;
  };
}

function transduce(transducer, reducer, initial, iterable) {
  if (typeof reducer !== 'function') throw new TypeError('reducer must be a function');
  if (!iterable || typeof iterable[Symbol.iterator] !== 'function') {
    throw new TypeError('iterable must implement Symbol.iterator');
  }

  const step = transducer(reducer);
  const iterator = iterable[Symbol.iterator]();
  let accumulator = initial;
  let completed = false;

  try {
    while (true) {
      const item = iterator.next();
      if (item.done) {
        completed = true;
        break;
      }
      const next = step(accumulator, item.value);
      if (isReduced(next)) {
        accumulator = next.value;
        break;
      }
      accumulator = next;
    }
    return accumulator;
  } finally {
    if (!completed && typeof iterator.return === 'function') iterator.return();
  }
}

async function asyncTransduce(
  transducer,
  reducer,
  initial,
  iterable,
  { signal } = {}
) {
  if (typeof reducer !== 'function') throw new TypeError('reducer must be a function');

  const hasAsyncIterator = iterable &&
    typeof iterable[Symbol.asyncIterator] === 'function';
  const hasSyncIterator = iterable &&
    typeof iterable[Symbol.iterator] === 'function';
  if (!hasAsyncIterator && !hasSyncIterator) {
    throw new TypeError('iterable must be sync or async iterable');
  }

  const iterator = hasAsyncIterator
    ? iterable[Symbol.asyncIterator]()
    : iterable[Symbol.iterator]();
  const step = transducer(reducer);
  let accumulator = initial;
  let completed = false;

  try {
    while (true) {
      if (signal && signal.aborted) {
        throw signal.reason instanceof Error
          ? signal.reason
          : new Error('Async transduction aborted');
      }

      const item = await iterator.next();

      if (signal && signal.aborted) {
        throw signal.reason instanceof Error
          ? signal.reason
          : new Error('Async transduction aborted');
      }
      if (item.done) {
        completed = true;
        break;
      }

      const next = await step(accumulator, item.value);
      if (isReduced(next)) {
        accumulator = await next.value;
        break;
      }
      accumulator = next;
    }
    return accumulator;
  } finally {
    if (!completed && typeof iterator.return === 'function') {
      await iterator.return();
    }
  }
}

function intoArray(transducer, iterable) {
  return transduce(
    transducer,
    (accumulator, value) => {
      accumulator.push(value);
      return accumulator;
    },
    [],
    iterable
  );
}

// ---------------------------------------------------------------------------
// Examples and tests
// ---------------------------------------------------------------------------

const syncPipeline = composeT(
  mapT((value) => value * 2),
  filterT((value) => value % 4 === 0),
  takeT(3)
);
assert.deepEqual(intoArray(syncPipeline, [1, 2, 3, 4, 5, 6, 7]), [4, 8, 12]);

const expanded = composeT(
  flatMapT((value) => [value, value * 10]),
  filterT((value) => value % 2 === 0),
  takeT(4)
);
assert.deepEqual(intoArray(expanded, [1, 2, 3, 4]), [10, 2, 20, 4]);

let syncClosed = false;
function* syncSource() {
  try {
    yield 1;
    yield 2;
    yield 3;
    yield 4;
  } finally {
    syncClosed = true;
  }
}
assert.deepEqual(intoArray(composeT(takeT(2)), syncSource()), [1, 2]);
assert.equal(syncClosed, true, 'early termination must close the sync iterator');

async function runTests() {
  let asyncClosed = false;
  async function* asyncSource() {
    try {
      yield 1;
      yield 2;
      yield 3;
      yield 4;
    } finally {
      asyncClosed = true;
    }
  }

  const asyncPipeline = composeT(
    mapAsyncT(async (value) => value * 2),
    filterAsyncT(async (value) => value > 2),
    takeT(2)
  );
  const values = await asyncTransduce(
    asyncPipeline,
    async (accumulator, value) => {
      accumulator.push(value);
      return accumulator;
    },
    [],
    asyncSource()
  );
  assert.deepEqual(values, [4, 6]);
  assert.equal(asyncClosed, true, 'early termination must close the async iterator');

  const flattened = await asyncTransduce(
    composeT(
      flatMapAsyncT(async (value) => [value, value + 10]),
      takeT(3)
    ),
    (accumulator, value) => {
      accumulator.push(value);
      return accumulator;
    },
    [],
    [1, 2, 3]
  );
  assert.deepEqual(flattened, [1, 11, 2]);

  const controller = new AbortController();
  controller.abort(new Error('stop now'));
  await assert.rejects(
    asyncTransduce(
      composeT(mapT((value) => value)),
      (accumulator, value) => accumulator + value,
      0,
      [1, 2, 3],
      { signal: controller.signal }
    ),
    /stop now/
  );

  await assert.rejects(
    asyncTransduce(
      composeT(mapAsyncT(async () => { throw new Error('mapper failed'); })),
      (accumulator, value) => accumulator + value,
      0,
      [1]
    ),
    /mapper failed/
  );

  console.log('Sync/async transducer tests passed.');
}

runTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
