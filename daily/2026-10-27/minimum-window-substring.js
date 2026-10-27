// Exercise: Find the shortest contiguous substring containing every target character,
// including duplicate-character requirements. Operates on Unicode code points.
//
// Complexity: O(n + m) expected time, O(k) auxiliary space, where k is the
// number of distinct characters in the target.

"use strict";

function minWindow(source, target) {
  const chars = Array.from(source);
  const requiredChars = Array.from(target);
  if (requiredChars.length === 0 || chars.length < requiredChars.length) return "";

  const need = new Map();
  for (const char of requiredChars) need.set(char, (need.get(char) || 0) + 1);

  const have = new Map();
  const requiredKinds = need.size;
  let satisfiedKinds = 0;
  let left = 0;
  let bestStart = 0;
  let bestLength = Infinity;

  for (let right = 0; right < chars.length; right += 1) {
    const incoming = chars[right];
    have.set(incoming, (have.get(incoming) || 0) + 1);

    if (need.has(incoming) && have.get(incoming) === need.get(incoming)) {
      satisfiedKinds += 1;
    }

    while (satisfiedKinds === requiredKinds) {
      const length = right - left + 1;
      if (length < bestLength) {
        bestLength = length;
        bestStart = left;
      }

      const outgoing = chars[left];
      have.set(outgoing, have.get(outgoing) - 1);
      if (need.has(outgoing) && have.get(outgoing) < need.get(outgoing)) {
        satisfiedKinds -= 1;
      }
      left += 1;
    }
  }

  return bestLength === Infinity ? "" : chars.slice(bestStart, bestStart + bestLength).join("");
}

module.exports = { minWindow };

if (require.main === module) {
  const assert = require("node:assert/strict");
  assert.equal(minWindow("ADOBECODEBANC", "ABC"), "BANC");
  assert.equal(minWindow("aaabdabcefaecbef", "abc"), "abc");
  assert.equal(minWindow("a", "aa"), "");
  assert.equal(minWindow("anything", ""), "");
  assert.equal(minWindow("x😀y😀z", "😀😀"), "😀y😀");
  console.log("minimum-window-substring: all tests passed");
}
