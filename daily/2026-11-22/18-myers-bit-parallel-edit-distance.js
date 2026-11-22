/**
 * Exercise: Compute Levenshtein distance with Myers' bit-parallel algorithm.
 * The pattern is represented by per-character bit masks, so the main scan
 * processes one text character using a handful of 32-bit operations.
 * To keep JavaScript's signed bitwise semantics straightforward, patterns
 * are limited to 30 UTF-16 code units.
 * Run: node 18-myers-bit-parallel-edit-distance.js
 */
"use strict";
const assert = require("node:assert/strict");

function myersDistance(pattern, text) {
  if (typeof pattern !== "string" || typeof text !== "string") throw new TypeError("strings required");
  const m = pattern.length;
  if (m > 30) throw new RangeError("pattern must contain at most 30 UTF-16 code units");
  if (m === 0) return text.length;

  const equality = new Map();
  for (let i = 0; i < m; i++) {
    equality.set(pattern[i], (equality.get(pattern[i]) || 0) | (1 << i));
  }
  const topBit = 1 << (m - 1);
  let positive = ~0;
  let negative = 0;
  let score = m;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    const equal = equality.get(character) || 0;
    const vertical = equal | negative;
    const horizontal = (((equal & positive) + positive) ^ positive) | equal;
    let positiveHorizontal = negative | ~(horizontal | positive);
    let negativeHorizontal = positive & horizontal;

    if (positiveHorizontal & topBit) score++;
    else if (negativeHorizontal & topBit) score--;

    positiveHorizontal = (positiveHorizontal << 1) | 1;
    negativeHorizontal <<= 1;
    positive = negativeHorizontal | ~(vertical | positiveHorizontal);
    negative = positiveHorizontal & vertical;
  }
  return score;
}

assert.equal(myersDistance("kitten", "sitting"), 3);
assert.equal(myersDistance("same", "same"), 0);
assert.equal(myersDistance("abc", ""), 3);
assert.equal(myersDistance("", "xyz"), 3);
assert.equal(myersDistance("book", "back"), 2);
assert.throws(() => myersDistance("a".repeat(31), "a"), RangeError);
assert.throws(() => myersDistance(null, "x"), TypeError);
console.log("Myers bit-parallel edit-distance tests passed");
module.exports = { myersDistance };
