/**
 * Boyer-Moore exact substring search with bad-character and strong
 * good-suffix heuristics.
 *
 * Matching is performed on Unicode code points (Array.from), so returned
 * offsets count code points rather than UTF-16 code units. All overlapping
 * matches are returned. An empty pattern matches every boundary.
 *
 * Run: node boyer-moore-string-search.js
 */
"use strict";

function buildGoodSuffixShift(pattern) {
  const length = pattern.length;
  const shift = Array(length + 1).fill(0);
  const border = Array(length + 1).fill(0);
  let i = length;
  let j = length + 1;
  border[i] = j;

  while (i > 0) {
    while (j <= length && pattern[i - 1] !== pattern[j - 1]) {
      if (shift[j] === 0) shift[j] = j - i;
      j = border[j];
    }
    i--;
    j--;
    border[i] = j;
  }

  j = border[0];
  for (i = 0; i <= length; i++) {
    if (shift[i] === 0) shift[i] = j;
    if (i === j) j = border[j];
  }
  return shift;
}

function boyerMooreSearch(text, pattern, options = {}) {
  if (typeof text !== "string" || typeof pattern !== "string") {
    throw new TypeError("Text and pattern must be strings");
  }
  const source = Array.from(text);
  const target = Array.from(pattern);
  const start = options.fromIndex ?? 0;
  if (!Number.isSafeInteger(start) || start < 0) {
    throw new RangeError("fromIndex must be a non-negative safe integer");
  }

  const n = source.length;
  const m = target.length;
  if (start > n) return [];
  if (m === 0) return Array.from({ length: n - start + 1 }, (_, i) => start + i);
  if (m > n - start) return [];

  const lastOccurrence = new Map();
  for (let i = 0; i < m; i++) lastOccurrence.set(target[i], i);
  const goodSuffix = buildGoodSuffixShift(target);
  const matches = [];
  let alignment = start;

  while (alignment <= n - m) {
    let j = m - 1;
    while (j >= 0 && target[j] === source[alignment + j]) j--;

    if (j < 0) {
      matches.push(alignment);
      alignment += Math.max(1, goodSuffix[0]);
      continue;
    }

    const last = lastOccurrence.has(source[alignment + j])
      ? lastOccurrence.get(source[alignment + j])
      : -1;
    const badCharacterShift = j - last;
    const goodSuffixShift = goodSuffix[j + 1];
    alignment += Math.max(1, badCharacterShift, goodSuffixShift);
  }
  return matches;
}

function naiveSearch(text, pattern, fromIndex = 0) {
  const source = Array.from(text);
  const target = Array.from(pattern);
  const matches = [];
  if (target.length === 0) {
    for (let i = fromIndex; i <= source.length; i++) matches.push(i);
    return matches;
  }
  for (let i = fromIndex; i + target.length <= source.length; i++) {
    if (target.every((symbol, j) => source[i + j] === symbol)) matches.push(i);
  }
  return matches;
}

function runTests() {
  const assert = require("node:assert/strict");
  assert.deepEqual(boyerMooreSearch("HERE IS A SIMPLE EXAMPLE", "EXAMPLE"), [17]);
  assert.deepEqual(boyerMooreSearch("ABAAABCD", "ABC"), [4]);
  assert.deepEqual(boyerMooreSearch("aaaaa", "aa"), [0, 1, 2, 3]);
  assert.deepEqual(boyerMooreSearch("mississippi", "issi"), [1, 4]);
  assert.deepEqual(boyerMooreSearch("a😀b😀c", "😀"), [1, 3]);
  assert.deepEqual(boyerMooreSearch("abc", ""), [0, 1, 2, 3]);
  assert.deepEqual(boyerMooreSearch("abcabc", "abc", { fromIndex: 1 }), [3]);
  assert.deepEqual(boyerMooreSearch("abc", "longer"), []);
  assert.deepEqual(boyerMooreSearch("abc", "a", { fromIndex: 3 }), []);
  assert.throws(() => boyerMooreSearch(12, "2"), TypeError);
  assert.throws(() => boyerMooreSearch("abc", "a", { fromIndex: -1 }), RangeError);

  let seed = 0x2468ace1;
  const random = max => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed % max;
  };
  const alphabet = ["a", "b", "c", "😀", "é"];
  for (let trial = 0; trial < 700; trial++) {
    const text = Array.from({ length: random(45) }, () => alphabet[random(alphabet.length)]).join("");
    const pattern = Array.from({ length: random(9) }, () => alphabet[random(alphabet.length)]).join("");
    const fromIndex = random(Array.from(text).length + 1);
    assert.deepEqual(
      boyerMooreSearch(text, pattern, { fromIndex }),
      naiveSearch(text, pattern, fromIndex)
    );
  }
  return { passed: 11 + 700, randomizedTrials: 700 };
}

if (typeof require !== "undefined" && require.main === module) {
  const result = runTests();
  console.log("Boyer-Moore search: " + result.passed + " checks passed");
}
if (typeof module !== "undefined") {
  module.exports = { buildGoodSuffixShift, boyerMooreSearch, naiveSearch, runTests };
}
