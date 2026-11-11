/**
 * Exercise: Composable Transducers for Iterables
 *
 * Implement reusable transformations that compose independently of the
 * collection being reduced. Support early termination, stateful transforms,
 * generator cleanup, and both synchronous and asynchronous sources.
 *
 * Run: node daily/2026-11-11/transducerPipeline.js
 */

const assert = require("node:assert/strict");

const REDUCED = Symbol("reduced");

function reduced(value) {
  return { [REDUCED]: true, value };
}

function isReduced(value) {
  return Boolean(value && value[REDUCED] === true);
}

function unreduced(value) {
  return isReduced(value) ? value.value : value;
}

/** Compose transducers left-to-right as a data pipeline. */
function composeT(...transducers) {
  return reducer => transducers.reduceRight((next, transform) => transform(next), reducer);
}

function mapT(project) {
  if (typeof project !== "function") throw new TypeError("mapT expects a function");
  return downstream => ({
    ...downstream,
    step(accumulator, input) {
      return downstream.step(accumulator, project(input));
    }
  });
}

function filterT(predicate) {
  if (typeof predicate !== "function") throw new TypeError("filterT expects a function");
  return downstream => ({
    ...downstream,
    step(accumulator, input) {
      return predicate(input) ? downstream.step(accumulator, input) : accumulator;
    }
  });
}

function takeT(count) {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new RangeError("takeT count must be a positive safe integer");
  }
  return downstream => {
    let remaining = count;
    return {
      ...downstream,
      step(accumulator, input) {
        if (remaining === 0) return reduced(accumulator);
        const next = downstream.step(accumulator, input);
        if (isReduced(next)) return next;
        remaining -= 1;
        return remaining === 0 ? reduced(next) : next;
      }
    };
  };
}

function flatMapT(project) {
  if (typeof project !== "function") throw new TypeError("flatMapT expects a function");
  return downstream => ({
    ...downstream,
    step(accumulator, input) {
      let current = accumulator;
      for (const output of project(input)) {
        current = downstream.step(current, output);
        if (isReduced(current)) return current;
      }
      return current;
    }
  });
}

function dedupeT(keyOf = value => value) {
  return downstream => {
    const seen = new Set();
    return {
      ...downstream,
      step(accumulator, input) {
        const key = keyOf(input);
        if (seen.has(key)) return accumulator;
        seen.add(key);
        return downstream.step(accumulator, input);
      }
    };
  };
}

/** Emit each maximal run of consecutive values sharing the same key. */
function partitionByT(keyOf) {
  if (typeof keyOf !== "function") throw new TypeError("partitionByT expects a key function");
  return downstream => {
    let hasGroup = false;
    let groupKey;
    let group = [];
    return {
      ...downstream,
      step(accumulator, input) {
        const nextKey = keyOf(input);
        if (!hasGroup) {
          hasGroup = true;
          groupKey = nextKey;
          group = [input];
          return accumulator;
        }
        if (Object.is(nextKey, groupKey)) {
          group.push(input);
          return accumulator;
        }
        const next = downstream.step(accumulator, group);
        if (isReduced(next)) return next;
        groupKey = nextKey;
        group = [input];
        return next;
      },
      result(accumulator) {
        let next = accumulator;
        if (hasGroup && group.length) {
          next = downstream.step(next, group);
          next = unreduced(next);
        }
        return downstream.result ? downstream.result(next) : next;
      }
    };
  };
}

/** Emit full overlapping windows; incomplete trailing windows are discarded. */
function windowT(size, stride = 1) {
  if (!Number.isSafeInteger(size) || size < 1 ||
      !Number.isSafeInteger(stride) || stride < 1) {
    throw new RangeError("window size and stride must be positive integers");
  }
  return downstream => {
    const buffer = [];
    return {
      ...downstream,
      step(accumulator, input) {
        buffer.push(input);
        if (buffer.length < size) return accumulator;
        const next = downstream.step(accumulator, buffer.slice(0, size));
        buffer.splice(0, Math.min(stride, buffer.length));
        return next;
      }
    };
  };
}

const arrayReducer = {
  init: () => [],
  step(accumulator, value) {
    accumulator.push(value);
    return accumulator;
  },
  result: accumulator => accumulator
};

function transduce(transform, reducer, initial, iterable) {
  if (!iterable || typeof iterable[Symbol.iterator] !== "function") {
    throw new TypeError("transduce expects a synchronous iterable");
  }
  const transformer = transform(reducer);
  let accumulator = initial === undefined
    ? (reducer.init ? reducer.init() : undefined)
    : initial;

  for (const value of iterable) {
    accumulator = transformer.step(accumulator, value);
    if (isReduced(accumulator)) {
      accumulator = accumulator.value;
      break;
    }
  }
  const result = transformer.result
    ? transformer.result(accumulator)
    : accumulator;
  return unreduced(result);
}

/** Consume an AsyncIterable while keeping the reducer/transducer synchronous. */
async function transduceAsync(transform, reducer, initial, asyncIterable) {
  if (!asyncIterable || typeof asyncIterable[Symbol.asyncIterator] !== "function") {
    throw new TypeError("transduceAsync expects an AsyncIterable");
  }
  const transformer = transform(reducer);
  let accumulator = initial === undefined
    ? (reducer.init ? reducer.init() : undefined)
    : initial;

  for await (const value of asyncIterable) {
    accumulator = transformer.step(accumulator, value);
    if (isReduced(accumulator)) {
      accumulator = accumulator.value;
      break;
    }
  }
  const result = transformer.result
    ? transformer.result(accumulator)
    : accumulator;
  return unreduced(result);
}

function* range(start, end) {
  for (let value = start; value < end; value += 1) yield value;
}

async function* asyncRange(start, end, onClose = () => {}) {
  try {
    for (let value = start; value < end; value += 1) {
      await Promise.resolve();
      yield value;
    }
  } finally {
    onClose();
  }
}

async function runTests() {
  const pipeline = composeT(
    filterT(value => value % 2 === 0),
    mapT(value => value * 3),
    takeT(3)
  );
  let syncClosed = false;
  function* trackedRange() {
    try {
      yield* range(1, 100);
    } finally {
      syncClosed = true;
    }
  }
  assert.deepEqual(transduce(pipeline, arrayReducer, [], trackedRange()), [6, 12, 18]);
  assert.equal(syncClosed, true, "early reduction must close the source iterator");

  const flattened = transduce(
    composeT(
      flatMapT(value => [value, value + 1]),
      dedupeT(),
      filterT(value => value > 1)
    ),
    arrayReducer,
    [],
    [1, 2, 3]
  );
  assert.deepEqual(flattened, [2, 3, 4]);

  const runs = transduce(
    partitionByT(value => value % 2),
    arrayReducer,
    [],
    [1, 3, 2, 4, 5, 7, 6]
  );
  assert.deepEqual(runs, [[1, 3], [2, 4], [5, 7], [6]]);

  const windows = transduce(
    windowT(3, 2),
    arrayReducer,
    [],
    [1, 2, 3, 4, 5, 6]
  );
  assert.deepEqual(windows, [[1, 2, 3], [3, 4, 5]]);

  let asyncClosed = false;
  const asyncResult = await transduceAsync(
    composeT(filterT(value => value % 2 === 1), mapT(value => value ** 2), takeT(3)),
    arrayReducer,
    [],
    asyncRange(1, 100, () => { asyncClosed = true; })
  );
  assert.deepEqual(asyncResult, [1, 9, 25]);
  assert.equal(asyncClosed, true, "async early reduction must call iterator.return()");

  assert.throws(() => takeT(0), /positive/);
  assert.throws(() => windowT(2, 0), /positive/);
  assert.throws(() => transduce(mapT(x => x), arrayReducer, [], 42), /iterable/);
  console.log("transducerPipeline: all tests passed");
}

if (require.main === module) {
  runTests().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  REDUCED,
  reduced,
  isReduced,
  composeT,
  mapT,
  filterT,
  takeT,
  flatMapT,
  dedupeT,
  partitionByT,
  windowT,
  arrayReducer,
  transduce,
  transduceAsync
};
