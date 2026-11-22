/**
 * Exercise: Reconstruct a longest common subsequence using Hirschberg's
 * divide-and-conquer algorithm. The DP row helper uses O(m) memory and the
 * recursive split reconstructs an actual subsequence in O(n*m) time.
 * Inputs are arrays (strings can be spread into arrays by the caller).
 * Run: node 11-hirschberg-linear-space-lcs.js
 */
"use strict";
const assert = require("node:assert/strict");

function scoreRow(a, b) {
  let previous = new Array(b.length + 1).fill(0);
  for (const item of a) {
    const current = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      current[j] = item === b[j - 1]
        ? previous[j - 1] + 1
        : Math.max(previous[j], current[j - 1]);
    }
    previous = current;
  }
  return previous;
}

function longestCommonSubsequence(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) throw new TypeError("inputs must be arrays");
  function solve(x, y) {
    if (!x.length || !y.length) return [];
    if (x.length === 1) return y.includes(x[0]) ? [x[0]] : [];
    const mid = Math.floor(x.length / 2);
    const leftScores = scoreRow(x.slice(0, mid), y);
    const rightScores = scoreRow(x.slice(mid).reverse(), y.slice().reverse());
    let split = 0, best = -1;
    for (let j = 0; j <= y.length; j++) {
      const score = leftScores[j] + rightScores[y.length - j];
      if (score > best) { best = score; split = j; }
    }
    return solve(x.slice(0, mid), y.slice(0, split))
      .concat(solve(x.slice(mid), y.slice(split)));
  }
  return solve(a, b);
}

function isSubsequence(candidate, source) {
  let i = 0;
  for (const item of source) if (i < candidate.length && candidate[i] === item) i++;
  return i === candidate.length;
}

const result = longestCommonSubsequence([..."ABCBDAB"], [..."BDCABA"]);
assert.equal(result.length, 4);
assert.ok(isSubsequence(result, [..."ABCBDAB"]));
assert.ok(isSubsequence(result, [..."BDCABA"]));
assert.deepEqual(longestCommonSubsequence([1, 2, 3], [4, 5]), []);
assert.deepEqual(longestCommonSubsequence([], [1]), []);
assert.equal(longestCommonSubsequence([1, 2, 1], [1, 1]).length, 2);
console.log("Hirschberg LCS tests passed");
module.exports = { longestCommonSubsequence, isSubsequence };
