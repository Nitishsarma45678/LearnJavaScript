'use strict';

/**
 * Exercise: implement a counting Bloom filter with safe deletion handles.
 *
 * A normal Bloom filter cannot delete an item because collisions can erase
 * another item's evidence. This version returns an opaque insertion token;
 * only a live token issued by this instance can decrement its counters.
 *
 * Run: node counting-bloom-filter.js
 */

const assert = require('node:assert/strict');

function hashPair(value) {
  const text = String(value);
  let first = 0x811c9dc5;
  let second = 0x9747b28c;
  for (const character of text) {
    const code = character.codePointAt(0);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x5bd1e995) >>> 0;
  }
  if (second === 0) second = 0x27d4eb2d;
  return [first >>> 0, second >>> 0];
}

class CountingBloomFilter {
  constructor({
    expectedItems = 1000,
    falsePositiveRate = 0.01,
    size,
    hashes
  } = {}) {
    if (!Number.isInteger(expectedItems) || expectedItems < 1) {
      throw new RangeError('expectedItems must be a positive integer');
    }
    if (!(falsePositiveRate > 0 && falsePositiveRate < 1)) {
      throw new RangeError('falsePositiveRate must be between 0 and 1');
    }

    const calculatedSize = Math.ceil(
      -expectedItems * Math.log(falsePositiveRate) / (Math.LN2 * Math.LN2)
    );
    this.size = size === undefined ? calculatedSize : size;
    if (!Number.isInteger(this.size) || this.size < 1 || this.size > 100000000) {
      throw new RangeError('size must be an integer from 1 to 100000000');
    }

    const calculatedHashes = Math.max(1, Math.round((this.size / expectedItems) * Math.LN2));
    this.hashes = hashes === undefined ? calculatedHashes : hashes;
    if (!Number.isInteger(this.hashes) || this.hashes < 1 || this.hashes > 64) {
      throw new RangeError('hashes must be an integer from 1 to 64');
    }

    this.counters = new Uint32Array(this.size);
    this.itemCount = 0;
    this.tokens = new WeakMap();
  }

  _indices(value) {
    const [h1, h2] = hashPair(value);
    const indices = [];
    const seen = new Set();
    for (let i = 0; i < this.hashes; i += 1) {
      const mixed = (h1 + Math.imul(i, h2) + Math.imul(i * i, 0x9e3779b1)) >>> 0;
      const index = mixed % this.size;
      if (!seen.has(index)) {
        seen.add(index);
        indices.push(index);
      }
    }
    return indices;
  }

  add(value) {
    if (typeof value !== 'string') throw new TypeError('values must be strings');
    const indices = this._indices(value);
    for (const index of indices) {
      if (this.counters[index] === 0xffffffff) {
        throw new RangeError('counter overflow; insertion was not applied');
      }
    }
    for (const index of indices) this.counters[index] += 1;

    const token = Object.freeze({});
    this.tokens.set(token, indices);
    this.itemCount += 1;
    return token;
  }

  has(value) {
    if (typeof value !== 'string') throw new TypeError('values must be strings');
    return this._indices(value).every(index => this.counters[index] > 0);
  }

  remove(token) {
    if ((typeof token !== 'object' && typeof token !== 'function') || token === null) return false;
    const indices = this.tokens.get(token);
    if (!indices) return false;

    for (const index of indices) {
      if (this.counters[index] === 0) {
        throw new Error('counter invariant violated');
      }
    }
    for (const index of indices) this.counters[index] -= 1;
    this.tokens.delete(token);
    this.itemCount -= 1;
    return true;
  }

  estimateCount() {
    let occupied = 0;
    for (const count of this.counters) if (count > 0) occupied += 1;
    if (occupied === this.size) return Infinity;
    if (occupied === 0) return 0;
    return -(this.size / this.hashes) * Math.log(1 - occupied / this.size);
  }

  estimateFalsePositiveRate() {
    const exponent = -this.hashes * this.itemCount / this.size;
    return Math.pow(1 - Math.exp(exponent), this.hashes);
  }

  get occupiedCounters() {
    let occupied = 0;
    for (const count of this.counters) if (count > 0) occupied += 1;
    return occupied;
  }
}

function runTests() {
  const filter = new CountingBloomFilter({
    expectedItems: 500,
    falsePositiveRate: 0.005
  });
  const tokens = [];
  for (let i = 0; i < 500; i += 1) tokens.push(filter.add('user-' + i));
  for (let i = 0; i < 500; i += 1) assert.equal(filter.has('user-' + i), true);
  assert.equal(filter.itemCount, 500);
  assert.ok(filter.estimateCount() > 350);
  assert.ok(filter.estimateCount() < 700);
  assert.ok(filter.estimateFalsePositiveRate() < 0.02);

  // Duplicate insertions need separate handles and are removed independently.
  const first = filter.add('duplicate');
  const second = filter.add('duplicate');
  assert.equal(filter.has('duplicate'), true);
  assert.equal(filter.remove(first), true);
  assert.equal(filter.has('duplicate'), true);
  assert.equal(filter.remove(first), false, 'a token cannot be consumed twice');
  assert.equal(filter.remove(second), true);

  const foreign = new CountingBloomFilter({ size: 100, hashes: 3 });
  assert.equal(foreign.remove(tokens[0]), false, 'tokens are scoped to their issuing filter');
  assert.equal(filter.remove({}), false);

  for (let i = 0; i < 500; i += 1) assert.equal(filter.remove(tokens[i]), true);
  assert.equal(filter.itemCount, 0);
  assert.equal(filter.occupiedCounters, 0);
  assert.equal(filter.estimateCount(), 0);
  assert.equal(filter.has('user-123'), false);

  assert.throws(() => filter.add(42), /strings/);
  assert.throws(() => new CountingBloomFilter({ falsePositiveRate: 1 }), /between 0 and 1/);
  assert.throws(() => new CountingBloomFilter({ size: 0 }), /size/);
  console.log('Counting Bloom filter tests passed');
}

if (require.main === module) runTests();

module.exports = { CountingBloomFilter, hashPair };
