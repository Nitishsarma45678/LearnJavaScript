// Exercise: Implement composable map/filter/take transducers.
// A transducer transforms a reducing function, so intermediate arrays are avoided.
// Run: node daily/2026-11-20/02-transducer-composition.js
"use strict";
const assert = require("node:assert/strict");
const REDUCED = Symbol("reduced");
function reduced(value) { return { [REDUCED]: true, value }; }
function isReduced(value) { return Boolean(value && value[REDUCED] === true); }
function compose(...functions) {
  return input => functions.reduceRight((value, fn) => fn(value), input);
}
function mapT(project) {
  if (typeof project !== "function") throw new TypeError("project must be a function");
  return reducer => (accumulator, value) => reducer(accumulator, project(value));
}
function filterT(predicate) {
  if (typeof predicate !== "function") throw new TypeError("predicate must be a function");
  return reducer => (accumulator, value) => predicate(value) ? reducer(accumulator, value) : accumulator;
}
function takeT(limit) {
  if (!Number.isInteger(limit) || limit < 0) throw new RangeError("limit must be non-negative");
  return reducer => {
    let seen = 0;
    return (accumulator, value) => {
      if (seen >= limit) return reduced(accumulator);
      seen += 1;
      const next = reducer(accumulator, value);
      return seen >= limit && !isReduced(next) ? reduced(next) : next;
    };
  };
}
function transduce(transformer, reducer, initial, iterable) {
  if (iterable == null || typeof iterable[Symbol.iterator] !== "function") throw new TypeError("iterable is required");
  const step = transformer(reducer);
  let accumulator = initial;
  for (const value of iterable) {
    const next = step(accumulator, value);
    if (isReduced(next)) { accumulator = next.value; break; }
    accumulator = next;
  }
  return accumulator;
}
const append = (array, value) => { array.push(value); return array; };
const pipeline = compose(filterT(value => value % 2 === 0), mapT(value => value * value), takeT(3));
assert.deepEqual(transduce(pipeline, append, [], [1, 2, 3, 4, 5, 6, 8, 10]), [4, 16, 36]);
assert.deepEqual(transduce(compose(takeT(0), mapT(x => x * 2)), append, [], [1, 2]), []);
assert.deepEqual(transduce(filterT(x => x > 10), append, [], [1, 11, 12]), [11, 12]);
assert.throws(() => takeT(-1), /non-negative/);
assert.throws(() => mapT(null), /function/);
console.log("transducer composition: all tests passed");
