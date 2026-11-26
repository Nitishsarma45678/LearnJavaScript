'use strict';

// Exercise: enumerate bounded word segmentations using a trie and memoized recursion.
// Results are deterministic and empty dictionary words are rejected.

const assert = require('node:assert/strict');

function segmentWords(text, dictionary, { maxResults = 100 } = {}) {
  if (typeof text !== 'string' || !Array.isArray(dictionary)) {
    throw new TypeError('text and dictionary are required');
  }
  if (!Number.isInteger(maxResults) || maxResults < 0) {
    throw new RangeError('maxResults must be a non-negative integer');
  }
  if (maxResults === 0) return [];

  const root = { next: new Map(), terminal: false };
  for (const word of new Set(dictionary)) {
    if (typeof word !== 'string' || word.length === 0) {
      throw new TypeError('dictionary words must be non-empty strings');
    }
    let node = root;
    for (const char of Array.from(word)) {
      if (!node.next.has(char)) node.next.set(char, { next: new Map(), terminal: false });
      node = node.next.get(char);
    }
    node.terminal = true;
  }

  const chars = Array.from(text);
  const memo = new Map();
  function solve(start) {
    if (start === chars.length) return [[]];
    if (memo.has(start)) return memo.get(start);

    const results = [];
    let node = root;
    for (let end = start; end < chars.length; end += 1) {
      node = node.next.get(chars[end]);
      if (!node) break;
      if (!node.terminal) continue;

      const word = chars.slice(start, end + 1).join('');
      for (const suffix of solve(end + 1)) {
        results.push([word, ...suffix]);
        if (results.length >= maxResults) break;
      }
      if (results.length >= maxResults) break;
    }
    memo.set(start, results);
    return results;
  }

  return solve(0).map((parts) => parts.join(' '));
}

assert.deepEqual(segmentWords('catsanddog', ['cat', 'cats', 'and', 'sand', 'dog']),
  ['cat sand dog', 'cats and dog']);
assert.deepEqual(segmentWords('aaaa', ['a', 'aa', 'aaa'], { maxResults: 3 }),
  ['a a a a', 'a a aa', 'a aa a']);
assert.deepEqual(segmentWords('', ['anything']), ['']);
assert.deepEqual(segmentWords('impossible', ['possible']), []);
assert.throws(() => segmentWords('x', ['']), TypeError);

module.exports = { segmentWords };
