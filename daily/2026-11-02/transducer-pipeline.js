const assert = require('node:assert/strict');

const REDUCED = Symbol('reduced');
const reduced = value => ({ [REDUCED]: true, value });

function mapT(mapper) {
  if (typeof mapper !== 'function') throw new TypeError('mapper must be a function');
  return reducer => (acc, value, index) => reducer(acc, mapper(value, index), index);
}

function filterT(predicate) {
  if (typeof predicate !== 'function') throw new TypeError('predicate must be a function');
  return reducer => (acc, value, index) =>
    predicate(value, index) ? reducer(acc, value, index) : acc;
}

function takeT(count) {
  if (!Number.isInteger(count) || count < 0) throw new RangeError('count must be non-negative');
  return reducer => {
    let remaining = count;
    return (acc, value, index) => {
      if (remaining === 0) return reduced(acc);
      remaining--;
      const next = reducer(acc, value, index);
      return remaining === 0 ? reduced(next) : next;
    };
  };
}

function composeT(...transducers) {
  return reducer => transducers.reduceRight((step, transducer) => transducer(step), reducer);
}

function transduce(source, transducer, reducer, initialValue) {
  let acc = initialValue;
  const step = transducer(reducer);
  let index = 0;
  for (const value of source) {
    const next = step(acc, value, index++);
    if (next && next[REDUCED]) {
      acc = next.value;
      break;
    }
    acc = next;
  }
  return acc;
}

const toArray = (acc, value) => { acc.push(value); return acc; };
let visited = 0;
function* numbers() {
  for (let n = 1; n <= 100; n++) { visited++; yield n; }
}
const pipeline = composeT(
  filterT(n => n % 2 === 0),
  mapT(n => n * n),
  takeT(3)
);
assert.deepEqual(transduce(numbers(), pipeline, toArray, []), [4, 16, 36]);
assert.equal(visited, 6, 'takeT should stop consuming the source immediately');
assert.deepEqual(transduce([1,2,3], composeT(mapT(n => n + 1)), toArray, []), [2,3,4]);
assert.deepEqual(transduce([1,2], takeT(0), toArray, []), []);
assert.throws(() => takeT(-1), RangeError);
console.log('Transducer pipeline tests passed');