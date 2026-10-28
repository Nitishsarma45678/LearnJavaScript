// Wildcard matching with '?' (one code point) and '*' (any sequence).
// Uses O(pattern length) auxiliary space. Consecutive '*' tokens are collapsed.
// Run: node daily/2026-10-28/wildcard-matcher-dynamic-programming.js

"use strict";

const assert = require("node:assert/strict");

function wildcardMatch(text, pattern) {
  if (typeof text !== "string" || typeof pattern !== "string") {
    throw new TypeError("text and pattern must be strings");
  }

  const chars = Array.from(text);
  const tokens = Array.from(pattern).filter((token, index, all) =>
    token !== "*" || all[index - 1] !== "*"
  );

  // dp[j] means the prefix processed so far matches tokens[0..j).
  let dp = new Array(tokens.length + 1).fill(false);
  dp[0] = true;
  for (let j = 1; j <= tokens.length; j += 1) {
    dp[j] = dp[j - 1] && tokens[j - 1] === "*";
  }

  for (const char of chars) {
    const next = new Array(tokens.length + 1).fill(false);
    for (let j = 1; j <= tokens.length; j += 1) {
      const token = tokens[j - 1];
      if (token === "*") {
        // '*' consumes nothing (next[j - 1]) or consumes this character (dp[j]).
        next[j] = next[j - 1] || dp[j];
      } else {
        next[j] = dp[j - 1] && (token === "?" || token === char);
      }
    }
    dp = next;
  }

  return dp[tokens.length];
}

assert.equal(wildcardMatch("adceb", "*a*b"), true);
assert.equal(wildcardMatch("acdcb", "a*c?b"), false);
assert.equal(wildcardMatch("", "***"), true);
assert.equal(wildcardMatch("", "?"), false);
assert.equal(wildcardMatch("🌱x", "?x"), true);
assert.equal(wildcardMatch("anything", "*"), true);
assert.equal(wildcardMatch("abc", "a**c"), true);
assert.equal(wildcardMatch("abc", "a*d"), false);
assert.throws(() => wildcardMatch(null, "*"), TypeError);

console.log("wildcard-matcher-dynamic-programming: all tests passed");
module.exports = { wildcardMatch };
