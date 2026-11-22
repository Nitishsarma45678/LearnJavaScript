/**
 * Exercise: Answer offline range-distinct queries using Mo's algorithm.
 * values is an array; each query is an inclusive [left, right] range.
 * Return answers in the original query order. Target: O((n + q) sqrt(n)).
 * Run: node 09-mos-algorithm-distinct-range-queries.js
 */
"use strict";
const assert = require("node:assert/strict");

function countDistinctInRanges(values, queries) {
  if (!Array.isArray(values) || !Array.isArray(queries)) throw new TypeError("arrays required");
  const n = values.length;
  const blockSize = Math.max(1, Math.floor(Math.sqrt(n || 1)));
  const indexed = queries.map((query, index) => {
    if (!Array.isArray(query) || query.length !== 2) throw new TypeError("query must be [left,right]");
    const [left, right] = query;
    if (!Number.isInteger(left) || !Number.isInteger(right) || left < 0 || right >= n || left > right) {
      throw new RangeError("invalid inclusive query range");
    }
    return { left, right, index, block: Math.floor(left / blockSize) };
  });

  indexed.sort((a, b) =>
    a.block - b.block || (a.block % 2 === 0 ? a.right - b.right : b.right - a.right)
  );

  const frequency = new Map();
  const answers = new Array(queries.length);
  let currentLeft = 0, currentRight = -1, distinct = 0;

  const add = value => {
    const count = frequency.get(value) || 0;
    if (count === 0) distinct++;
    frequency.set(value, count + 1);
  };
  const remove = value => {
    const count = frequency.get(value);
    if (count === 1) { frequency.delete(value); distinct--; }
    else frequency.set(value, count - 1);
  };

  for (const query of indexed) {
    while (currentLeft > query.left) add(values[--currentLeft]);
    while (currentRight < query.right) add(values[++currentRight]);
    while (currentLeft < query.left) remove(values[currentLeft++]);
    while (currentRight > query.right) remove(values[currentRight--]);
    answers[query.index] = distinct;
  }
  return answers;
}

assert.deepEqual(
  countDistinctInRanges([1, 2, 1, 3, 2, 2, 4], [[0, 6], [1, 3], [2, 5], [4, 4]]),
  [4, 3, 3, 1]
);
assert.deepEqual(countDistinctInRanges(["a", "a", "b"], [[0, 1], [1, 2]]), [1, 2]);
assert.deepEqual(countDistinctInRanges([], []), []);
assert.throws(() => countDistinctInRanges([1], [[0, 1]]), RangeError);
console.log("Mo's algorithm tests passed");
module.exports = { countDistinctInRanges };
