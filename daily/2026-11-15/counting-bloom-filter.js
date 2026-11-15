'use strict';

/**
 * Counting Bloom filter with deterministic double hashing.
 * It supports approximate membership and deletion, at the cost of false
 * positives. A successful `has` check is not proof that a value was inserted;
 * removing a false positive can therefore create a false negative later.
 */
function hashPair(value) {
  const input = `${typeof value}:${String(value)}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (code + i), 0x85ebca6b) >>> 0;
  }
  // An odd second hash gives a full cycle when the counter count is a power of two.
  return [h1 >>> 0, (h2 | 1) >>> 0];
}

class CountingBloomFilter {
  constructor(expectedInsertions, falsePositiveRate = 0.01, options = {}) {
    if (!Number.isInteger(expectedInsertions) || expectedInsertions < 1) throw new RangeError('expectedInsertions must be a positive integer');
    if (!(falsePositiveRate > 0 && falsePositiveRate < 1)) throw new RangeError('falsePositiveRate must be between 0 and 1');
    const bits = Math.ceil(-expectedInsertions * Math.log(falsePositiveRate) / (Math.log(2) ** 2));
    this.size = Math.max(8, options.size ?? bits);
    this.hashCount = Math.max(1, options.hashCount ?? Math.round((this.size / expectedInsertions) * Math.log(2)));
    if (!Number.isInteger(this.size) || this.size < 1 || !Number.isInteger(this.hashCount) || this.hashCount < 1) throw new RangeError('invalid filter dimensions');
    this.maxCounter = options.maxCounter ?? 0xffffffff;
    if (!Number.isInteger(this.maxCounter) || this.maxCounter < 1 || this.maxCounter > 0xffffffff) throw new RangeError('maxCounter must fit a positive Uint32 counter');
    this.counters = new Uint32Array(this.size);
    this.insertions = 0;
    this.saturatedIncrements = 0;
  }

  _positions(value) {
    const [h1, h2] = hashPair(value);
    const positions = new Set();
    for (let i = 0; positions.size < Math.min(this.hashCount, this.size); i++) {
      // Quadratic term reduces clustering when the two base hashes correlate.
      positions.add(((h1 + Math.imul(i, h2) + Math.imul(i, i)) >>> 0) % this.size);
      if (i >= this.size * 2) break;
    }
    for (let i = 0; positions.size < Math.min(this.hashCount, this.size); i++) {
      positions.add((h1 + i) % this.size);
    }
    return [...positions];
  }

  add(value) {
    for (const index of this._positions(value)) {
      if (this.counters[index] < this.maxCounter) this.counters[index]++;
      else this.saturatedIncrements++;
    }
    this.insertions++;
    return this;
  }

  has(value) {
    return this._positions(value).every(index => this.counters[index] > 0);
  }

  remove(value) {
    if (!this.has(value)) return false;
    for (const index of this._positions(value)) this.counters[index]--;
    this.insertions = Math.max(0, this.insertions - 1);
    return true;
  }

  clear() {
    this.counters.fill(0);
    this.insertions = 0;
    this.saturatedIncrements = 0;
  }

  merge(other) {
    if (!(other instanceof CountingBloomFilter)) throw new TypeError('can only merge another CountingBloomFilter');
    if (this.size !== other.size || this.hashCount !== other.hashCount || this.maxCounter !== other.maxCounter) {
      throw new RangeError('filters must have identical dimensions and counter limits');
    }
    for (let i = 0; i < this.size; i++) {
      const sum = this.counters[i] + other.counters[i];
      if (sum > this.maxCounter) {
        this.saturatedIncrements += sum - this.maxCounter;
        this.counters[i] = this.maxCounter;
      } else this.counters[i] = sum;
    }
    this.insertions += other.insertions;
    return this;
  }

  estimateFalsePositiveRate() {
    let occupied = 0;
    for (const count of this.counters) if (count > 0) occupied++;
    return (occupied / this.size) ** this.hashCount;
  }

  stats() {
    let occupied = 0, maxObserved = 0;
    for (const count of this.counters) {
      if (count > 0) occupied++;
      if (count > maxObserved) maxObserved = count;
    }
    return {
      size: this.size,
      hashCount: this.hashCount,
      insertions: this.insertions,
      occupiedCounters: occupied,
      estimatedFalsePositiveRate: this.estimateFalsePositiveRate(),
      maxObservedCounter: maxObserved,
      saturatedIncrements: this.saturatedIncrements
    };
  }
}

function runTests() {
  const assert = require('node:assert/strict');
  const filter = new CountingBloomFilter(1000, 0.01);
  const inserted = Array.from({ length: 500 }, (_, i) => `user:${i}`);
  inserted.forEach(value => filter.add(value));
  for (const value of inserted) assert.equal(filter.has(value), true);
  assert.equal(filter.remove('definitely-not-inserted'), false);
  assert.equal(filter.remove('user:10'), true);
  assert.equal(filter.has('user:10'), false);
  assert.equal(filter.has('user:11'), true);
  assert.ok(filter.stats().estimatedFalsePositiveRate < 0.05);

  const left = new CountingBloomFilter(100, 0.02, { size: 512, hashCount: 4 });
  const right = new CountingBloomFilter(100, 0.02, { size: 512, hashCount: 4 });
  left.add('alpha'); right.add('beta'); left.merge(right);
  assert.equal(left.has('alpha'), true);
  assert.equal(left.has('beta'), true);
  assert.throws(() => left.merge(new CountingBloomFilter(100, 0.02)), RangeError);

  const tiny = new CountingBloomFilter(4, 0.1, { size: 8, hashCount: 3, maxCounter: 2 });
  tiny.add('repeat').add('repeat').add('repeat');
  assert.ok(tiny.stats().saturatedIncrements > 0);
  tiny.clear();
  assert.equal(tiny.has('repeat'), false);
  assert.equal(tiny.stats().insertions, 0);

  // A probabilistic check: measure false positives without assuming none exist.
  const probe = new CountingBloomFilter(300, 0.02);
  for (let i = 0; i < 300; i++) probe.add(`known-${i}`);
  let falsePositives = 0;
  for (let i = 0; i < 5000; i++) if (probe.has(`unknown-${i}`)) falsePositives++;
  assert.ok(falsePositives < 400, `unexpected false-positive count: ${falsePositives}`);
  console.log('Counting Bloom filter tests passed', { falsePositives, stats: probe.stats() });
}

if (require.main === module) runTests();
module.exports = { CountingBloomFilter };
