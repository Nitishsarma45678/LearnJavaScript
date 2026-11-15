/**
 * Persistent Lazy Segment Tree
 *
 * Exercise:
 * Implement immutable range-add updates and range sum/min/max queries over
 * half-open intervals [left, right). Every update returns a new version while
 * old roots remain queryable. Lazy tags are pushed by path-copying, never by
 * mutating nodes shared with an earlier version.
 *
 * Build: O(n), update/query: O(log n) for a balanced segment tree.
 */

'use strict';

function makeNode(left, right) {
  return Object.freeze({
    left,
    right,
    len: left.len + right.len,
    sum: left.sum + right.sum,
    min: Math.min(left.min, right.min),
    max: Math.max(left.max, right.max),
    lazy: 0
  });
}

function leaf(value) {
  return Object.freeze({
    left: null,
    right: null,
    len: 1,
    sum: value,
    min: value,
    max: value,
    lazy: 0
  });
}

function build(values, left, right) {
  if (right - left === 1) return leaf(values[left]);
  const middle = (left + right) >> 1;
  return makeNode(build(values, left, middle), build(values, middle, right));
}

function applyAdd(node, delta) {
  return Object.freeze({
    left: node.left,
    right: node.right,
    len: node.len,
    sum: node.sum + delta * node.len,
    min: node.min + delta,
    max: node.max + delta,
    lazy: node.lazy + delta
  });
}

function rangeAdd(node, queryLeft, queryRight, left, right, delta) {
  if (queryLeft <= left && right <= queryRight) return applyAdd(node, delta);

  const middle = (left + right) >> 1;
  let childLeft = node.left;
  let childRight = node.right;

  if (node.lazy !== 0) {
    childLeft = applyAdd(childLeft, node.lazy);
    childRight = applyAdd(childRight, node.lazy);
  }

  if (queryLeft < middle) {
    childLeft = rangeAdd(childLeft, queryLeft, queryRight, left, middle, delta);
  }
  if (queryRight > middle) {
    childRight = rangeAdd(childRight, queryLeft, queryRight, middle, right, delta);
  }
  return makeNode(childLeft, childRight);
}

function queryStats(node, queryLeft, queryRight, left, right, carry = 0) {
  if (queryLeft <= left && right <= queryRight) {
    return {
      sum: node.sum + carry * node.len,
      min: node.min + carry,
      max: node.max + carry,
      count: node.len
    };
  }

  const nextCarry = carry + node.lazy;
  const middle = (left + right) >> 1;
  let result = null;

  if (queryLeft < middle) {
    result = queryStats(node.left, queryLeft, queryRight, left, middle, nextCarry);
  }
  if (queryRight > middle) {
    const rightResult = queryStats(node.right, queryLeft, queryRight, middle, right, nextCarry);
    if (!result) result = rightResult;
    else {
      result = {
        sum: result.sum + rightResult.sum,
        min: Math.min(result.min, rightResult.min),
        max: Math.max(result.max, rightResult.max),
        count: result.count + rightResult.count
      };
    }
  }
  return result;
}

function materialize(node, carry, output) {
  if (node.len === 1) {
    output.push(node.sum + carry);
    return;
  }
  const nextCarry = carry + node.lazy;
  materialize(node.left, nextCarry, output);
  materialize(node.right, nextCarry, output);
}

class PersistentSegmentTree {
  constructor(values) {
    if (!Array.isArray(values)) throw new TypeError('values must be an array');
    if (values.some(value => !Number.isFinite(value))) {
      throw new TypeError('all values must be finite numbers');
    }
    this.length = values.length;
    this.root = values.length ? build(values, 0, values.length) : null;
    Object.freeze(this);
  }

  static _fromRoot(root, length) {
    const tree = Object.create(PersistentSegmentTree.prototype);
    tree.length = length;
    tree.root = root;
    return Object.freeze(tree);
  }

  _validateRange(left, right) {
    if (!Number.isInteger(left) || !Number.isInteger(right) ||
        left < 0 || right < left || right > this.length) {
      throw new RangeError('expected 0 <= left <= right <= length');
    }
  }

  add(left, right, delta) {
    this._validateRange(left, right);
    if (!Number.isFinite(delta)) throw new TypeError('delta must be finite');
    if (left === right || this.length === 0) return this;
    const root = rangeAdd(this.root, left, right, 0, this.length, delta);
    return PersistentSegmentTree._fromRoot(root, this.length);
  }

  query(left, right) {
    this._validateRange(left, right);
    if (left === right) {
      return { sum: 0, min: Infinity, max: -Infinity, count: 0 };
    }
    return queryStats(this.root, left, right, 0, this.length);
  }

  sum(left, right) { return this.query(left, right).sum; }
  min(left, right) { return this.query(left, right).min; }
  max(left, right) { return this.query(left, right).max; }

  get(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.length) {
      throw new RangeError('index is outside the tree');
    }
    return this.sum(index, index + 1);
  }

  toArray() {
    if (!this.root) return [];
    const output = [];
    materialize(this.root, 0, output);
    return output;
  }
}

function runTests() {
  const assert = require('node:assert/strict');
  const original = new PersistentSegmentTree([2, -1, 4, 7, 3]);
  const first = original.add(1, 4, 5);
  const branch = first.add(0, 2, -3);
  assert.deepEqual(original.toArray(), [2, -1, 4, 7, 3]);
  assert.deepEqual(first.toArray(), [2, 4, 9, 12, 3]);
  assert.deepEqual(branch.toArray(), [-1, 1, 9, 12, 3]);
  assert.deepEqual(first.query(1, 4), { sum: 25, min: 4, max: 12, count: 3 });
  assert.equal(branch.get(0), -1);
  assert.deepEqual(original.query(2, 2), {
    sum: 0, min: Infinity, max: -Infinity, count: 0
  });

  let seed = 123456789;
  const random = limit => {
    seed = (seed * 48271) % 2147483647;
    return seed % limit;
  };
  const versions = [{ tree: original, values: original.toArray() }];
  for (let step = 0; step < 250; step += 1) {
    const base = versions[random(versions.length)];
    const left = random(6);
    const right = left + random(6 - left);
    const delta = random(11) - 5;
    const values = base.values.slice();
    for (let i = left; i < right; i += 1) values[i] += delta;
    const tree = base.tree.add(left, right, delta);
    assert.deepEqual(tree.toArray(), values);

    const ql = random(6);
    const qr = ql + random(6 - ql);
    const slice = values.slice(ql, qr);
    const expected = slice.length
      ? {
          sum: slice.reduce((a, b) => a + b, 0),
          min: Math.min(...slice),
          max: Math.max(...slice),
          count: slice.length
        }
      : { sum: 0, min: Infinity, max: -Infinity, count: 0 };
    assert.deepEqual(tree.query(ql, qr), expected);
    versions.push({ tree, values });
  }

  assert.deepEqual(new PersistentSegmentTree([]).toArray(), []);
  assert.throws(() => original.add(-1, 2, 1), RangeError);
  assert.throws(() => original.get(5), RangeError);
  console.log('Persistent segment tree tests passed');
}

if (require.main === module) runTests();

module.exports = { PersistentSegmentTree };
