/**
 * Exercise: Maximum subarray sum with at most one deletion.
 *
 * Return the best sum and the inclusive original index range. If an element
 * is deleted, report its original index. The chosen subarray must retain at
 * least one element. Target complexity: O(n) time and O(1) auxiliary space.
 *
 * Run: node 03-maximum-subarray-one-deletion.js
 */
"use strict";
const assert = require("node:assert/strict");

function maximumSubarrayOneDeletion(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError("values must be a non-empty array");
  }
  if (!values.every(Number.isFinite)) throw new TypeError("all values must be finite numbers");

  // State records preserve enough information to reconstruct the selected range.
  let keep = { sum: values[0], start: 0, end: 0, deletedIndex: null };
  let drop = null;
  let best = keep;

  const better = (a, b) => {
    if (!b) return a;
    if (a.sum !== b.sum) return a.sum > b.sum ? a : b;
    const aLength = a.end - a.start + 1;
    const bLength = b.end - b.start + 1;
    return aLength < bLength ? a : b;
  };

  for (let i = 1; i < values.length; i++) {
    const x = values[i];
    const nextKeep = better(
      { sum: keep.sum + x, start: keep.start, end: i, deletedIndex: null },
      { sum: x, start: i, end: i, deletedIndex: null }
    );

    const extendDrop = drop && {
      sum: drop.sum + x, start: drop.start, end: i, deletedIndex: drop.deletedIndex
    };
    // Delete the current element, retaining the previous non-empty subarray.
    const deleteCurrent = {
      sum: keep.sum, start: keep.start, end: i, deletedIndex: i
    };
    const nextDrop = better(extendDrop, deleteCurrent);

    keep = nextKeep;
    drop = nextDrop;
    best = better(better(keep, drop), best);
  }

  return { ...best };
}

assert.deepEqual(maximumSubarrayOneDeletion([1, -2, 0, 3]), {
  sum: 4, start: 0, end: 3, deletedIndex: 1
});
assert.equal(maximumSubarrayOneDeletion([-1, -2, -3]).sum, -1);
assert.equal(maximumSubarrayOneDeletion([5, -100, 6]).sum, 11);
assert.equal(maximumSubarrayOneDeletion([4]).sum, 4);
assert.throws(() => maximumSubarrayOneDeletion([]), TypeError);
console.log("maximum subarray with one deletion tests passed");

module.exports = { maximumSubarrayOneDeletion };
