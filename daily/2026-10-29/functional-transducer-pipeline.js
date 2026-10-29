// Transducers compose transformations independently of the collection.
// The reduced marker allows takeT to stop iteration early without building
// intermediate arrays.

const REDUCED = Symbol('reduced');
const reduced = value => ({ [REDUCED]: true, value });
const isReduced = value => Boolean(value && value[REDUCED]);

function mapT(mapper) {
  if (typeof mapper !== 'function') throw new TypeError('mapper must be a function');
  return reducer => (acc, value) => reducer(acc, mapper(value));
}

function filterT(predicate) {
  if (typeof predicate !== 'function') throw new TypeError('predicate must be a function');
  return reducer => (acc, value) => predicate(value) ? reducer(acc, value) : acc;
}

function takeT(count) {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError('count must be a non-negative integer');
  }
  return reducer => {
    let seen = 0;
    return (acc, value) => {
      if (seen >= count) return reduced(acc);
      seen += 1;
      const next = reducer(acc, value);
      return seen >= count && !isReduced(next) ? reduced(next) : next;
    };
  };
}

function compose(...transducers) {
  return reducer => transducers.reduceRight((next, transform) => transform(next), reducer);
}

function transduce(transform, reducer, initial, iterable) {
  if (typeof reducer !== 'function') throw new TypeError('reducer must be a function');
  let acc = initial;
  const step = transform(reducer);
  for (const value of iterable) {
    const next = step(acc, value);
    if (isReduced(next)) {
      acc = next.value;
      break;
    }
    acc = next;
  }
  return acc;
}

const append = (acc, value) => {
  acc.push(value);
  return acc;
};
const sum = (acc, value) => acc + value;
const assert = require('node:assert/strict');

const pipeline = compose(
  filterT(value => value % 2 === 0),
  mapT(value => value * 10),
  takeT(2)
);
assert.deepEqual(transduce(pipeline, append, [], [1, 2, 3, 4, 6, 8]), [20, 40]);
assert.equal(transduce(mapT(value => value * value), sum, 0, [1, 2, 3, 4]), 30);
assert.deepEqual(transduce(takeT(0), append, [], [9, 8, 7]), []);
assert.deepEqual(transduce(compose(filterT(x => x > 2), takeT(2)), append, [], [1, 3, 4, 5]), [3, 4]);

let yielded = 0;
function* source() {
  for (let i = 0; i < 100; i += 1) {
    yielded += 1;
    yield i;
  }
}
assert.deepEqual(transduce(takeT(3), append, [], source()), [0, 1, 2]);
assert.equal(yielded, 3, 'takeT should stop consuming the source early');
assert.throws(() => takeT(-1), RangeError);

console.log('transducer tests passed');
