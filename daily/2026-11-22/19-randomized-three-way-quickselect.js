/**
 * Exercise: Implement randomized Quickselect with a three-way partition.
 * Return the zero-based kth smallest value without fully sorting the input.
 * A seeded PRNG makes the exercise reproducible; duplicates are handled in
 * one partition pass. The caller's array must remain unchanged.
 * Expected average time: O(n); worst case: O(n^2).
 * Run: node 19-randomized-three-way-quickselect.js
 */
"use strict";
const assert = require("node:assert/strict");

function quickselect(values, k, { seed = 0x9e3779b9, compare = (a, b) => a - b } = {}) {
  if (!Array.isArray(values) || values.length === 0) throw new TypeError("values must be non-empty");
  if (!Number.isInteger(k) || k < 0 || k >= values.length) throw new RangeError("k out of range");
  const array = values.slice();
  let state = seed >>> 0;
  const randomIndex = (low, high) => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return low + ((state >>> 0) % (high - low + 1));
  };

  let low = 0, high = array.length - 1;
  while (low <= high) {
    const pivot = array[randomIndex(low, high)];
    let less = low, scan = low, greater = high;
    while (scan <= greater) {
      const order = compare(array[scan], pivot);
      if (order < 0) {
        [array[less], array[scan]] = [array[scan], array[less]];
        less++; scan++;
      } else if (order > 0) {
        [array[scan], array[greater]] = [array[greater], array[scan]];
        greater--;
      } else scan++;
    }
    if (k < less) high = less - 1;
    else if (k > greater) low = greater + 1;
    else return array[k];
  }
  throw new Error("unreachable partition state");
}

const data = [9, 1, 8, 2, 7, 2, 6, 3, 5, 4];
assert.equal(quickselect(data, 0), 1);
assert.equal(quickselect(data, 4), 4);
assert.equal(quickselect(data, 9), 9);
assert.deepEqual(data, [9, 1, 8, 2, 7, 2, 6, 3, 5, 4]);
assert.equal(quickselect([4, 4, 4, 4], 2), 4);
assert.equal(quickselect(["pear", "apple", "plum"], 1, { compare: (a, b) => a.localeCompare(b) }), "plum");
assert.throws(() => quickselect([], 0), TypeError);
assert.throws(() => quickselect([1], 1), RangeError);
console.log("randomized three-way Quickselect tests passed");
module.exports = { quickselect };
