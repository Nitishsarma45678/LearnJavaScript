// Exercise: Implement reusable function combinators.
// Requirements: preserve left-to-right and right-to-left composition, support async pipelines,
// and add tap, branching, and conditional transformation helpers.

function pipe(...functions) {
  return input => functions.reduce((value, fn) => fn(value), input);
}

function compose(...functions) {
  return input => functions.reduceRight((value, fn) => fn(value), input);
}

function pipeAsync(...functions) {
  return input => functions.reduce(
    (promise, fn) => promise.then(value => fn(value)),
    Promise.resolve(input)
  );
}

function tap(effect) {
  if (typeof effect !== "function") throw new TypeError("effect must be a function");
  return value => {
    effect(value);
    return value;
  };
}

function mapIf(predicate, transform, fallback = value => value) {
  return value => (predicate(value) ? transform(value) : fallback(value));
}

function converge(combine, ...branches) {
  return value => combine(...branches.map(branch => branch(value)));
}

function fork(left, right) {
  return value => [left(value), right(value)];
}

// Tests
const assert = require("node:assert/strict");
const double = value => value * 2;
const increment = value => value + 1;
const stringify = value => String(value);

assert.equal(pipe(double, increment, stringify)(4), "9");
assert.equal(compose(stringify, increment, double)(4), "9");

const audit = [];
assert.equal(pipe(double, tap(value => audit.push(value)), increment)(3), 7);
assert.deepEqual(audit, [6]);

assert.equal(mapIf(value => value < 0, Math.abs)(-8), 8);
assert.equal(mapIf(value => value < 0, Math.abs)(8), 8);

assert.deepEqual(fork(value => value + 1, value => value * 3)(4), [5, 12]);
assert.equal(converge((sum, product) => sum + product,
  value => value + 2,
  value => value * 2
)(5), 17);

(async () => {
  const result = await pipeAsync(
    value => value + 2,
    async value => value * 5,
    value => value - 3
  )(4);
  assert.equal(result, 27);
  console.log("function pipeline tests passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
