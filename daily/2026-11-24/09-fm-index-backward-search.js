'use strict';

const assert = require('node:assert/strict');

function buildFMIndex(text) {
  if (text.includes('$')) throw new TypeError('Text must not contain the reserved sentinel $');
  const source = text + '$';
  const suffixArray = Array.from({ length: source.length }, (_, index) => index)
    .sort((a, b) => {
      const left = source.slice(a), right = source.slice(b);
      return left < right ? -1 : left > right ? 1 : 0;
    });
  const bwt = suffixArray.map(index => index === 0 ? '$' : source[index - 1]).join('');
  const alphabet = Array.from(new Set(bwt)).sort();
  const counts = new Map();
  for (const char of bwt) counts.set(char, (counts.get(char) || 0) + 1);
  const first = new Map();
  let offset = 0;
  for (const char of alphabet) { first.set(char, offset); offset += counts.get(char); }

  const occurrences = new Map();
  for (const char of alphabet) {
    const prefix = Array(bwt.length + 1).fill(0);
    for (let i = 0; i < bwt.length; i++) prefix[i + 1] = prefix[i] + (bwt[i] === char ? 1 : 0);
    occurrences.set(char, prefix);
  }

  function range(pattern) {
    let left = 0, right = bwt.length;
    for (let i = pattern.length - 1; i >= 0; i--) {
      const char = pattern[i];
      if (!first.has(char)) return [0, 0];
      const occ = occurrences.get(char);
      left = first.get(char) + occ[left];
      right = first.get(char) + occ[right];
      if (left >= right) return [0, 0];
    }
    return [left, right];
  }

  function locate(pattern) {
    const [left, right] = range(pattern);
    return suffixArray.slice(left, right).filter(index => index < text.length).sort((a, b) => a - b);
  }

  return Object.freeze({ text, bwt, suffixArray, range, locate });
}

const index = buildFMIndex('banana');
assert.deepEqual(index.locate('ana'), [1, 3]);
assert.deepEqual(index.locate('na'), [2, 4]);
assert.deepEqual(index.locate('banana'), [0]);
assert.deepEqual(index.locate('orange'), []);
assert.equal(index.range('ana')[1] - index.range('ana')[0], 2);
assert.throws(() => buildFMIndex('a$b'), /reserved sentinel/);
console.log('FM-index examples passed.');

module.exports = { buildFMIndex };
