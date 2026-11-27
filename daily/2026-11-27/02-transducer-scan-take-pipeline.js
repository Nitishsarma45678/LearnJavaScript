'use strict';

// Exercise: compose transformations without allocating intermediate arrays.
// A reduced value stops the source loop immediately.

const REDUCED = Symbol('reduced');
const reduced = value => ({ [REDUCED]: true, value });
const isReduced = value => Boolean(value && value[REDUCED]);

const mapT = fn => step => (acc, value) => step(acc, fn(value));
const filterT = predicate => step => (acc, value) =>
  predicate(value) ? step(acc, value) : acc;
const takeT = count => {
  if (!Number.isInteger(count) || count < 0) throw new RangeError('count must be non-negative');
  return step => {
    let seen = 0;
    return (acc, value) => {
      if (seen >= count) return reduced(acc);
      seen += 1;
      const next = step(acc, value);
      return seen >= count ? reduced(next) : next;
    };
  };
};
const tapT = effect => step => (acc, value) => {
  effect(value);
  return step(acc, value);
};

function compose(...functions) {
  return value => functions.reduceRight((current, fn) => fn(current), value);
}

function transduce(source, transformer, reducer, initial) {
  const step = transformer(reducer);
  let acc = initial;
  for (const item of source) {
    const next = step(acc, item);
    if (isReduced(next)) {
      acc = next.value;
      break;
    }
    acc = next;
  }
  return reducer.result ? reducer.result(acc) : acc;
}

function intoArray(...transformers) {
  const reducer = (acc, value) => {
    acc.push(value);
    return acc;
  };
  return source => transduce(source, compose(...transformers), reducer, []);
}

const assert = require('node:assert/strict');
const visited = [];
const pipeline = intoArray(
  mapT(value => value * value),
  filterT(value => value % 2 === 0),
  tapT(value => visited.push(value)),
  takeT(2)
);
assert.deepEqual(pipeline([1, 2, 3, 4, 5, 6]), [4, 16]);
assert.deepEqual(visited, [4, 16]);
assert.deepEqual(intoArray(mapT(x => x + 1))([]), []);
assert.deepEqual(intoArray(takeT(0))([1, 2]), []);
assert.throws(() => takeT(-1), RangeError);
console.log('Transducer tests passed');

module.exports = { mapT, filterT, takeT, tapT, compose, transduce, intoArray };
