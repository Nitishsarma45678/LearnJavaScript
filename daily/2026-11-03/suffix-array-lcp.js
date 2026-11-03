const assert = require('node:assert/strict');

// Indices and LCP lengths are measured in Unicode code points, not UTF-16 units.
function buildSuffixArray(text) {
  const chars = Array.from(text);
  const n = chars.length;
  if (n === 0) return { suffixArray: [], lcp: [] };

  const alphabet = [...new Set(chars.map(ch => ch.codePointAt(0)))].sort((a, b) => a - b);
  const initialRank = new Map(alphabet.map((codePoint, index) => [codePoint, index]));
  let rank = chars.map(ch => initialRank.get(ch.codePointAt(0)));
  let suffixArray = Array.from({ length: n }, (_, i) => i);

  for (let width = 1; width < n; width *= 2) {
    suffixArray.sort((a, b) =>
      rank[a] - rank[b] ||
      (a + width < n ? rank[a + width] : -1) -
      (b + width < n ? rank[b + width] : -1)
    );

    const nextRank = new Array(n);
    let group = 0;
    nextRank[suffixArray[0]] = 0;
    for (let i = 1; i < n; i++) {
      const a = suffixArray[i - 1], b = suffixArray[i];
      const aPair = [rank[a], a + width < n ? rank[a + width] : -1];
      const bPair = [rank[b], b + width < n ? rank[b + width] : -1];
      if (aPair[0] !== bPair[0] || aPair[1] !== bPair[1]) group++;
      nextRank[b] = group;
    }
    rank = nextRank;
    if (group === n - 1) break;
  }

  // Kasai's algorithm: lcp[i] is the LCP of suffixArray[i] and suffixArray[i - 1].
  const position = new Array(n);
  suffixArray.forEach((start, i) => { position[start] = i; });
  const lcp = new Array(n).fill(0);
  let common = 0;
  for (let start = 0; start < n; start++) {
    const order = position[start];
    if (order === 0) continue;
    const previousStart = suffixArray[order - 1];
    while (
      start + common < n &&
      previousStart + common < n &&
      chars[start + common] === chars[previousStart + common]
    ) common++;
    lcp[order] = common;
    if (common > 0) common--;
  }

  return { suffixArray, lcp };
}

assert.deepEqual(buildSuffixArray('banana'), {
  suffixArray: [5, 3, 1, 0, 4, 2],
  lcp: [0, 1, 3, 0, 0, 2]
});
assert.deepEqual(buildSuffixArray('aaaa'), {
  suffixArray: [3, 2, 1, 0],
  lcp: [0, 1, 2, 3]
});
assert.deepEqual(buildSuffixArray(''), { suffixArray: [], lcp: [] });
assert.deepEqual(buildSuffixArray('😀a😀'), {
  suffixArray: [1, 2, 0],
  lcp: [0, 0, 1]
});
console.log('Suffix array and LCP tests passed');
