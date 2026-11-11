'use strict';

// FM-index: suffix-array construction, BWT, C/Occ tables and backward search.
// This version indexes UTF-16 code units and reserves NUL as the sentinel.
const assert = require('node:assert/strict');

function buildSuffixArray(s) {
  const n = s.length;
  const sa = Array.from({ length: n }, (_, i) => i);
  let rank = Array.from({ length: n }, (_, i) => s.charCodeAt(i));
  for (let width = 1; width < n; width *= 2) {
    sa.sort((a, b) => rank[a] - rank[b] ||
      (a + width < n ? rank[a + width] : -1) -
      (b + width < n ? rank[b + width] : -1));
    const next = new Array(n);
    let classes = 0;
    next[sa[0]] = 0;
    for (let i = 1; i < n; i++) {
      const a = sa[i - 1], b = sa[i];
      const a2 = a + width < n ? rank[a + width] : -1;
      const b2 = b + width < n ? rank[b + width] : -1;
      if (rank[a] !== rank[b] || a2 !== b2) classes++;
      next[b] = classes;
    }
    rank = next;
    if (classes === n - 1) break;
  }
  return sa;
}

class FMIndex {
  constructor(text) {
    if (typeof text !== 'string' || text.includes('\0')) throw new TypeError('text must be a string without NUL');
    this.text = text;
    const s = text + '\0';
    this.sa = buildSuffixArray(s);
    this.bwt = this.sa.map(i => s[(i + s.length - 1) % s.length]).join('');
    const freq = new Map();
    for (let i = 0; i < this.bwt.length; i++) {
      const ch = this.bwt[i];
      freq.set(ch, (freq.get(ch) || 0) + 1);
    }
    this.C = new Map();
    let total = 0;
    for (const ch of [...freq.keys()].sort()) {
      this.C.set(ch, total);
      total += freq.get(ch);
    }
    this.occ = new Map();
    for (const ch of freq.keys()) {
      const prefix = new Uint32Array(this.bwt.length + 1);
      for (let i = 0; i < this.bwt.length; i++) {
        prefix[i + 1] = prefix[i] + (this.bwt[i] === ch ? 1 : 0);
      }
      this.occ.set(ch, prefix);
    }
  }

  _validate(pattern) {
    if (typeof pattern !== 'string' || pattern.includes('\0')) {
      throw new TypeError('pattern must be a string without NUL');
    }
  }

  _range(pattern) {
    let left = 0, right = this.bwt.length;
    for (let i = pattern.length - 1; i >= 0; i--) {
      const ch = pattern[i], base = this.C.get(ch), occ = this.occ.get(ch);
      if (base === undefined) return [0, 0];
      left = base + occ[left];
      right = base + occ[right];
      if (left >= right) return [0, 0];
    }
    return [left, right];
  }

  count(pattern) {
    this._validate(pattern);
    if (pattern.length === 0) return this.text.length + 1;
    const [left, right] = this._range(pattern);
    return right - left;
  }

  locate(pattern, { limit = Infinity } = {}) {
    this._validate(pattern);
    if (!(limit === Infinity || (Number.isSafeInteger(limit) && limit >= 0))) {
      throw new RangeError('limit must be a non-negative safe integer or Infinity');
    }
    if (limit === 0) return [];
    if (pattern.length === 0) {
      return Array.from({ length: Math.min(this.text.length + 1, limit) }, (_, i) => i);
    }
    const [left, right] = this._range(pattern);
    return this.sa.slice(left, right).filter(i => i < this.text.length)
      .sort((a, b) => a - b).slice(0, limit);
  }
}

function runTests() {
  const index = new FMIndex('banana');
  assert.equal(index.count('ana'), 2);
  assert.equal(index.count('na'), 2);
  assert.equal(index.count('nana'), 1);
  assert.equal(index.count('banana'), 1);
  assert.equal(index.count('band'), 0);
  assert.deepEqual(index.locate('ana'), [1, 3]);
  assert.deepEqual(index.locate('a'), [1, 3, 5]);
  assert.deepEqual(index.locate('a', { limit: 2 }), [1, 3]);
  assert.equal(index.count(''), 7);
  assert.deepEqual(index.locate(''), [0, 1, 2, 3, 4, 5, 6]);
  assert.throws(() => new FMIndex('a\0b'), /NUL/);
  assert.throws(() => index.locate('a', { limit: -1 }), /limit/);
  const unicode = new FMIndex('\u{1F600}a\u{1F600}');
  assert.equal(unicode.count('\u{1F600}'), 2);
  assert.deepEqual(unicode.locate('\u{1F600}'), [0, 3]);

  for (const sample of ['', 'mississippi', 'abracadabra', 'aaaaaa', 'abcabcabc']) {
    const fm = new FMIndex(sample);
    for (const pattern of ['', 'a', 'ab', 'issi', 'z', sample]) {
      const expected = [];
      if (!pattern) {
        for (let i = 0; i <= sample.length; i++) expected.push(i);
      } else {
        let from = 0, found;
        while ((found = sample.indexOf(pattern, from)) !== -1) {
          expected.push(found);
          from = found + 1;
        }
      }
      assert.equal(fm.count(pattern), expected.length);
      assert.deepEqual(fm.locate(pattern), expected);
    }
  }
  console.log('fmIndex: all tests passed');
}

if (require.main === module) runTests();
module.exports = { FMIndex, buildSuffixArray };
