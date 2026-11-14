/**
 * Suffix Array + LCP Index
 * ------------------------
 * Build a suffix array for a Unicode string, support pattern lookup, compare
 * suffixes, answer longest-common-prefix queries, and find a longest repeated
 * substring.
 *
 * Complexity:
 *   suffix array: O(n log^2 n) with comparison sorting
 *   Kasai LCP:     O(n)
 *   sparse table:  O(n log n) build, O(1) LCP query
 *   pattern find:  O(m log n + k log k), where k matches are returned
 *
 * Run: node suffix-array-lcp-index.js
 */

'use strict';

const assert = require('node:assert/strict');

function buildSuffixArray(text) {
  const symbols = Array.from(text);
  const n = symbols.length;
  if (n === 0) return { symbols, suffixArray: [], rank: [] };

  const suffixArray = Array.from({ length: n }, (_, i) => i);
  let rank = symbols.map((symbol) => symbol.codePointAt(0));
  let nextRank = new Array(n);

  for (let width = 1; width < n; width *= 2) {
    suffixArray.sort((a, b) => {
      if (rank[a] !== rank[b]) return rank[a] - rank[b];
      const ra = a + width < n ? rank[a + width] : -1;
      const rb = b + width < n ? rank[b + width] : -1;
      return ra - rb;
    });

    nextRank[suffixArray[0]] = 0;
    for (let i = 1; i < n; i += 1) {
      const previous = suffixArray[i - 1];
      const current = suffixArray[i];
      const previousSecond =
        previous + width < n ? rank[previous + width] : -1;
      const currentSecond =
        current + width < n ? rank[current + width] : -1;

      const different =
        rank[previous] !== rank[current] ||
        previousSecond !== currentSecond;

      nextRank[current] = nextRank[previous] + (different ? 1 : 0);
    }

    [rank, nextRank] = [nextRank, rank];
    if (rank[suffixArray[n - 1]] === n - 1) break;
  }

  const inverseRank = new Array(n);
  suffixArray.forEach((start, order) => {
    inverseRank[start] = order;
  });

  return { symbols, suffixArray, rank: inverseRank };
}

function buildLCP(symbols, suffixArray, inverseRank) {
  const n = symbols.length;
  const lcp = new Array(Math.max(0, n - 1)).fill(0);
  let matched = 0;

  for (let start = 0; start < n; start += 1) {
    const order = inverseRank[start];
    if (order === n - 1) {
      matched = 0;
      continue;
    }

    const nextStart = suffixArray[order + 1];
    while (
      start + matched < n &&
      nextStart + matched < n &&
      symbols[start + matched] === symbols[nextStart + matched]
    ) {
      matched += 1;
    }

    lcp[order] = matched;
    if (matched > 0) matched -= 1;
  }

  return lcp;
}

function buildSparseMinimum(values) {
  const n = values.length;
  const logs = new Array(n + 1).fill(0);
  for (let i = 2; i <= n; i += 1) logs[i] = logs[Math.floor(i / 2)] + 1;

  const levels = n === 0 ? 0 : logs[n] + 1;
  const table = Array.from({ length: levels }, () => new Array(n));

  if (n > 0) table[0] = values.slice();
  for (let level = 1; level < levels; level += 1) {
    const half = 1 << (level - 1);
    const span = half * 2;
    for (let i = 0; i + span <= n; i += 1) {
      table[level][i] = Math.min(
        table[level - 1][i],
        table[level - 1][i + half]
      );
    }
  }

  return {
    query(left, right) {
      if (left > right) return Infinity;
      const length = right - left + 1;
      const level = logs[length];
      const span = 1 << level;
      return Math.min(
        table[level][left],
        table[level][right - span + 1]
      );
    }
  };
}

class SuffixArrayIndex {
  constructor(text) {
    if (typeof text !== 'string') throw new TypeError('text must be a string');
    const built = buildSuffixArray(text);
    this.text = text;
    this.symbols = built.symbols;
    this.suffixArray = built.suffixArray;
    this.rank = built.rank;
    this.lcp = buildLCP(this.symbols, this.suffixArray, this.rank);
    this.rmq = buildSparseMinimum(this.lcp);
  }

  get length() {
    return this.symbols.length;
  }

  suffixAt(order) {
    if (!Number.isInteger(order) || order < 0 || order >= this.length) {
      throw new RangeError('suffix order is out of range');
    }
    const start = this.suffixArray[order];
    return this.symbols.slice(start).join('');
  }

  compareSuffixes(firstStart, secondStart) {
    this.#checkPosition(firstStart);
    this.#checkPosition(secondStart);
    if (firstStart === secondStart) return 0;
    return Math.sign(this.rank[firstStart] - this.rank[secondStart]);
  }

  lcpOfSuffixes(firstStart, secondStart) {
    this.#checkPosition(firstStart);
    this.#checkPosition(secondStart);
    if (firstStart === secondStart) return this.length - firstStart;

    const left = Math.min(this.rank[firstStart], this.rank[secondStart]);
    const right = Math.max(this.rank[firstStart], this.rank[secondStart]) - 1;
    return this.rmq.query(left, right);
  }

  find(pattern) {
    if (typeof pattern !== 'string') throw new TypeError('pattern must be a string');
    const needle = Array.from(pattern);
    if (needle.length === 0) {
      return Array.from({ length: this.length + 1 }, (_, i) => i);
    }

    const compareAt = (start) => {
      let offset = 0;
      while (offset < needle.length && start + offset < this.length) {
        const a = this.symbols[start + offset].codePointAt(0);
        const b = needle[offset].codePointAt(0);
        if (a !== b) return a < b ? -1 : 1;
        offset += 1;
      }
      if (offset === needle.length) return 0;
      return -1;
    };

    const lowerBound = (strict) => {
      let low = 0;
      let high = this.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        const comparison = compareAt(this.suffixArray[middle]);
        if (comparison < 0 || (strict && comparison === 0)) {
          low = middle + 1;
        } else {
          high = middle;
        }
      }
      return low;
    };

    const first = lowerBound(false);
    const afterLast = lowerBound(true);
    return this.suffixArray.slice(first, afterLast).sort((a, b) => a - b);
  }

  longestRepeatedSubstring() {
    if (this.lcp.length === 0) return { substring: '', length: 0, positions: [] };
    let bestLength = 0;
    let bestOrder = -1;

    for (let order = 0; order < this.lcp.length; order += 1) {
      if (this.lcp[order] > bestLength) {
        bestLength = this.lcp[order];
        bestOrder = order;
      }
    }

    if (bestLength === 0) return { substring: '', length: 0, positions: [] };
    const first = this.suffixArray[bestOrder];
    const second = this.suffixArray[bestOrder + 1];
    return {
      substring: this.symbols.slice(first, first + bestLength).join(''),
      length: bestLength,
      positions: [first, second].sort((a, b) => a - b)
    };
  }

  #checkPosition(position) {
    if (!Number.isInteger(position) || position < 0 || position >= this.length) {
      throw new RangeError('suffix start is out of range');
    }
  }
}

// ------------------------------ Example tests ------------------------------

function naiveSuffixArray(text) {
  return Array.from({ length: Array.from(text).length }, (_, i) => i)
    .sort((a, b) => {
      const symbols = Array.from(text);
      const left = symbols.slice(a).join('');
      const right = symbols.slice(b).join('');
      return left < right ? -1 : left > right ? 1 : 0;
    });
}

function runTests() {
  const banana = new SuffixArrayIndex('banana');
  assert.deepEqual(banana.suffixArray, [5, 3, 1, 0, 4, 2]);
  assert.deepEqual(banana.find('ana'), [1, 3]);
  assert.deepEqual(banana.find('nana'), [2]);
  assert.equal(banana.lcpOfSuffixes(1, 3), 3);
  assert.deepEqual(banana.longestRepeatedSubstring(), {
    substring: 'ana',
    length: 3,
    positions: [1, 3]
  });

  const unicode = new SuffixArrayIndex('🙂a🙂a');
  assert.deepEqual(unicode.find('🙂a'), [0, 2]);
  assert.equal(unicode.length, 4);
  assert.equal(new SuffixArrayIndex('').find('').length, 1);
  assert.deepEqual(new SuffixArrayIndex('abc').longestRepeatedSubstring(), {
    substring: '', length: 0, positions: []
  });

  let seed = 0x51ff1;
  const random = (limit) => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed % limit;
  };
  const alphabet = ['a', 'b', 'c', '🙂'];
  for (let trial = 0; trial < 250; trial += 1) {
    const size = random(24);
    const text = Array.from({ length: size }, () => alphabet[random(alphabet.length)]).join('');
    const index = new SuffixArrayIndex(text);
    assert.deepEqual(index.suffixArray, naiveSuffixArray(text));

    for (let query = 0; query < 12 && size > 0; query += 1) {
      const a = random(size);
      const b = random(size);
      let expected = 0;
      while (
        a + expected < size &&
        b + expected < size &&
        Array.from(text)[a + expected] === Array.from(text)[b + expected]
      ) expected += 1;
      assert.equal(index.lcpOfSuffixes(a, b), expected);
    }
  }

  assert.throws(() => banana.lcpOfSuffixes(-1, 2), RangeError);
  console.log('SuffixArrayIndex: all tests passed');
}

if (require.main === module) runTests();

module.exports = { SuffixArrayIndex, buildSuffixArray, buildLCP };
