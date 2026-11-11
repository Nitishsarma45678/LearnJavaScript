'use strict';

// MinHash estimates Jaccard similarity of character-shingle sets. Banded LSH
// indexes signatures to retrieve likely near-duplicates without comparing all
// documents. Candidate retrieval is probabilistic, not exhaustive.
const assert = require('node:assert/strict');

function hash32(text, seed) {
  let hash = (0x811c9dc5 ^ seed) >>> 0;
  for (const character of text) {
    const code = character.codePointAt(0);
    for (let shift = 0; shift < 32; shift += 8) {
      hash ^= (code >>> shift) & 255;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b) >>> 0;
  return (hash ^ (hash >>> 16)) >>> 0;
}

function shingles(text, size) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  if (!Number.isSafeInteger(size) || size < 1) throw new RangeError('shingle size must be positive');
  const points = Array.from(text);
  if (!points.length) return new Set();
  if (points.length < size) return new Set([points.join('')]);
  const result = new Set();
  for (let i = 0; i <= points.length - size; i++) {
    result.add(points.slice(i, i + size).join(''));
  }
  return result;
}

class MinHasher {
  constructor({ numHashes = 128, shingleSize = 3, seed = 0x9e3779b9 } = {}) {
    if (!Number.isSafeInteger(numHashes) || numHashes < 1) throw new RangeError('numHashes must be positive');
    if (!Number.isSafeInteger(shingleSize) || shingleSize < 1) throw new RangeError('shingleSize must be positive');
    this.numHashes = numHashes;
    this.shingleSize = shingleSize;
    this.seed = seed >>> 0;
  }

  signature(text) {
    const set = shingles(text, this.shingleSize);
    if (!set.size) return { empty: true, values: new Uint32Array(this.numHashes) };
    const values = new Uint32Array(this.numHashes);
    values.fill(0xffffffff);
    for (const shingle of set) {
      for (let i = 0; i < this.numHashes; i++) {
        const seed = (this.seed + Math.imul(i + 1, 0x9e3779b1)) >>> 0;
        const value = hash32(shingle, seed);
        if (value < values[i]) values[i] = value;
      }
    }
    return { empty: false, values };
  }

  estimateJaccard(a, b) {
    if (!a || !b || a.values.length !== this.numHashes || b.values.length !== this.numHashes) {
      throw new TypeError('signature size does not match this hasher');
    }
    if (a.empty || b.empty) return a.empty === b.empty ? 1 : 0;
    let equal = 0;
    for (let i = 0; i < this.numHashes; i++) if (a.values[i] === b.values[i]) equal++;
    return equal / this.numHashes;
  }
}

class MinHashLSHIndex {
  constructor({ numHashes = 128, bands = 16, shingleSize = 3, seed = 0x9e3779b9 } = {}) {
    if (!Number.isSafeInteger(numHashes) || numHashes < 1 ||
        !Number.isSafeInteger(bands) || bands < 1 || numHashes % bands !== 0) {
      throw new RangeError('bands must be positive and divide numHashes evenly');
    }
    this.hasher = new MinHasher({ numHashes, shingleSize, seed });
    this.bands = bands;
    this.rows = numHashes / bands;
    this.documents = new Map();
    this.buckets = new Map();
  }

  _keys(signature) {
    const keys = [];
    for (let band = 0; band < this.bands; band++) {
      const start = band * this.rows;
      keys.push(band + ':' + Array.from(signature.values.slice(start, start + this.rows)).join(','));
    }
    return keys;
  }

  add(id, text) {
    if (id === undefined || id === null) throw new TypeError('document id is required');
    if (this.documents.has(id)) throw new Error('document id already exists');
    const signature = this.hasher.signature(text);
    const keys = this._keys(signature);
    for (const key of keys) {
      if (!this.buckets.has(key)) this.buckets.set(key, new Set());
      this.buckets.get(key).add(id);
    }
    this.documents.set(id, { text, signature, keys });
    return signature;
  }

  remove(id) {
    const document = this.documents.get(id);
    if (!document) return false;
    for (const key of document.keys) {
      const bucket = this.buckets.get(key);
      bucket.delete(id);
      if (!bucket.size) this.buckets.delete(key);
    }
    this.documents.delete(id);
    return true;
  }

  query(text, { minSimilarity = 0 } = {}) {
    if (typeof minSimilarity !== 'number' || minSimilarity < 0 || minSimilarity > 1) {
      throw new RangeError('minSimilarity must be between 0 and 1');
    }
    const signature = this.hasher.signature(text);
    const candidates = new Set();
    for (const key of this._keys(signature)) {
      for (const id of this.buckets.get(key) || []) candidates.add(id);
    }
    const results = [];
    for (const id of candidates) {
      const stored = this.documents.get(id);
      const similarity = this.hasher.estimateJaccard(signature, stored.signature);
      if (similarity >= minSimilarity) results.push({ id, similarity });
    }
    results.sort((a, b) => b.similarity - a.similarity || String(a.id).localeCompare(String(b.id)));
    return results;
  }
}

function runTests() {
  assert.deepEqual([...shingles('banana', 3)].sort(), ['ana', 'ban', 'nan']);
  assert.deepEqual([...shingles('hi', 4)], ['hi']);
  assert.equal(shingles('', 2).size, 0);
  assert.throws(() => shingles('x', 0), /positive/);

  const hasher = new MinHasher({ numHashes: 128, shingleSize: 2, seed: 7 });
  const a = hasher.signature('mississippi');
  const b = hasher.signature('mississippi');
  assert.equal(hasher.estimateJaccard(a, b), 1);
  assert.equal(hasher.estimateJaccard(hasher.signature(''), hasher.signature('')), 1);
  assert.equal(hasher.estimateJaccard(hasher.signature(''), a), 0);
  const near = hasher.estimateJaccard(a, hasher.signature('mississipi'));
  assert.ok(near > 0.5 && near <= 1);

  const index = new MinHashLSHIndex({ numHashes: 128, bands: 16, shingleSize: 3, seed: 42 });
  index.add('doc-a', 'the quick brown fox jumps over the lazy dog');
  index.add('doc-b', 'completely unrelated material about databases');
  index.add('doc-c', 'the quick brown fox jumps over a lazy dog');
  const results = index.query('the quick brown fox jumps over the lazy dog');
  assert.ok(results.some(item => item.id === 'doc-a' && item.similarity === 1));
  assert.ok(results.some(item => item.id === 'doc-c'));
  assert.equal(index.remove('doc-a'), true);
  assert.equal(index.remove('doc-a'), false);
  assert.ok(!index.query('the quick brown fox jumps over the lazy dog').some(item => item.id === 'doc-a'));
  assert.throws(() => index.add('doc-b', 'duplicate id'), /already exists/);
  assert.throws(() => new MinHashLSHIndex({ numHashes: 10, bands: 3 }), /divide/);
  console.log('minHashLSH: all tests passed');
}

if (require.main === module) runTests();
module.exports = { MinHasher, MinHashLSHIndex, shingles, hash32 };
