'use strict';

// Rollback Disjoint Set Union (Union-Find)
// Supports snapshots and undoing unions. Path compression is intentionally
// omitted because it would require logging every parent rewrite.
const assert = require('node:assert/strict');

class RollbackDisjointSet {
  constructor(size) {
    if (!Number.isInteger(size) || size < 0) {
      throw new TypeError('size must be a non-negative integer');
    }
    this.parent = Array.from({ length: size }, (_, i) => i);
    this.sizes = Array(size).fill(1);
    this.components = size;
    this.history = [];
  }

  _check(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.parent.length) {
      throw new RangeError('element index is out of range');
    }
  }

  find(index) {
    this._check(index);
    while (this.parent[index] !== index) index = this.parent[index];
    return index;
  }

  connected(a, b) {
    return this.find(a) === this.find(b);
  }

  componentSize(index) {
    return this.sizes[this.find(index)];
  }

  snapshot() {
    return this.history.length;
  }

  union(a, b) {
    let rootA = this.find(a);
    let rootB = this.find(b);

    if (rootA === rootB) {
      // Record a no-op so every union call corresponds to one history entry.
      this.history.push(null);
      return false;
    }

    if (this.sizes[rootA] < this.sizes[rootB]) {
      [rootA, rootB] = [rootB, rootA];
    }

    this.history.push({
      childRoot: rootB,
      parentRoot: rootA,
      previousParentSize: this.sizes[rootA],
      previousComponentCount: this.components
    });

    this.parent[rootB] = rootA;
    this.sizes[rootA] += this.sizes[rootB];
    this.components -= 1;
    return true;
  }

  rollback(snapshot) {
    if (!Number.isInteger(snapshot) || snapshot < 0 || snapshot > this.history.length) {
      throw new RangeError('snapshot must refer to the current history');
    }

    while (this.history.length > snapshot) {
      const change = this.history.pop();
      if (change === null) continue;

      this.parent[change.childRoot] = change.childRoot;
      this.sizes[change.parentRoot] = change.previousParentSize;
      this.components = change.previousComponentCount;
    }
  }
}

// Example tests
const dsu = new RollbackDisjointSet(5);
const initial = dsu.snapshot();
assert.equal(dsu.union(0, 1), true);
const afterFirstUnion = dsu.snapshot();
assert.equal(dsu.union(1, 2), true);
assert.equal(dsu.union(0, 2), false);
assert.equal(dsu.componentSize(2), 3);
assert.equal(dsu.components, 3);

dsu.rollback(afterFirstUnion);
assert.equal(dsu.connected(0, 1), true);
assert.equal(dsu.connected(0, 2), false);
assert.equal(dsu.componentSize(0), 2);
assert.equal(dsu.components, 4);

dsu.union(3, 4);
assert.equal(dsu.connected(3, 4), true);
dsu.rollback(initial);
assert.equal(dsu.components, 5);
assert.equal(dsu.connected(3, 4), false);
assert.throws(() => dsu.find(5), RangeError);
assert.throws(() => dsu.rollback(99), RangeError);

console.log('RollbackDisjointSet tests passed.');
