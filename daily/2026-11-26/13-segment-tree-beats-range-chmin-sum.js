'use strict';

// Exercise: support range chmin and range-sum queries with Segment Tree Beats.
// Values are numbers; ranges are half-open [left, right).

const assert = require('node:assert/strict');

class SegmentTreeBeats {
  constructor(values) {
    if (!Array.isArray(values) || values.some((x) => typeof x !== 'number' || !Number.isFinite(x))) {
      throw new TypeError('values must be finite numbers');
    }
    this.n = values.length;
    const capacity = Math.max(1, 4 * this.n);
    this.max1 = Array(capacity).fill(-Infinity);
    this.max2 = Array(capacity).fill(-Infinity);
    this.countMax = Array(capacity).fill(0);
    this.sum = Array(capacity).fill(0);
    if (this.n) this._build(1, 0, this.n, values);
  }

  _build(node, left, right, values) {
    if (right - left === 1) {
      this.max1[node] = this.sum[node] = values[left];
      this.countMax[node] = 1;
      return;
    }
    const mid = (left + right) >> 1;
    this._build(node * 2, left, mid, values);
    this._build(node * 2 + 1, mid, right, values);
    this._pull(node);
  }

  _pull(node) {
    const a = node * 2, b = a + 1;
    this.sum[node] = this.sum[a] + this.sum[b];
    this.max1[node] = Math.max(this.max1[a], this.max1[b]);
    this.countMax[node] =
      (this.max1[a] === this.max1[node] ? this.countMax[a] : 0) +
      (this.max1[b] === this.max1[node] ? this.countMax[b] : 0);
    const secondA = this.max1[a] === this.max1[node] ? this.max2[a] : this.max1[a];
    const secondB = this.max1[b] === this.max1[node] ? this.max2[b] : this.max1[b];
    this.max2[node] = Math.max(secondA, secondB);
  }

  _applyChmin(node, ceiling) {
    if (this.max1[node] <= ceiling) return;
    this.sum[node] -= (this.max1[node] - ceiling) * this.countMax[node];
    this.max1[node] = ceiling;
  }

  _push(node) {
    for (const child of [node * 2, node * 2 + 1]) {
      if (this.max1[child] > this.max1[node]) this._applyChmin(child, this.max1[node]);
    }
  }

  _validateRange(left, right) {
    if (!Number.isInteger(left) || !Number.isInteger(right) ||
        left < 0 || right < left || right > this.n) {
      throw new RangeError('invalid half-open range');
    }
  }

  rangeChmin(left, right, ceiling) {
    this._validateRange(left, right);
    if (typeof ceiling !== 'number' || !Number.isFinite(ceiling)) {
      throw new TypeError('ceiling must be finite');
    }
    if (left < right) this._chmin(1, 0, this.n, left, right, ceiling);
  }

  _chmin(node, start, end, ql, qr, ceiling) {
    if (qr <= start || end <= ql || this.max1[node] <= ceiling) return;
    if (ql <= start && end <= qr && this.max2[node] < ceiling) {
      this._applyChmin(node, ceiling);
      return;
    }
    this._push(node);
    const mid = (start + end) >> 1;
    this._chmin(node * 2, start, mid, ql, qr, ceiling);
    this._chmin(node * 2 + 1, mid, end, ql, qr, ceiling);
    this._pull(node);
  }

  rangeSum(left, right) {
    this._validateRange(left, right);
    return left === right ? 0 : this._sum(1, 0, this.n, left, right);
  }

  _sum(node, start, end, ql, qr) {
    if (qr <= start || end <= ql) return 0;
    if (ql <= start && end <= qr) return this.sum[node];
    this._push(node);
    const mid = (start + end) >> 1;
    return this._sum(node * 2, start, mid, ql, qr) +
      this._sum(node * 2 + 1, mid, end, ql, qr);
  }
}

const tree = new SegmentTreeBeats([5, 1, 7, 3]);
tree.rangeChmin(0, 4, 4);
assert.equal(tree.rangeSum(0, 4), 12);
tree.rangeChmin(1, 3, 2);
assert.equal(tree.rangeSum(1, 3), 3);
tree.rangeChmin(0, 2, 0);
assert.equal(tree.rangeSum(0, 4), 5);
assert.equal(tree.rangeSum(4, 4), 0);
assert.throws(() => tree.rangeSum(-1, 2), RangeError);

module.exports = { SegmentTreeBeats };
