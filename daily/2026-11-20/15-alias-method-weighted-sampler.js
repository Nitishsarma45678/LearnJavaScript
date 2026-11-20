// Exercise: Build an O(n) alias table for O(1) weighted random sampling.
// The random source is injectable so tests can be deterministic.
// Run: node daily/2026-11-20/15-alias-method-weighted-sampler.js
"use strict";
const assert = require("node:assert/strict");
class AliasSampler {
  constructor(weights, random = Math.random) {
    if (!Array.isArray(weights) || weights.length === 0 ||
        weights.some(weight => !Number.isFinite(weight) || weight < 0) ||
        weights.reduce((sum, weight) => sum + weight, 0) <= 0) {
      throw new TypeError("weights must be a non-empty array of non-negative values with positive total");
    }
    if (typeof random !== "function") throw new TypeError("random must be a function");
    this.random = random;
    const n = weights.length;
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const scaled = weights.map(weight => weight * n / total);
    const small = [], large = [];
    this.probability = Array(n).fill(1);
    this.alias = Array.from({ length: n }, (_, index) => index);
    scaled.forEach((weight, index) => (weight < 1 ? small : large).push(index));
    while (small.length && large.length) {
      const low = small.pop(), high = large.pop();
      this.probability[low] = scaled[low];
      this.alias[low] = high;
      scaled[high] = scaled[high] + scaled[low] - 1;
      (scaled[high] < 1 ? small : large).push(high);
    }
    for (const index of [...small, ...large]) this.probability[index] = 1;
  }
  sample() {
    const columnRandom = this.random(), coin = this.random();
    if (![columnRandom, coin].every(value => Number.isFinite(value) && value >= 0 && value < 1)) {
      throw new RangeError("random source must return values in [0, 1)");
    }
    const column = Math.floor(columnRandom * this.probability.length);
    return coin < this.probability[column] ? column : this.alias[column];
  }
}
const values = [0.1, 0.1, 0.1, 0.9, 0.9, 0.0];
let cursor = 0;
const sampler = new AliasSampler([1, 3], () => values[cursor++]);
assert.equal(sampler.sample(), 0);
assert.equal(sampler.sample(), 1);
assert.equal(sampler.sample(), 1);
const onlySecond = new AliasSampler([0, 5], () => 0.25);
assert.equal(onlySecond.sample(), 1);
assert.throws(() => new AliasSampler([0, 0]), /positive total/);
assert.throws(() => new AliasSampler([-1, 2]), /non-negative/);
assert.throws(() => new AliasSampler([1], () => 1).sample(), /\[0, 1\)/);
console.log("alias method weighted sampler: all tests passed");
