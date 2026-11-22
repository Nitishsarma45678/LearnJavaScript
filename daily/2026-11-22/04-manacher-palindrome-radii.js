/**
 * Exercise: Find the longest palindromic substring in linear time.
 *
 * Implement Manacher's algorithm and return both odd/even radius arrays and
 * the longest substring's start index and value. Avoid constructing reversed
 * copies or expanding around every center in O(n^2).
 *
 * Run: node 04-manacher-palindrome-radii.js
 */
"use strict";
const assert = require("node:assert/strict");

function manacher(text) {
  if (typeof text !== "string") throw new TypeError("text must be a string");
  const n = text.length;
  const odd = new Array(n).fill(0);
  const even = new Array(n).fill(0);

  let left = 0, right = -1;
  for (let i = 0; i < n; i++) {
    let radius = i > right ? 1 : Math.min(odd[left + right - i], right - i + 1);
    while (i - radius >= 0 && i + radius < n &&
           text[i - radius] === text[i + radius]) radius++;
    odd[i] = radius;
    if (i + radius - 1 > right) {
      left = i - radius + 1;
      right = i + radius - 1;
    }
  }

  left = 0; right = -1;
  for (let i = 0; i < n; i++) {
    let radius = i > right ? 0 : Math.min(even[left + right - i + 1], right - i + 1);
    while (i - radius - 1 >= 0 && i + radius < n &&
           text[i - radius - 1] === text[i + radius]) radius++;
    even[i] = radius;
    if (i + radius - 1 > right) {
      left = i - radius;
      right = i + radius - 1;
    }
  }

  let start = 0, length = 0;
  for (let i = 0; i < n; i++) {
    const oddLength = 2 * odd[i] - 1;
    const oddStart = i - odd[i] + 1;
    if (oddLength > length) { start = oddStart; length = oddLength; }

    const evenLength = 2 * even[i];
    const evenStart = i - even[i];
    if (evenLength > length) { start = evenStart; length = evenLength; }
  }

  return { start, length, substring: text.slice(start, start + length), odd, even };
}

assert.equal(manacher("babad").substring, "bab");
assert.equal(manacher("cbbd").substring, "bb");
assert.equal(manacher("abba").substring, "abba");
assert.equal(manacher("a").substring, "a");
assert.equal(manacher("").substring, "");
assert.equal(manacher("abcdef").length, 1);
console.log("Manacher tests passed");

module.exports = { manacher };
