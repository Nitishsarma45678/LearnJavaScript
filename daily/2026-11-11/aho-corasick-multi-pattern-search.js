'use strict';

/**
 * Exercise: implement Aho-Corasick multi-pattern search.
 *
 * Build one trie for many non-empty patterns, add failure links with BFS,
 * and scan text in one pass. Report every match, including overlaps and
 * duplicate patterns. Positions are Unicode code-point offsets (end exclusive).
 *
 * Expected complexity: O(total pattern length + text length + match count).
 */

class AhoCorasick {
  constructor(patterns) {
    if (!Array.isArray(patterns)) throw new TypeError('patterns must be an array');
    this.patterns = patterns.map((pattern, index) => {
      if (typeof pattern !== 'string' || pattern.length === 0) {
        throw new TypeError('every pattern must be a non-empty string (index ' + index + ')');
      }
      return Array.from(pattern);
    });
    this.originalPatterns = patterns.slice();
    this.root = this._newNode();
    this._buildTrie();
    this._buildFailureLinks();
  }

  _newNode() {
    return { next: new Map(), fail: null, output: [] };
  }

  _buildTrie() {
    this.patterns.forEach((symbols, patternIndex) => {
      let node = this.root;
      for (const symbol of symbols) {
        if (!node.next.has(symbol)) node.next.set(symbol, this._newNode());
        node = node.next.get(symbol);
      }
      node.output.push(patternIndex);
    });
  }

  _buildFailureLinks() {
    const queue = [];
    this.root.fail = this.root;

    for (const child of this.root.next.values()) {
      child.fail = this.root;
      queue.push(child);
    }

    for (let head = 0; head < queue.length; head += 1) {
      const node = queue[head];

      for (const [symbol, child] of node.next) {
        let fallback = node.fail;
        while (fallback !== this.root && !fallback.next.has(symbol)) {
          fallback = fallback.fail;
        }

        child.fail = fallback.next.get(symbol) || this.root;
        child.output = child.output.concat(child.fail.output);
        child.output.sort((a, b) => a - b);
        queue.push(child);
      }
    }
  }

  search(text) {
    if (typeof text !== 'string') throw new TypeError('text must be a string');

    const symbols = Array.from(text);
    const matches = [];
    let node = this.root;

    for (let end = 0; end < symbols.length; end += 1) {
      const symbol = symbols[end];

      while (node !== this.root && !node.next.has(symbol)) node = node.fail;
      node = node.next.get(symbol) || this.root;

      for (const patternIndex of node.output) {
        const length = this.patterns[patternIndex].length;
        matches.push({
          pattern: this.originalPatterns[patternIndex],
          patternIndex,
          start: end - length + 1,
          end: end + 1
        });
      }
    }

    return matches;
  }

  countByPattern(text) {
    const counts = new Array(this.patterns.length).fill(0);
    for (const match of this.search(text)) counts[match.patternIndex] += 1;
    return counts;
  }
}

function runTests() {
  const assert = require('node:assert/strict');

  const classic = new AhoCorasick(['he', 'she', 'hers', 'his']);
  assert.deepEqual(
    classic.search('ushers').map(({ pattern, start, end }) => [pattern, start, end]),
    [['he', 2, 4], ['she', 1, 4], ['hers', 2, 6]]
  );

  const overlaps = new AhoCorasick(['aba', 'ba', 'a', 'aba']);
  assert.deepEqual(
    overlaps.search('ababa').map(({ patternIndex, start, end }) => [patternIndex, start, end]),
    [
      [2, 0, 1],
      [0, 0, 3], [1, 1, 3], [2, 2, 3], [3, 0, 3],
      [0, 2, 5], [1, 3, 5], [2, 4, 5], [3, 2, 5]
    ]
  );
  assert.deepEqual(overlaps.countByPattern('ababa'), [2, 2, 3, 2]);

  const unicode = new AhoCorasick(['猫', '猫犬', '犬']);
  assert.deepEqual(
    unicode.search('🐈猫犬').map(({ pattern, start, end }) => [pattern, start, end]),
    [['猫', 1, 2], ['猫犬', 1, 3], ['犬', 2, 3]]
  );

  assert.deepEqual(new AhoCorasick([]).search('anything'), []);
  assert.throws(() => new AhoCorasick(['ok', '']), /non-empty/);
  assert.throws(() => classic.search(42), /text must be a string/);

  // Deterministic randomized comparison against a straightforward matcher.
  let seed = 0x5eed1234;
  const random = (limit) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % limit;
  };
  const alphabet = ['a', 'b', 'c'];
  for (let trial = 0; trial < 180; trial += 1) {
    const makeWord = (min, max) => {
      const length = min + random(max - min + 1);
      return Array.from({ length }, () => alphabet[random(alphabet.length)]).join('');
    };
    const patterns = Array.from({ length: 1 + random(7) }, () => makeWord(1, 4));
    const text = makeWord(0, 24);
    const actual = new AhoCorasick(patterns).search(text)
      .map(({ patternIndex, start, end }) => [patternIndex, start, end]);
    const expected = [];
    const chars = Array.from(text);
    patterns.forEach((pattern, patternIndex) => {
      const needle = Array.from(pattern);
      for (let start = 0; start + needle.length <= chars.length; start += 1) {
        if (needle.every((value, offset) => chars[start + offset] === value)) {
          expected.push([patternIndex, start, start + needle.length]);
        }
      }
    });
    actual.sort((a, b) => a[2] - b[2] || a[0] - b[0]);
    expected.sort((a, b) => a[2] - b[2] || a[0] - b[0]);
    assert.deepEqual(actual, expected);
  }

  return { checks: 186, randomizedTrials: 180 };
}

if (typeof module !== 'undefined') {
  module.exports = { AhoCorasick, runTests };
}
