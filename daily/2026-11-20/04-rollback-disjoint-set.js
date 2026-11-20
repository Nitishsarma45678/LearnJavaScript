// Exercise: Implement disjoint-set union with snapshots and rollback.
// Path compression is intentionally omitted because it complicates undo.
// Run: node daily/2026-11-20/04-rollback-disjoint-set.js
"use strict";
const assert = require("node:assert/strict");
class RollbackDisjointSet {
  constructor(size) {
    if (!Number.isInteger(size) || size < 0) throw new RangeError("size must be non-negative");
    this.parent = Array.from({ length: size }, (_, index) => index);
    this.componentSize = Array(size).fill(1);
    this.components = size;
    this.history = [];
  }
  _check(value) {
    if (!Number.isInteger(value) || value < 0 || value >= this.parent.length) throw new RangeError("element out of range");
  }
  find(value) { this._check(value); while (value !== this.parent[value]) value = this.parent[value]; return value; }
  connected(a, b) { return this.find(a) === this.find(b); }
  union(a, b) {
    let rootA = this.find(a), rootB = this.find(b);
    if (rootA === rootB) { this.history.push(null); return false; }
    if (this.componentSize[rootA] < this.componentSize[rootB]) [rootA, rootB] = [rootB, rootA];
    this.history.push({ childRoot: rootB, parentRoot: rootA, oldParentSize: this.componentSize[rootA] });
    this.parent[rootB] = rootA;
    this.componentSize[rootA] += this.componentSize[rootB];
    this.components -= 1;
    return true;
  }
  snapshot() { return this.history.length; }
  rollback(snapshot) {
    if (!Number.isInteger(snapshot) || snapshot < 0 || snapshot > this.history.length) throw new RangeError("invalid snapshot");
    while (this.history.length > snapshot) {
      const change = this.history.pop();
      if (change === null) continue;
      this.parent[change.childRoot] = change.childRoot;
      this.componentSize[change.parentRoot] = change.oldParentSize;
      this.components += 1;
    }
  }
  sizeOf(value) { return this.componentSize[this.find(value)]; }
}
const dsu = new RollbackDisjointSet(6);
const base = dsu.snapshot();
assert.equal(dsu.union(0, 1), true);
const afterFirst = dsu.snapshot();
dsu.union(1, 2); dsu.union(3, 4);
assert.equal(dsu.components, 3);
assert.equal(dsu.sizeOf(0), 3);
assert.equal(dsu.connected(0, 2), true);
dsu.rollback(afterFirst);
assert.equal(dsu.connected(0, 2), false);
assert.equal(dsu.connected(0, 1), true);
assert.equal(dsu.components, 5);
dsu.rollback(base);
assert.equal(dsu.components, 6);
assert.equal(dsu.union(2, 2), false);
assert.equal(dsu.snapshot(), base + 1, "no-op unions must also be reversible");
dsu.rollback(base);
assert.throws(() => dsu.find(9), /out of range/);
assert.throws(() => dsu.rollback(99), /invalid snapshot/);
console.log("rollback disjoint-set: all tests passed");
