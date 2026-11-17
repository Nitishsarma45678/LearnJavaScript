"use strict";

/**
 * Exercise: Build a suffix-array index for Unicode text.
 *
 * Implement prefix-doubling suffix-array construction, Kasai's LCP array,
 * binary-search pattern lookup, and longest repeated substring extraction.
 * All offsets are Unicode code-point offsets (not UTF-16 code-unit offsets).
 */

const assert = require("node:assert/strict");

function compareSymbols(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function buildSuffixArray(text) {
  if (typeof text !== "string") throw new TypeError("text must be a string");
  const symbols = Array.from(text);
  const n = symbols.length;
  if (n === 0) return [];

  let suffixes = Array.from({ length: n }, (_, i) => i);
  let ranks = symbols.map(symbol => symbol.codePointAt(0));

  for (let width = 1; width < n; width *= 2) {
    suffixes.sort((a, b) => {
      const first = ranks[a] - ranks[b];
      if (first !== 0) return first;
      const rankA = a + width < n ? ranks[a + width] : -1;
      const rankB = b + width < n ? ranks[b + width] : -1;
      return rankA - rankB;
    });

    const nextRanks = new Array(n);
    nextRanks[suffixes[0]] = 0;
    for (let i = 1; i < n; i++) {
      const previous = suffixes[i - 1];
      const current = suffixes[i];
      const previousPair = [
        ranks[previous],
        previous + width < n ? ranks[previous + width] : -1
      ];
      const currentPair = [
        ranks[current],
        current + width < n ? ranks[current + width] : -1
      ];
      const different = previousPair[0] !== currentPair[0] ||
        previousPair[1] !== currentPair[1];
      nextRanks[current] = nextRanks[previous] + (different ? 1 : 0);
    }

    ranks = nextRanks;
    if (ranks[suffixes[n - 1]] === n - 1) break;
  }

  return suffixes;
}

function buildLCP(symbols, suffixArray) {
  const n = symbols.length;
  if (n < 2) return [];

  const rank = new Array(n);
  for (let i = 0; i < n; i++) rank[suffixArray[i]] = i;

  // lcp[i] is the common-prefix length of suffixes[i] and suffixes[i + 1].
  const lcp = new Array(n - 1).fill(0);
  let matched = 0;

  for (let start = 0; start < n; start++) {
    const order = rank[start];
    if (order === n - 1) {
      matched = 0;
      continue;
    }

    const other = suffixArray[order + 1];
    while (
      start + matched < n &&
      other + matched < n &&
      symbols[start + matched] === symbols[other + matched]
    ) {
      matched++;
    }
    lcp[order] = matched;
    if (matched > 0) matched--;
  }

  return lcp;
}

function buildSuffixIndex(text) {
  if (typeof text !== "string") throw new TypeError("text must be a string");
  const symbols = Array.from(text);
  const suffixArray = buildSuffixArray(text);
  return {
    text,
    symbols,
    suffixArray,
    lcp: buildLCP(symbols, suffixArray)
  };
}

function compareSuffixToPattern(symbols, start, pattern) {
  let offset = 0;
  while (offset < pattern.length && start + offset < symbols.length) {
    const order = compareSymbols(symbols[start + offset], pattern[offset]);
    if (order !== 0) return order;
    offset++;
  }

  // A suffix beginning with the whole pattern compares equal to the pattern.
  if (offset === pattern.length) return 0;
  return -1; // The suffix ended before the pattern did.
}

function lowerBoundMatches(index, pattern, upper) {
  let low = 0;
  let high = index.suffixArray.length;

  while (low < high) {
    const mid = (low + high) >>> 1;
    const order = compareSuffixToPattern(
      index.symbols,
      index.suffixArray[mid],
      pattern
    );
    if (order < 0 || (upper && order === 0)) low = mid + 1;
    else high = mid;
  }
  return low;
}

function findOccurrences(index, pattern) {
  if (!index || !Array.isArray(index.symbols) || !Array.isArray(index.suffixArray)) {
    throw new TypeError("index must be created by buildSuffixIndex");
  }
  if (typeof pattern !== "string") throw new TypeError("pattern must be a string");

  const target = Array.from(pattern);
  if (target.length === 0) {
    return Array.from({ length: index.symbols.length + 1 }, (_, i) => i);
  }

  const first = lowerBoundMatches(index, target, false);
  const last = lowerBoundMatches(index, target, true);
  return index.suffixArray.slice(first, last).sort((a, b) => a - b);
}

function longestRepeatedSubstring(index) {
  if (!index || !Array.isArray(index.lcp)) {
    throw new TypeError("index must be created by buildSuffixIndex");
  }
  if (index.lcp.length === 0) return { value: "", length: 0, offset: -1 };

  let bestLength = 0;
  let bestOffset = -1;
  for (let i = 0; i < index.lcp.length; i++) {
    if (index.lcp[i] > bestLength) {
      bestLength = index.lcp[i];
      bestOffset = index.suffixArray[i];
    }
  }

  return {
    value: bestLength === 0
      ? ""
      : index.symbols.slice(bestOffset, bestOffset + bestLength).join(""),
    length: bestLength,
    offset: bestOffset
  };
}

function naiveOccurrences(text, pattern) {
  const symbols = Array.from(text);
  const target = Array.from(pattern);
  if (target.length === 0) {
    return Array.from({ length: symbols.length + 1 }, (_, i) => i);
  }
  const matches = [];
  for (let i = 0; i + target.length <= symbols.length; i++) {
    if (target.every((symbol, j) => symbols[i + j] === symbol)) matches.push(i);
  }
  return matches;
}

function runTests() {
  const banana = buildSuffixIndex("banana");
  assert.deepEqual(banana.suffixArray, [5, 3, 1, 0, 4, 2]);
  assert.deepEqual(banana.lcp, [1, 3, 0, 0, 2]);
  assert.deepEqual(findOccurrences(banana, "ana"), [1, 3]);
  assert.deepEqual(findOccurrences(banana, "na"), [2, 4]);
  assert.deepEqual(findOccurrences(banana, "xyz"), []);
  assert.deepEqual(findOccurrences(banana, ""), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(longestRepeatedSubstring(banana), {
    value: "ana",
    length: 3,
    offset: 3
  });

  const unicode = buildSuffixIndex("🙂a🙂a");
  assert.deepEqual(findOccurrences(unicode, "🙂a"), [0, 2]);
  assert.deepEqual(findOccurrences(unicode, "a"), [1, 3]);
  assert.equal(unicode.symbols.length, 4);

  assert.deepEqual(buildSuffixIndex("").suffixArray, []);
  assert.deepEqual(buildSuffixIndex("x").lcp, []);
  assert.throws(() => buildSuffixIndex(42), TypeError);

  // Differential testing against a straightforward matcher.
  let seed = 0x51ff1;
  const random = max => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed % max;
  };
  const alphabet = ["a", "b", "c", "🙂"];
  for (let trial = 0; trial < 180; trial++) {
    const text = Array.from({ length: random(18) }, () => alphabet[random(alphabet.length)]).join("");
    const index = buildSuffixIndex(text);
    const pattern = Array.from(
      { length: random(5) },
      () => alphabet[random(alphabet.length)]
    ).join("");
    assert.deepEqual(findOccurrences(index, pattern), naiveOccurrences(text, pattern));

    const expectedSuffixes = Array.from(
      { length: Array.from(text).length },
      (_, i) => i
    ).sort((a, b) => {
      const symbols = Array.from(text);
      return compareSymbols(symbols.slice(a).join(""), symbols.slice(b).join(""));
    });
    assert.deepEqual(index.suffixArray, expectedSuffixes);
  }

  console.log("Suffix-array index: all tests passed");
}

module.exports = {
  buildSuffixArray,
  buildSuffixIndex,
  findOccurrences,
  longestRepeatedSubstring
};

if (require.main === module) runTests();
