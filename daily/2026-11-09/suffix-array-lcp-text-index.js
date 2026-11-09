/*
 * Suffix Array + LCP Text Index
 * -----------------------------
 * Build a suffix array with prefix doubling, compute adjacent LCP values
 * with Kasai's algorithm, and answer substring-occurrence queries by binary
 * searching the suffix array.
 *
 * Positions are measured in Unicode code points (Array.from), not UTF-16
 * code units. Construction is O(n log^2 n) with comparison sorting; LCP is
 * O(n); each pattern lookup is O(m log n + k log k), where k is the result
 * count and the final sort returns positions in source order.
 */

"use strict";

const assert = require("node:assert/strict");

function buildSuffixArray(text) {
  const chars = Array.from(text);
  const n = chars.length;
  if (n === 0) return [];

  const alphabet = [...new Set(chars)].sort();
  const initialRank = new Map(alphabet.map((char, index) => [char, index]));
  let rank = chars.map(char => initialRank.get(char));
  let order = Array.from({ length: n }, (_, index) => index);

  for (let width = 1; width < n; width *= 2) {
    order.sort((a, b) => {
      const first = rank[a] - rank[b];
      if (first !== 0) return first;
      return (rank[a + width] ?? -1) - (rank[b + width] ?? -1);
    });

    const nextRank = new Array(n);
    let classes = 0;
    nextRank[order[0]] = 0;

    for (let i = 1; i < n; i += 1) {
      const previous = order[i - 1];
      const current = order[i];
      const previousPair = [rank[previous], rank[previous + width] ?? -1];
      const currentPair = [rank[current], rank[current + width] ?? -1];

      if (
        previousPair[0] !== currentPair[0] ||
        previousPair[1] !== currentPair[1]
      ) {
        classes += 1;
      }
      nextRank[current] = classes;
    }

    rank = nextRank;
    if (classes === n - 1) break;
  }

  return order;
}

function buildLcpArray(text, suffixArray) {
  const chars = Array.from(text);
  const n = chars.length;
  if (suffixArray.length !== n) {
    throw new RangeError("Suffix array length must match the text length");
  }

  const inverse = new Array(n);
  for (let i = 0; i < n; i += 1) inverse[suffixArray[i]] = i;

  const lcp = new Array(n).fill(0);
  let common = 0;

  for (let start = 0; start < n; start += 1) {
    const position = inverse[start];
    if (position === n - 1) {
      common = 0;
      continue;
    }

    const nextStart = suffixArray[position + 1];
    while (
      start + common < n &&
      nextStart + common < n &&
      chars[start + common] === chars[nextStart + common]
    ) {
      common += 1;
    }

    lcp[position] = common;
    if (common > 0) common -= 1;
  }

  return lcp;
}

function compareSuffixWithPattern(chars, start, pattern) {
  let offset = 0;
  while (offset < pattern.length && start + offset < chars.length) {
    if (chars[start + offset] < pattern[offset]) return -1;
    if (chars[start + offset] > pattern[offset]) return 1;
    offset += 1;
  }
  return offset === pattern.length ? 0 : -1;
}

class SuffixArrayIndex {
  constructor(text) {
    if (typeof text !== "string") {
      throw new TypeError("Text must be a string");
    }
    this.text = text;
    this.chars = Array.from(text);
    this.suffixArray = buildSuffixArray(text);
    this.lcp = buildLcpArray(text, this.suffixArray);
  }

  findAll(pattern) {
    if (typeof pattern !== "string") {
      throw new TypeError("Pattern must be a string");
    }
    const needle = Array.from(pattern);
    if (needle.length === 0) {
      return Array.from({ length: this.chars.length + 1 }, (_, i) => i);
    }

    let low = 0;
    let high = this.suffixArray.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (
        compareSuffixWithPattern(
          this.chars,
          this.suffixArray[middle],
          needle
        ) < 0
      ) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    const first = low;

    low = first;
    high = this.suffixArray.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (
        compareSuffixWithPattern(
          this.chars,
          this.suffixArray[middle],
          needle
        ) <= 0
      ) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }

    return this.suffixArray.slice(first, low).sort((a, b) => a - b);
  }

  longestRepeatedSubstring() {
    let bestLength = 0;
    let bestStart = -1;

    for (let i = 0; i < this.lcp.length; i += 1) {
      if (this.lcp[i] > bestLength) {
        bestLength = this.lcp[i];
        bestStart = this.suffixArray[i];
      }
    }

    return {
      substring: bestStart === -1
        ? ""
        : this.chars.slice(bestStart, bestStart + bestLength).join(""),
      length: bestLength
    };
  }
}

function runTests() {
  const banana = new SuffixArrayIndex("banana");
  assert.deepEqual(banana.suffixArray, [5, 3, 1, 0, 4, 2]);
  assert.deepEqual(banana.lcp, [1, 3, 0, 0, 2, 0]);
  assert.deepEqual(banana.findAll("ana"), [1, 3]);
  assert.deepEqual(banana.findAll("ban"), [0]);
  assert.deepEqual(banana.findAll("missing"), []);
  assert.deepEqual(banana.longestRepeatedSubstring(), {
    substring: "ana",
    length: 3
  });

  const unicode = new SuffixArrayIndex("a😀a😀");
  assert.deepEqual(unicode.findAll("😀"), [1, 3]);
  assert.deepEqual(unicode.findAll("a😀"), [0, 2]);
  assert.deepEqual(new SuffixArrayIndex("").suffixArray, []);
  assert.deepEqual(new SuffixArrayIndex("aaaa").findAll("aa"), [0, 1, 2]);
  assert.equal(new SuffixArrayIndex("abcd").longestRepeatedSubstring().length, 0);
  assert.throws(() => banana.findAll(42), TypeError);

  // Differential checks against a straightforward substring scan.
  let seed = 0x12345678;
  const random = max => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % max;
  };
  const alphabet = ["a", "b", "c", "😀"];
  for (let trial = 0; trial < 120; trial += 1) {
    const text = Array.from(
      { length: random(24) },
      () => alphabet[random(alphabet.length)]
    ).join("");
    const index = new SuffixArrayIndex(text);
    const pattern = Array.from(
      { length: 1 + random(4) },
      () => alphabet[random(alphabet.length)]
    ).join("");
    const chars = Array.from(text);
    const expected = [];
    for (let i = 0; i + Array.from(pattern).length <= chars.length; i += 1) {
      if (chars.slice(i, i + Array.from(pattern).length).join("") === pattern) {
        expected.push(i);
      }
    }
    assert.deepEqual(index.findAll(pattern), expected);
  }

  console.log("SuffixArrayIndex: all tests passed");
}

module.exports = {
  buildSuffixArray,
  buildLcpArray,
  SuffixArrayIndex
};

if (require.main === module) runTests();
