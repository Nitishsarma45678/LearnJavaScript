// Exercise: Implement a counting Bloom filter with double hashing and safe removal.
// Exact insertion counts prevent removing an item that was never added.
// Run: node daily/2026-11-20/13-counting-bloom-filter.js
"use strict";
const assert = require("node:assert/strict");
function hash32(text, seed) {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
class CountingBloomFilter {
  constructor(size, hashCount) {
    if (!Number.isInteger(size) || size < 1) throw new RangeError("size must be positive");
    if (!Number.isInteger(hashCount) || hashCount < 1) throw new RangeError("hashCount must be positive");
    this.counters = new Uint32Array(size);
    this.hashCount = hashCount;
    this.insertions = new Map();
  }
  _positions(value) {
    if (typeof value !== "string") throw new TypeError("values must be strings");
    const first = hash32(value, 0x811c9dc5);
    const second = (hash32(value, 0x9e3779b9) | 1) >>> 0;
    return Array.from({ length: this.hashCount }, (_, i) => (first + Math.imul(i, second)) >>> 0)
      .map(hash => hash % this.counters.length);
  }
  add(value) {
    const positions = this._positions(value);
    for (const position of positions) {
      if (this.counters[position] === 0xffffffff) throw new RangeError("counter overflow");
    }
    for (const position of positions) this.counters[position]++;
    this.insertions.set(value, (this.insertions.get(value) || 0) + 1);
  }
  has(value) {
    return this._positions(value).every(position => this.counters[position] > 0);
  }
  remove(value) {
    const count = this.insertions.get(value) || 0;
    if (count === 0) return false;
    for (const position of this._positions(value)) this.counters[position]--;
    if (count === 1) this.insertions.delete(value);
    else this.insertions.set(value, count - 1);
    return true;
  }
  get distinctInsertedValues() { return this.insertions.size; }
}
const filter = new CountingBloomFilter(256, 4);
for (const value of ["alpha", "beta", "gamma", "delta"]) filter.add(value);
for (const value of ["alpha", "beta", "gamma", "delta"]) assert.equal(filter.has(value), true);
filter.add("alpha");
assert.equal(filter.remove("alpha"), true);
assert.equal(filter.has("alpha"), true, "one duplicate insertion remains");
assert.equal(filter.remove("alpha"), true);
assert.equal(filter.has("alpha"), false);
assert.equal(filter.remove("alpha"), false, "cannot remove an untracked insertion");
assert.equal(filter.distinctInsertedValues, 3);
assert.throws(() => filter.add(123), /strings/);
assert.throws(() => new CountingBloomFilter(0, 3), /size/);
console.log("counting Bloom filter: all tests passed");
