"use strict";

/*
 * Composable synchronous transducers.
 *
 * Transducers transform reducers rather than collections, so intermediate
 * arrays are not allocated. Stateful operators keep their state in closures.
 * A Reduced wrapper signals early termination and lets for..of close the
 * underlying iterator (including generator finally blocks).
 */

const REDUCED = Symbol("reduced");

function reduced(value) {
  return { [REDUCED]: true, value };
}

function isReduced(value) {
  return value !== null && typeof value === "object" && value[REDUCED] === true;
}

function unreduced(value) {
  return isReduced(value) ? value.value : value;
}

function mapT(project) {
  if (typeof project !== "function") throw new TypeError("project must be a function");
  return (step) => (accumulator, input) => step(accumulator, project(input));
}

function filterT(predicate) {
  if (typeof predicate !== "function") throw new TypeError("predicate must be a function");
  return (step) => (accumulator, input) =>
    predicate(input) ? step(accumulator, input) : accumulator;
}

function dropT(count) {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError("drop count must be a non-negative integer");
  }

  return (step) => {
    let remaining = count;
    return (accumulator, input) => {
      if (remaining > 0) {
        remaining -= 1;
        return accumulator;
      }
      return step(accumulator, input);
    };
  };
}

function takeT(count) {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError("take count must be a positive integer");
  }

  return (step) => {
    let remaining = count;

    return (accumulator, input) => {
      if (remaining === 0) return reduced(accumulator);
      remaining -= 1;

      const next = step(accumulator, input);
      if (isReduced(next)) return next;
      return remaining === 0 ? reduced(next) : next;
    };
  };
}

function takeWhileT(predicate) {
  if (typeof predicate !== "function") throw new TypeError("predicate must be a function");

  return (step) => (accumulator, input) => {
    if (!predicate(input)) return reduced(accumulator);
    return step(accumulator, input);
  };
}

function flatMapT(project) {
  if (typeof project !== "function") throw new TypeError("project must be a function");

  return (step) => (accumulator, input) => {
    const outputs = project(input);
    if (outputs == null || typeof outputs[Symbol.iterator] !== "function") {
      throw new TypeError("flatMapT project must return an iterable");
    }

    let next = accumulator;
    for (const output of outputs) {
      next = step(next, output);
      if (isReduced(next)) return next;
    }
    return next;
  };
}

function distinctByT(keyOf = (value) => value) {
  if (typeof keyOf !== "function") throw new TypeError("keyOf must be a function");

  return (step) => {
    const seen = new Set();
    return (accumulator, input) => {
      const key = keyOf(input);
      if (seen.has(key)) return accumulator;
      seen.add(key);
      return step(accumulator, input);
    };
  };
}

function composeT(...transducers) {
  for (const transducer of transducers) {
    if (typeof transducer !== "function") {
      throw new TypeError("Every transducer must be a function");
    }
  }

  // The first listed transducer is the first operation applied to each input.
  return (step) => transducers.reduceRight(
    (nextStep, transducer) => transducer(nextStep),
    step
  );
}

function transduce(transducer, reducer, initialValue, iterable) {
  if (typeof transducer !== "function" || typeof reducer !== "function") {
    throw new TypeError("transducer and reducer must be functions");
  }
  if (iterable == null || typeof iterable[Symbol.iterator] !== "function") {
    throw new TypeError("iterable must be synchronous and iterable");
  }

  const step = transducer(reducer);
  let accumulator = initialValue;

  for (const input of iterable) {
    accumulator = step(accumulator, input);
    if (isReduced(accumulator)) {
      accumulator = unreduced(accumulator);
      break;
    }
  }

  return accumulator;
}

function intoArray(transducer, iterable) {
  return transduce(
    transducer,
    (result, value) => {
      result.push(value);
      return result;
    },
    [],
    iterable
  );
}

module.exports = {
  reduced,
  isReduced,
  mapT,
  filterT,
  dropT,
  takeT,
  takeWhileT,
  flatMapT,
  distinctByT,
  composeT,
  transduce,
  intoArray
};

if (require.main === module) {
  const assert = require("node:assert/strict");

  const pipeline = composeT(
    mapT((value) => value * 2),
    filterT((value) => value % 3 === 0),
    takeT(2)
  );
  assert.deepEqual(intoArray(pipeline, [1, 3, 4, 6, 9]), [6, 12]);

  const expanded = composeT(
    flatMapT((value) => [value, value + 1]),
    distinctByT((value) => value % 3),
    dropT(1)
  );
  assert.deepEqual(intoArray(expanded, [1, 4, 7, 8]), [2, 3]);

  assert.deepEqual(
    intoArray(takeWhileT((value) => value < 5), [1, 2, 4, 5, 6]),
    [1, 2, 4]
  );

  let closed = false;
  function* source() {
    try {
      yield 10;
      yield 20;
      yield 30;
      yield 40;
    } finally {
      closed = true;
    }
  }

  assert.deepEqual(intoArray(takeT(2), source()), [10, 20]);
  assert.equal(closed, true);

  const sum = transduce(
    composeT(filterT((value) => value > 0), mapT((value) => value * value)),
    (total, value) => total + value,
    0,
    [-2, 1, 2, 3]
  );
  assert.equal(sum, 14);

  assert.throws(() => takeT(0), RangeError);
  assert.throws(() => mapT(null), TypeError);

  console.log("Transducer pipeline with early termination: all tests passed");
}
