// Count assignments of '+' and '-' to reach a target sum.
// Supports negative and zero values; memoization avoids repeated subproblems.
// The result uses Number, so extremely large counts may exceed safe integer range.
// Run: node daily/2026-10-28/target-sum-count-memoization.js

"use strict";

const assert = require("node:assert/strict");

function countTargetSumWays(numbers, target) {
  if (!Array.isArray(numbers) || !Number.isInteger(target)) {
    throw new TypeError("numbers must be an array and target must be an integer");
  }
  if (!numbers.every(Number.isInteger)) {
    throw new TypeError("all numbers must be integers");
  }

  const memo = new Map();

  function visit(index, remaining) {
    if (index === numbers.length) return remaining === 0 ? 1 : 0;

    const key = index + ":" + remaining;
    if (memo.has(key)) return memo.get(key);

    const value = numbers[index];
    const ways = visit(index + 1, remaining - value) +
      visit(index + 1, remaining + value);
    memo.set(key, ways);
    return ways;
  }

  return visit(0, target);
}

assert.equal(countTargetSumWays([1, 1, 1, 1, 1], 3), 5);
assert.equal(countTargetSumWays([1], 1), 1);
assert.equal(countTargetSumWays([1], 0), 0);
assert.equal(countTargetSumWays([0, 0, 1], 1), 4);
assert.equal(countTargetSumWays([-1, 1], 0), 2);
assert.equal(countTargetSumWays([], 0), 1);
assert.equal(countTargetSumWays([], 4), 0);
assert.throws(() => countTargetSumWays([1, 1.5], 2), TypeError);
assert.throws(() => countTargetSumWays([1], 1.2), TypeError);

console.log("target-sum-count-memoization: all tests passed");
module.exports = { countTargetSumWays };
