// Build a suffix array with prefix doubling, then compute adjacent LCP values with Kasai's algorithm.
// Positions are Unicode code-point indices (not UTF-16 code-unit offsets).
// Run with: node suffix-array-and-lcp.js
const assert = require("node:assert/strict");

function buildSuffixArray(input) {
  const chars = Array.from(input);
  const n = chars.length;
  if (n === 0) return { suffixArray: [], lcp: [] };

  let suffixArray = Array.from({ length: n }, (_, index) => index);
  const alphabet = [...new Set(chars)].sort();
  const charRank = new Map(alphabet.map((char, rank) => [char, rank]));
  let rank = chars.map((char) => charRank.get(char));

  for (let width = 1; width < n; width *= 2) {
    suffixArray.sort((a, b) => {
      if (rank[a] !== rank[b]) return rank[a] - rank[b];
      const nextA = a + width < n ? rank[a + width] : -1;
      const nextB = b + width < n ? rank[b + width] : -1;
      return nextA - nextB;
    });

    const nextRank = new Array(n);
    let classId = 0;
    nextRank[suffixArray[0]] = 0;

    for (let i = 1; i < n; i += 1) {
      const previous = suffixArray[i - 1];
      const current = suffixArray[i];
      const previousPair = [
        rank[previous],
        previous + width < n ? rank[previous + width] : -1,
      ];
      const currentPair = [
        rank[current],
        current + width < n ? rank[current + width] : -1,
      ];

      if (
        previousPair[0] !== currentPair[0] ||
        previousPair[1] !== currentPair[1]
      ) {
        classId += 1;
      }
      nextRank[current] = classId;
    }

    rank = nextRank;
    if (classId === n - 1) break;
  }

  const lcp = new Array(n).fill(0);
  const inverse = new Array(n);
  suffixArray.forEach((start, order) => {
    inverse[start] = order;
  });

  let common = 0;
  for (let start = 0; start < n; start += 1) {
    const order = inverse[start];
    if (order === 0) continue;

    const previousStart = suffixArray[order - 1];
    while (
      start + common < n &&
      previousStart + common < n &&
      chars[start + common] === chars[previousStart + common]
    ) {
      common += 1;
    }

    lcp[order] = common;
    if (common > 0) common -= 1;
  }

  return { suffixArray, lcp };
}

function naiveSuffixArray(input) {
  const chars = Array.from(input);
  return Array.from({ length: chars.length }, (_, index) => index)
    .sort((a, b) => {
      const left = chars.slice(a).join("");
      const right = chars.slice(b).join("");
      return left < right ? -1 : left > right ? 1 : 0;
    });
}

const banana = buildSuffixArray("banana");
assert.deepEqual(banana.suffixArray, [5, 3, 1, 0, 4, 2]);
assert.deepEqual(banana.lcp, [0, 1, 3, 0, 0, 2]);

const unicode = buildSuffixArray("😀a😀");
assert.deepEqual(unicode.suffixArray, [1, 2, 0]);
assert.deepEqual(unicode.lcp, [0, 0, 1]);

for (const sample of ["", "a", "aaaa", "mississippi", "abracadabra", "🙂a🙂b"]) {
  const result = buildSuffixArray(sample);
  assert.deepEqual(result.suffixArray, naiveSuffixArray(sample), "suffix order for " + sample);
  assert.equal(result.lcp.length, Array.from(sample).length);
}

console.log("Suffix array and LCP: all assertions passed");
