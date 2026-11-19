'use strict';

/**
 * Exercise: Recursively flatten nested arrays up to a chosen depth.
 *
 * - depth = 0 returns a shallow copy.
 * - depth = Infinity fully flattens.
 * - Sparse slots are materialized as undefined, matching Array iteration.
 * - A cycle on the active recursion path throws; repeated non-cyclic array
 *   references are allowed and expanded independently.
 */

function flattenArray(input, depth = Infinity) {
  if (!Array.isArray(input)) throw new TypeError('input must be an array');
  if (!(depth === Infinity || Number.isInteger(depth) && depth >= 0)) {
    throw new RangeError('depth must be a non-negative integer or Infinity');
  }

  const active = new WeakSet();

  function visit(array, remainingDepth) {
    if (active.has(array)) throw new TypeError('cyclic array detected');
    active.add(array);
    const result = [];

    for (let index = 0; index < array.length; index += 1) {
      const value = array[index];
      if (Array.isArray(value) && remainingDepth > 0) {
        const nextDepth = remainingDepth === Infinity ? Infinity : remainingDepth - 1;
        result.push(...visit(value, nextDepth));
      } else {
        result.push(value);
      }
    }

    active.delete(array);
    return result;
  }

  return visit(input, depth);
}

function runTests() {
  const assert = require('node:assert/strict');
  assert.deepEqual(flattenArray([1, [2, [3, [4]]]]), [1, 2, 3, 4]);
  assert.deepEqual(flattenArray([1, [2, [3]]], 1), [1, 2, [3]]);
  assert.deepEqual(flattenArray([1, [2]], 0), [1, [2]]);
  assert.deepEqual(flattenArray([1, , 3]), [1, undefined, 3]);

  const shared = [2, [3]];
  assert.deepEqual(flattenArray([1, shared, shared]), [1, 2, 3, 2, 3]);

  const cyclic = [1];
  cyclic.push(cyclic);
  assert.throws(() => flattenArray(cyclic), /cyclic/);
  assert.throws(() => flattenArray([1], -1), /depth/);
  assert.throws(() => flattenArray('not an array'), /array/);
}

if (require.main === module) {
  runTests();
  console.log('Recursive array flattening: all tests passed');
}

module.exports = { flattenArray };
