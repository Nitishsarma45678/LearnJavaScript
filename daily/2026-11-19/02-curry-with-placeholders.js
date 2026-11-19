'use strict';

/**
 * Exercise: Implement currying with explicit arity and placeholder support.
 *
 * A placeholder reserves an argument position. Later calls fill the earliest
 * outstanding placeholder before appending new arguments:
 *
 *   const join3 = curry((a, b, c) => [a, b, c].join('-'), 3);
 *   join3('A', curry.placeholder, 'C')('B') === 'A-B-C'
 *
 * The returned function remains callable until the first arity positions are
 * all supplied. Arguments beyond arity are intentionally ignored.
 */

function curry(fn, arity = fn.length) {
  if (typeof fn !== 'function') throw new TypeError('fn must be a function');
  if (!Number.isInteger(arity) || arity < 0) throw new RangeError('arity must be a non-negative integer');

  const PLACEHOLDER = curry.placeholder;

  function build(received) {
    return function curried(...incoming) {
      const combined = received.slice();

      for (const value of incoming) {
        const emptyIndex = combined.indexOf(PLACEHOLDER);
        if (emptyIndex !== -1) combined[emptyIndex] = value;
        else combined.push(value);
      }

      const ready = combined.length >= arity &&
        combined.slice(0, arity).every((value) => value !== PLACEHOLDER);

      if (ready) return fn.apply(this, combined.slice(0, arity));
      return build(combined);
    };
  }

  return build([]);
}

curry.placeholder = Symbol('curry.placeholder');

function runTests() {
  const assert = require('node:assert/strict');
  const join3 = curry((a, b, c) => [a, b, c].join(':'), 3);
  assert.equal(join3('north')('east')('west'), 'north:east:west');
  assert.equal(join3('north', 'east')('west'), 'north:east:west');

  const __ = curry.placeholder;
  assert.equal(join3('north', __, 'west')('east'), 'north:east:west');
  assert.equal(join3(__, 'middle')('first')('last'), 'first:middle:last');
  assert.equal(join3(__, __, 'last')('first', 'middle'), 'first:middle:last');

  const sum = curry((...values) => values.reduce((total, value) => total + value, 0), 4);
  assert.equal(sum(1, 2)(3)(4, 999), 10, 'extra arguments after arity are ignored');

  const zeroArity = curry(() => 'ready', 0);
  assert.equal(zeroArity(), 'ready');
  assert.throws(() => curry(null), /function/);
  assert.throws(() => curry(() => 1, -1), /arity/);
}

if (require.main === module) {
  runTests();
  console.log('Placeholder-aware currying: all tests passed');
}

module.exports = { curry };
