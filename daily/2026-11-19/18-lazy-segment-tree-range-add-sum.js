'use strict';

/**
 * Exercise: Implement a lazy segment tree for inclusive range-add updates and
 * inclusive range-sum queries.
 *
 * Both operations run in O(log n) time. Lazy values are pushed only when a
 * partially covered segment must be visited.
 */

class LazySegmentTree {
  constructor(values) {
    if (!Array.isArray(values) || values.some((value) => !Number.isFinite(value))) {
      throw new TypeError('values must be an array of finite numbers');
    }
    this.length = values.length;
    const capacity = Math.max(1, values.length * 4);
    this.tree = new Array(capacity).fill(0);
    this.lazy = new Array(capacity).fill(0);
    if (this.length > 0) this._build(values, 1, 0, this.length - 1);
  }

  _build(values, node, left, right) {
    if (left === right) {
      this.tree[node] = values[left];
      return;
    }
    const middle = Math.floor((left + right) / 2);
    this._build(values, node * 2, left, middle);
    this._build(values, node * 2 + 1, middle + 1, right);
    this.tree[node] = this.tree[node * 2] + this.tree[node * 2 + 1];
  }

  _validateRange(left, right) {
    if (!Number.isInteger(left) || !Number.isInteger(right) ||
        left < 0 || right < left || right >= this.length) {
      throw new RangeError('range must satisfy 0 <= left <= right < length');
    }
  }

  _apply(node, left, right, delta) {
    this.tree[node] += (right - left + 1) * delta;
    this.lazy[node] += delta;
  }

  _push(node, left, right) {
    const pending = this.lazy[node];
    if (pending === 0 || left === right) return;
    const middle = Math.floor((left + right) / 2);
    this._apply(node * 2, left, middle, pending);
    this._apply(node * 2 + 1, middle + 1, right, pending);
    this.lazy[node] = 0;
  }

  updateRange(queryLeft, queryRight, delta) {
    this._validateRange(queryLeft, queryRight);
    if (!Number.isFinite(delta)) throw new TypeError('delta must be finite');

    const update = (node, left, right) => {
      if (queryLeft <= left && right <= queryRight) {
        this._apply(node, left, right, delta);
        return;
      }
      this._push(node, left, right);
      const middle = Math.floor((left + right) / 2);
      if (queryLeft <= middle) update(node * 2, left, middle);
      if (queryRight > middle) update(node * 2 + 1, middle + 1, right);
      this.tree[node] = this.tree[node * 2] + this.tree[node * 2 + 1];
    };

    update(1, 0, this.length - 1);
  }

  queryRange(queryLeft, queryRight) {
    this._validateRange(queryLeft, queryRight);

    const query = (node, left, right) => {
      if (queryLeft <= left && right <= queryRight) return this.tree[node];
      this._push(node, left, right);
      const middle = Math.floor((left + right) / 2);
      let total = 0;
      if (queryLeft <= middle) total += query(node * 2, left, middle);
      if (queryRight > middle) total += query(node * 2 + 1, middle + 1, right);
      return total;
    };

    return query(1, 0, this.length - 1);
  }
}

function runTests() {
  const assert = require('node:assert/strict');
  const tree = new LazySegmentTree([1, 3, 5, 7, 9, 11]);
  assert.equal(tree.queryRange(1, 3), 15);
  tree.updateRange(1, 3, 2);
  assert.equal(tree.queryRange(1, 3), 21);
  assert.equal(tree.queryRange(0, 5), 42);

  tree.updateRange(2, 5, -1);
  assert.equal(tree.queryRange(2, 5), 32);
  assert.equal(tree.queryRange(0, 1), 6);
  assert.equal(tree.queryRange(4, 4), 8);

  assert.throws(() => tree.queryRange(-1, 2), /range/);
  assert.throws(() => tree.updateRange(3, 2, 1), /range/);
  assert.throws(() => tree.updateRange(0, 1, NaN), /delta/);
  assert.throws(() => new LazySegmentTree([1, Infinity]), /finite/);
  assert.throws(() => new LazySegmentTree([]).queryRange(0, 0), /range/);
}

if (require.main === module) {
  runTests();
  console.log('Lazy segment tree: all tests passed');
}

module.exports = { LazySegmentTree };
