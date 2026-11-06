/**
 * Exercise: Suffix Array Search Index
 *
 * Build a suffix array with prefix doubling, compute the LCP array with
 * Kasai's algorithm, and support pattern lookup by two binary searches.
 * Positions are Unicode code-point offsets (not UTF-16 code-unit offsets).
 *
 * Build: O(n log^2 n) with comparison sorting; LCP: O(n);
 * search: O(m log n + occ log occ) including sorted occurrence positions.
 */

class SuffixIndex {
  constructor(text) {
    if (typeof text !== "string") throw new TypeError("text must be a string");
    this.text = text;
    this.symbols = Array.from(text);
    this.suffixArray = this._buildSuffixArray();
    this.lcp = this._buildLcp();
  }

  _buildSuffixArray() {
    const symbols = this.symbols;
    const n = symbols.length;
    if (n === 0) return [];

    const alphabet = [...new Set(symbols)].sort();
    const rankBySymbol = new Map(alphabet.map((symbol, index) => [symbol, index]));
    let rank = symbols.map(symbol => rankBySymbol.get(symbol));
    let suffixes = Array.from({ length: n }, (_, index) => index);

    for (let width = 1; width < n; width *= 2) {
      suffixes.sort((a, b) =>
        rank[a] - rank[b] ||
        (a + width < n ? rank[a + width] : -1) -
        (b + width < n ? rank[b + width] : -1)
      );

      const nextRank = Array(n);
      let classes = 0;
      nextRank[suffixes[0]] = 0;
      for (let i = 1; i < n; i++) {
        const previous = suffixes[i - 1];
        const current = suffixes[i];
        const previousSecond = previous + width < n ? rank[previous + width] : -1;
        const currentSecond = current + width < n ? rank[current + width] : -1;
        if (rank[previous] !== rank[current] || previousSecond !== currentSecond) {
          classes++;
        }
        nextRank[current] = classes;
      }
      rank = nextRank;
      if (classes === n - 1) break;
    }
    return suffixes;
  }

  _buildLcp() {
    const n = this.symbols.length;
    const lcp = Array(n).fill(0);
    if (n === 0) return lcp;

    const position = Array(n);
    this.suffixArray.forEach((start, order) => { position[start] = order; });

    let common = 0;
    for (let start = 0; start < n; start++) {
      const order = position[start];
      if (order === 0) continue;
      const previousStart = this.suffixArray[order - 1];
      while (start + common < n && previousStart + common < n &&
             this.symbols[start + common] === this.symbols[previousStart + common]) {
        common++;
      }
      lcp[order] = common;
      if (common > 0) common--;
    }
    return lcp;
  }

  _compareSuffixToPattern(start, pattern) {
    let offset = 0;
    while (offset < pattern.length && start + offset < this.symbols.length) {
      const a = this.symbols[start + offset];
      const b = pattern[offset];
      if (a < b) return -1;
      if (a > b) return 1;
      offset++;
    }
    return offset === pattern.length ? 0 : -1;
  }

  search(pattern) {
    if (typeof pattern !== "string") throw new TypeError("pattern must be a string");
    const needle = Array.from(pattern);
    const n = this.symbols.length;
    if (needle.length === 0) return Array.from({ length: n + 1 }, (_, i) => i);

    let low = 0;
    let high = n;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this._compareSuffixToPattern(this.suffixArray[middle], needle) < 0) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    const first = low;

    low = first;
    high = n;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this._compareSuffixToPattern(this.suffixArray[middle], needle) <= 0) {
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
    for (let order = 1; order < this.lcp.length; order++) {
      if (this.lcp[order] > bestLength) {
        bestLength = this.lcp[order];
        bestStart = this.suffixArray[order];
      }
    }
    return bestStart === -1 ? "" :
      this.symbols.slice(bestStart, bestStart + bestLength).join("");
  }
}

// ------------------------------ Tests -------------------------------------

function assertDeepEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(label + ": expected " + JSON.stringify(expected) +
      ", got " + JSON.stringify(actual));
  }
}

const banana = new SuffixIndex("banana");
assertDeepEqual(banana.suffixArray, [5, 3, 1, 0, 4, 2], "banana suffix order");
assertDeepEqual(banana.lcp, [0, 1, 3, 0, 0, 2], "banana LCP array");
assertDeepEqual(banana.search("ana"), [1, 3], "overlapping pattern matches");
assertDeepEqual(banana.search("na"), [2, 4], "suffix pattern matches");
assertDeepEqual(banana.search("xyz"), [], "missing pattern");
assertDeepEqual(banana.longestRepeatedSubstring(), "ana", "longest repeated substring");

const unicode = new SuffixIndex("🍎🍌🍎");
assertDeepEqual(unicode.search("🍎"), [0, 2], "code-point offsets");
assertDeepEqual(unicode.search("🍌🍎"), [1], "multi-code-point pattern");
assertDeepEqual(new SuffixIndex("").search(""), [0], "empty text and empty pattern");
assertDeepEqual(new SuffixIndex("abcd").longestRepeatedSubstring(), "", "no repetition");

if (typeof module !== "undefined") module.exports = { SuffixIndex };
