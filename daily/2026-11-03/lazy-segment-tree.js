const assert = require('node:assert/strict');

class LazySegmentTree {
  constructor(values) {
    if (!Array.isArray(values) || values.length === 0 || values.some(v => !Number.isFinite(v))) {
      throw new TypeError('values must be a non-empty array of finite numbers');
    }
    this.length = values.length;
    this.sum = new Float64Array(4 * values.length);
    this.lazy = new Float64Array(4 * values.length);
    this._build(1, 0, this.length - 1, values);
  }

  _build(node, left, right, values) {
    if (left === right) { this.sum[node] = values[left]; return; }
    const mid = (left + right) >> 1;
    this._build(node * 2, left, mid, values);
    this._build(node * 2 + 1, mid + 1, right, values);
    this.sum[node] = this.sum[node * 2] + this.sum[node * 2 + 1];
  }

  _apply(node, left, right, delta) {
    this.sum[node] += (right - left + 1) * delta;
    this.lazy[node] += delta;
  }

  _push(node, left, right) {
    const pending = this.lazy[node];
    if (pending === 0 || left === right) return;
    const mid = (left + right) >> 1;
    this._apply(node * 2, left, mid, pending);
    this._apply(node * 2 + 1, mid + 1, right, pending);
    this.lazy[node] = 0;
  }

  _validateRange(left, right) {
    if (!Number.isInteger(left) || !Number.isInteger(right) || left < 0 || right >= this.length || left > right) {
      throw new RangeError('range must be valid inclusive indices');
    }
  }

  add(left, right, delta) {
    this._validateRange(left, right);
    if (!Number.isFinite(delta)) throw new TypeError('delta must be finite');
    this._add(1, 0, this.length - 1, left, right, delta);
  }

  _add(node, lo, hi, ql, qr, delta) {
    if (ql <= lo && hi <= qr) { this._apply(node, lo, hi, delta); return; }
    this._push(node, lo, hi);
    const mid = (lo + hi) >> 1;
    if (ql <= mid) this._add(node * 2, lo, mid, ql, qr, delta);
    if (qr > mid) this._add(node * 2 + 1, mid + 1, hi, ql, qr, delta);
    this.sum[node] = this.sum[node * 2] + this.sum[node * 2 + 1];
  }

  query(left, right) {
    this._validateRange(left, right);
    return this._query(1, 0, this.length - 1, left, right);
  }

  _query(node, lo, hi, ql, qr) {
    if (ql <= lo && hi <= qr) return this.sum[node];
    this._push(node, lo, hi);
    const mid = (lo + hi) >> 1;
    let result = 0;
    if (ql <= mid) result += this._query(node * 2, lo, mid, ql, qr);
    if (qr > mid) result += this._query(node * 2 + 1, mid + 1, hi, ql, qr);
    return result;
  }
}

const tree = new LazySegmentTree([2, 1, 3, 4, 5]);
assert.equal(tree.query(0, 4), 15);
tree.add(1, 3, 10);
assert.equal(tree.query(0, 4), 45);
assert.equal(tree.query(1, 2), 24);
tree.add(0, 4, -2);
assert.equal(tree.query(0, 4), 35);
assert.equal(tree.query(3, 3), 12);
assert.throws(() => tree.query(-1, 2), RangeError);
assert.throws(() => tree.add(2, 1, 1), RangeError);
console.log('Lazy segment tree tests passed');
