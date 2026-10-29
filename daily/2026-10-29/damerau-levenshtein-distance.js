/**
 * Optimal string alignment distance (restricted Damerau-Levenshtein).
 *
 * Supports insertion, deletion, substitution, and one adjacent transposition
 * per substring. Time O(m*n), space O(m*n); strings are compared by Unicode
 * code point rather than UTF-16 code unit.
 */
"use strict";
const assert = require("node:assert/strict");

function damerauLevenshtein(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    throw new TypeError("both inputs must be strings");
  }
  const left = Array.from(a), right = Array.from(b);
  const m = left.length, n = right.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,       // deletion
        dp[i][j - 1] + 1,       // insertion
        dp[i - 1][j - 1] + cost // substitution / match
      );
      if (i > 1 && j > 1 &&
          left[i - 1] === right[j - 2] &&
          left[i - 2] === right[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[m][n];
}

// Examples and boundary tests.
assert.equal(damerauLevenshtein("CA", "ABC"), 3); // OSA restriction
assert.equal(damerauLevenshtein("form", "from"), 1);
assert.equal(damerauLevenshtein("kitten", "sitting"), 3);
assert.equal(damerauLevenshtein("", "abc"), 3);
assert.equal(damerauLevenshtein("😀a", "a😀"), 1);
assert.equal(damerauLevenshtein("same", "same"), 0);
assert.throws(() => damerauLevenshtein(null, "x"), TypeError);

module.exports = { damerauLevenshtein };
