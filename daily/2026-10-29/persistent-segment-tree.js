/**
 * Persistent segment tree: point updates create new versions without mutating
 * older roots. Range queries use half-open intervals [start, end).
 *
 * Run: node daily/2026-10-29/persistent-segment-tree.js
 */
const assert = require("node:assert/strict");

function build(values, left, right) {
  if (right - left === 1) {
    return { sum: values[left], left: null, right: null };
  }
  const mid = Math.floor((left + right) / 2);
  const a = build(values, left, mid);
  const b = build(values, mid, right);
  return { sum: a.sum + b.sum, left: a, right: b };
}

function updateNode(node, left, right, index, value) {
  if (right - left === 1) {
    return { sum: value, left: null, right: null };
  }
  const mid = Math.floor((left + right) / 2);
  let a = node.left;
  let b = node.right;
  if (index < mid) a = updateNode(a, left, mid, index, value);
  else b = updateNode(b, mid, right, index, value);
  return { sum: a.sum + b.sum, left: a, right: b };
}

function queryNode(node, left, right, ql, qr) {
  if (qr <= left || right <= ql) return 0;
  if (ql <= left && right <= qr) return node.sum;
  const mid = Math.floor((left + right) / 2);
  return queryNode(node.left, left, mid, ql, qr) +
    queryNode(node.right, mid, right, ql, qr);
}

function createPersistentSegmentTree(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError("values must be a non-empty array");
  }
  if (values.some((value) => !Number.isFinite(value))) {
    throw new TypeError("all values must be finite numbers");
  }

  const length = values.length;
  const roots = [build(values, 0, length)];

  function assertVersion(version) {
    if (!Number.isInteger(version) || version < 0 || version >= roots.length) {
      throw new RangeError("unknown version");
    }
  }

  function update(version, index, value) {
    assertVersion(version);
    if (!Number.isInteger(index) || index < 0 || index >= length) {
      throw new RangeError("index out of bounds");
    }
    if (!Number.isFinite(value)) throw new TypeError("value must be finite");
    roots.push(updateNode(roots[version], 0, length, index, value));
    return roots.length - 1;
  }

  function sum(version, start, end) {
    assertVersion(version);
    if (!Number.isInteger(start) || !Number.isInteger(end) ||
        start < 0 || end < start || end > length) {
      throw new RangeError("invalid half-open range");
    }
    if (start === end) return 0;
    return queryNode(roots[version], 0, length, start, end);
  }

  return Object.freeze({ update, sum, get versionCount() { return roots.length; } });
}

if (require.main === module) {
  const tree = createPersistentSegmentTree([2, 4, 6, 8, 10]);
  assert.equal(tree.sum(0, 0, 5), 30);
  assert.equal(tree.sum(0, 1, 4), 18);
  const v1 = tree.update(0, 2, 100);
  assert.equal(tree.sum(v1, 0, 5), 124);
  assert.equal(tree.sum(0, 0, 5), 30, "old versions must remain unchanged");
  const v2 = tree.update(v1, 0, -2);
  const v3 = tree.update(0, 4, 1); // branch from the original version
  assert.equal(tree.sum(v2, 0, 3), 102);
  assert.equal(tree.sum(v3, 0, 5), 21);
  assert.equal(tree.sum(v3, 2, 2), 0);
  assert.equal(tree.versionCount, 4);
  assert.throws(() => tree.update(0, 5, 1), RangeError);
  assert.throws(() => tree.sum(9, 0, 1), RangeError);
  console.log("persistent-segment-tree: all assertions passed");
}

module.exports = { createPersistentSegmentTree };
