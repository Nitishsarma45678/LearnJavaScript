/**
 * Exercise: implement dynamic weighted sampling with a Fenwick tree.
 * Updates and draws are O(log n); zero-weight entries are never selected.
 * Sampling without replacement temporarily removes each selected weight and
 * restores the original distribution even if a supplied RNG throws.
 *
 * Run: node fenwick-weighted-sampler.js
 */
'use strict';
const assert = require('node:assert/strict');

class FenwickWeightedSampler {
  constructor(weights) {
    if (!Array.isArray(weights) || weights.length === 0) throw new TypeError('weights must be a non-empty array');
    this.weights = weights.map((weight, index) => this.#validateWeight(weight, index));
    this.tree = new Float64Array(this.weights.length + 1);
    for (let i = 0; i < this.weights.length; i++) this.#add(i, this.weights[i]);
    this.#assertFiniteTotal();
  }

  #validateWeight(weight, index) {
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) {
      throw new RangeError(`Weight at index ${index} must be a finite non-negative number`);
    }
    return weight;
  }

  #add(index, delta) {
    for (let i = index + 1; i < this.tree.length; i += i & -i) this.tree[i] += delta;
  }

  #assertFiniteTotal() {
    if (!Number.isFinite(this.totalWeight)) throw new RangeError('Total weight must remain finite');
  }

  get totalWeight() {
    let sum = 0;
    for (let i = this.weights.length; i > 0; i -= i & -i) sum += this.tree[i];
    return sum;
  }

  get size() { return this.weights.length; }

  weightAt(index) {
    this.#checkIndex(index);
    return this.weights[index];
  }

  probabilityOf(index) {
    this.#checkIndex(index);
    const total = this.totalWeight;
    return total === 0 ? 0 : this.weights[index] / total;
  }

  update(index, nextWeight) {
    this.#checkIndex(index);
    this.#validateWeight(nextWeight, index);
    const delta = nextWeight - this.weights[index];
    const nextTotal = this.totalWeight + delta;
    if (!Number.isFinite(nextTotal)) throw new RangeError('Total weight must remain finite');
    this.weights[index] = nextWeight;
    this.#add(index, delta);
    return this;
  }

  sample(rng = Math.random) {
    if (typeof rng !== 'function') throw new TypeError('rng must be a function');
    const total = this.totalWeight;
    if (!(total > 0)) throw new RangeError('Cannot sample when every weight is zero');
    const random = rng();
    if (typeof random !== 'number' || !Number.isFinite(random) || random < 0 || random >= 1) {
      throw new RangeError('rng must return a finite number in [0, 1)');
    }
    let target = random * total;
    let index = 0;
    let bit = 1;
    while ((bit << 1) < this.tree.length) bit <<= 1;
    for (; bit !== 0; bit >>= 1) {
      const next = index + bit;
      if (next < this.tree.length && this.tree[next] <= target) {
        index = next;
        target -= this.tree[next];
      }
    }
    if (index >= this.weights.length) throw new Error('Fenwick search escaped the weight array');
    return index;
  }

  sampleMany(count, { replace = true, rng = Math.random } = {}) {
    if (!Number.isSafeInteger(count) || count < 0) throw new RangeError('count must be a non-negative safe integer');
    if (typeof rng !== 'function') throw new TypeError('rng must be a function');
    if (replace) {
      if (count > 0 && !(this.totalWeight > 0)) throw new RangeError('Cannot sample when every weight is zero');
      return Array.from({ length: count }, () => this.sample(rng));
    }
    const positive = this.weights.reduce((sum, weight) => sum + (weight > 0 ? 1 : 0), 0);
    if (count > positive) throw new RangeError('Not enough positive-weight entries for sampling without replacement');
    const removed = [];
    try {
      const result = [];
      for (let i = 0; i < count; i++) {
        const index = this.sample(rng);
        removed.push([index, this.weights[index]]);
        this.update(index, 0);
        result.push(index);
      }
      return result;
    } finally {
      for (let i = removed.length - 1; i >= 0; i--) this.update(removed[i][0], removed[i][1]);
    }
  }

  snapshot() { return this.weights.slice(); }

  #checkIndex(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.weights.length) throw new RangeError('index out of range');
  }
}

function runTests() {
  const sampler = new FenwickWeightedSampler([1, 3, 0, 6]);
  assert.equal(sampler.totalWeight, 10);
  assert.equal(sampler.sample(() => 0), 0);
  assert.equal(sampler.sample(() => 0.1), 1);
  assert.equal(sampler.sample(() => 0.4), 3);
  assert.equal(sampler.sample(() => 0.999999), 3);
  assert.equal(sampler.probabilityOf(2), 0);
  sampler.update(3, 0);
  assert.equal(sampler.totalWeight, 4);
  assert.equal(sampler.sample(() => 0.99), 1);
  sampler.update(2, 2);
  assert.equal(sampler.totalWeight, 6);
  const before = sampler.snapshot();
  const chosen = sampler.sampleMany(3, { replace: false, rng: () => 0.5 });
  assert.equal(new Set(chosen).size, 3);
  assert.deepEqual(sampler.snapshot(), before, 'without-replacement sampling must restore weights');
  assert.throws(() => sampler.sampleMany(4, { replace: false }), /Not enough/);
  assert.throws(() => sampler.sample(() => 1), /\[0, 1\)/);
  assert.throws(() => sampler.update(0, -1), /non-negative/);
  assert.throws(() => sampler.sampleMany(-1), /count/);
  assert.throws(() => new FenwickWeightedSampler([Number.MAX_VALUE, Number.MAX_VALUE]), /finite/);

  // Differentially compare Fenwick selection with a linear prefix scan.
  let seed = 0xabc123;
  const rng = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 0x100000000; };
  const weights = Array.from({ length: 37 }, () => Math.floor(rng() * 8));
  const dynamic = new FenwickWeightedSampler(weights);
  for (let trial = 0; trial < 500; trial++) {
    const total = weights.reduce((a, b) => a + b, 0);
    if (!total) { const i = Math.floor(rng() * weights.length); weights[i] = 1; dynamic.update(i, 1); }
    const r = rng();
    const target = r * weights.reduce((a, b) => a + b, 0);
    let sum = 0, expected = -1;
    for (let i = 0; i < weights.length; i++) { sum += weights[i]; if (target < sum) { expected = i; break; } }
    assert.equal(dynamic.sample(() => r), expected);
    if (trial % 7 === 0) {
      const i = Math.floor(rng() * weights.length), next = Math.floor(rng() * 10);
      weights[i] = next; dynamic.update(i, next);
    }
  }
  console.log('Fenwick weighted sampler: all tests passed');
}

if (require.main === module) runTests();
module.exports = { FenwickWeightedSampler };
