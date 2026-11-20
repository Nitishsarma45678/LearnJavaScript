// Exercise: Build a persistent segment tree supporting point updates and range sums.
// Every update creates a new immutable version; old versions remain queryable.
// Ranges are inclusive. Run: node daily/2026-11-20/14-persistent-segment-tree.js
"use strict";
const assert = require("node:assert/strict");
function build(values, left, right) {
  if (left === right) return { sum: values[left], left: null, right: null };
  const middle = (left + right) >> 1;
  const a = build(values, left, middle), b = build(values, middle + 1, right);
  return { sum: a.sum + b.sum, left: a, right: b };
}
function updateNode(node, left, right, index, value) {
  if (left === right) return { sum: value, left: null, right: null };
  const middle = (left + right) >> 1;
  let a = node.left, b = node.right;
  if (index <= middle) a = updateNode(a, left, middle, index, value);
  else b = updateNode(b, middle + 1, right, index, value);
  return { sum: a.sum + b.sum, left: a, right: b };
}
function queryNode(node, left, right, queryLeft, queryRight) {
  if (queryLeft <= left && right <= queryRight) return node.sum;
  const middle = (left + right) >> 1;
  let total = 0;
  if (queryLeft <= middle) total += queryNode(node.left, left, middle, queryLeft, queryRight);
  if (queryRight > middle) total += queryNode(node.right, middle + 1, right, queryLeft, queryRight);
  return total;
}
class PersistentSegmentTree {
  constructor(values) {
    if (!Array.isArray(values) || values.length === 0 || values.some(value => !Number.isFinite(value))) {
      throw new TypeError("values must be a non-empty array of finite numbers");
    }
    this.length = values.length;
    this.roots = [build(values, 0, values.length - 1)];
  }
  _version(version) {
    if (!Number.isInteger(version) || version < 0 || version >= this.roots.length) throw new RangeError("unknown version");
    return this.roots[version];
  }
  update(version, index, value) {
    const root = this._version(version);
    if (!Number.isInteger(index) || index < 0 || index >= this.length) throw new RangeError("index out of range");
    if (!Number.isFinite(value)) throw new TypeError("value must be finite");
    const next = updateNode(root, 0, this.length - 1, index, value);
    this.roots.push(next);
    return this.roots.length - 1;
  }
  sum(version, left, right) {
    const root = this._version(version);
    if (!Number.isInteger(left) || !Number.isInteger(right) || left < 0 || right >= this.length || left > right) {
      throw new RangeError("invalid inclusive range");
    }
    return queryNode(root, 0, this.length - 1, left, right);
  }
  get versions() { return this.roots.length; }
}
const tree = new PersistentSegmentTree([2, 4, 6, 8, 10]);
assert.equal(tree.sum(0, 1, 3), 18);
const v1 = tree.update(0, 2, 100);
const v2 = tree.update(v1, 0, -2);
assert.equal(tree.sum(0, 0, 4), 30);
assert.equal(tree.sum(v1, 0, 4), 124);
assert.equal(tree.sum(v2, 0, 2), 102);
assert.equal(tree.versions, 3);
assert.throws(() => tree.sum(9, 0, 1), /version/);
assert.throws(() => tree.update(0, 5, 1), /index/);
assert.throws(() => tree.sum(0, 3, 1), /range/);
console.log("persistent segment tree: all tests passed");
