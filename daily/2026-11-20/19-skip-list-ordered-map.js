// Exercise: Implement an ordered map using a probabilistic skip list.
// Keys are unique; range(min, max) returns inclusive key/value pairs in order.
// Run: node daily/2026-11-20/19-skip-list-ordered-map.js
"use strict";
const assert = require("node:assert/strict");
class SkipListMap {
  constructor({ maxLevel = 12, probability = 0.5, compare = (a, b) => a - b, random = Math.random } = {}) {
    if (!Number.isInteger(maxLevel) || maxLevel < 1) throw new RangeError("maxLevel must be positive");
    if (!(probability > 0 && probability < 1)) throw new RangeError("probability must be between 0 and 1");
    if (typeof compare !== "function" || typeof random !== "function") throw new TypeError("compare and random must be functions");
    this.maxLevel = maxLevel; this.probability = probability; this.compare = compare; this.random = random;
    this.head = { key: undefined, value: undefined, forward: Array(maxLevel).fill(null) };
    this.level = 1; this.size = 0;
  }
  _randomLevel() {
    let level = 1;
    while (level < this.maxLevel) {
      const value = this.random();
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError("random must return a value in [0, 1)");
      if (value >= this.probability) break;
      level++;
    }
    return level;
  }
  _path(key) {
    const update = Array(this.maxLevel);
    let current = this.head;
    for (let level = this.level - 1; level >= 0; level--) {
      while (current.forward[level] && this.compare(current.forward[level].key, key) < 0) current = current.forward[level];
      update[level] = current;
    }
    return update;
  }
  get(key) {
    const update = this._path(key), node = update[0].forward[0];
    return node && this.compare(node.key, key) === 0 ? node.value : undefined;
  }
  has(key) {
    const node = this._path(key)[0].forward[0];
    return Boolean(node && this.compare(node.key, key) === 0);
  }
  set(key, value) {
    const update = this._path(key), next = update[0].forward[0];
    if (next && this.compare(next.key, key) === 0) { next.value = value; return this; }
    const level = this._randomLevel();
    if (level > this.level) {
      for (let i = this.level; i < level; i++) update[i] = this.head;
      this.level = level;
    }
    const node = { key, value, forward: Array(level).fill(null) };
    for (let i = 0; i < level; i++) { node.forward[i] = update[i].forward[i]; update[i].forward[i] = node; }
    this.size++;
    return this;
  }
  delete(key) {
    const update = this._path(key), node = update[0].forward[0];
    if (!node || this.compare(node.key, key) !== 0) return false;
    for (let i = 0; i < this.level; i++) {
      if (update[i].forward[i] !== node) break;
      update[i].forward[i] = node.forward[i] || null;
    }
    while (this.level > 1 && !this.head.forward[this.level - 1]) this.level--;
    this.size--;
    return true;
  }
  range(min, max) {
    if (this.compare(min, max) > 0) return [];
    let node = this._path(min)[0].forward[0], result = [];
    while (node && this.compare(node.key, max) <= 0) {
      result.push([node.key, node.value]); node = node.forward[0];
    }
    return result;
  }
}
let seed = 7;
const random = () => ((seed = (seed * 48271) % 2147483647) - 1) / 2147483646;
const map = new SkipListMap({ maxLevel: 8, random });
[8, 2, 6, 1, 9, 4].forEach(key => map.set(key, key * 10));
assert.equal(map.size, 6);
assert.equal(map.get(4), 40);
assert.equal(map.has(7), false);
assert.deepEqual(map.range(3, 8), [[4,40],[6,60],[8,80]]);
map.set(4, 41);
assert.equal(map.get(4), 41);
assert.equal(map.delete(6), true);
assert.equal(map.delete(6), false);
assert.deepEqual(map.range(0, 10).map(([key]) => key), [1,2,4,8,9]);
assert.equal(map.size, 5);
console.log("skip list ordered map: all tests passed");
