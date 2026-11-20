// Exercise: Implement an O(1)-average LFU cache.
// When frequencies tie, evict the least recently used key in that frequency.
// Run: node daily/2026-11-20/05-lfu-cache-o1.js
"use strict";
const assert = require("node:assert/strict");
class LFUCache {
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity < 0) throw new RangeError("capacity must be non-negative");
    this.capacity = capacity; this.nodes = new Map(); this.buckets = new Map(); this.minFrequency = 0;
  }
  _bucket(frequency) { if (!this.buckets.has(frequency)) this.buckets.set(frequency, new Set()); return this.buckets.get(frequency); }
  _touch(key, node) {
    const oldFrequency = node.frequency, oldBucket = this.buckets.get(oldFrequency);
    oldBucket.delete(key);
    if (oldBucket.size === 0) { this.buckets.delete(oldFrequency); if (this.minFrequency === oldFrequency) this.minFrequency += 1; }
    node.frequency += 1; this._bucket(node.frequency).add(key);
  }
  get(key) { const node = this.nodes.get(key); if (!node) return -1; this._touch(key, node); return node.value; }
  set(key, value) {
    if (this.capacity === 0) return;
    const existing = this.nodes.get(key);
    if (existing) { existing.value = value; this._touch(key, existing); return; }
    if (this.nodes.size === this.capacity) {
      const bucket = this.buckets.get(this.minFrequency), victim = bucket.values().next().value;
      bucket.delete(victim); if (bucket.size === 0) this.buckets.delete(this.minFrequency);
      this.nodes.delete(victim);
    }
    const node = { value, frequency: 1 };
    this.nodes.set(key, node); this._bucket(1).add(key); this.minFrequency = 1;
  }
  get size() { return this.nodes.size; }
}
const cache = new LFUCache(2);
cache.set("a", 1); cache.set("b", 2);
assert.equal(cache.get("a"), 1);
cache.set("c", 3);
assert.equal(cache.get("b"), -1);
assert.equal(cache.get("c"), 3);
cache.set("d", 4);
assert.equal(cache.get("a"), -1);
assert.equal(cache.get("c"), 3);
assert.equal(cache.get("d"), 4);
const zero = new LFUCache(0); zero.set("x", 10);
assert.equal(zero.get("x"), -1);
assert.throws(() => new LFUCache(-1), /non-negative/);
console.log("LFU cache: all tests passed");
