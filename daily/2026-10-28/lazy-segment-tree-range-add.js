/**
 * Exercise: implement a lazy segment tree supporting:
 * - range addition in O(log n),
 * - inclusive range-sum queries in O(log n),
 * - inclusive range-minimum queries in O(log n),
 * - point assignment.
 */
class LazySegmentTree {
  constructor(values) {
    if (!Array.isArray(values) || values.some(value => !Number.isFinite(value))) {
      throw new TypeError("values must be an array of finite numbers");
    }

    this.length = values.length;
    const storageSize = Math.max(1, this.length * 4);
    this.sumTree = new Array(storageSize).fill(0);
    this.minTree = new Array(storageSize).fill(Infinity);
    this.lazy = new Array(storageSize).fill(0);

    if (this.length > 0) this._build(1, 0, this.length - 1, values);
  }

  _build(node, start, end, values) {
    if (start === end) {
      this.sumTree[node] = values[start];
      this.minTree[node] = values[start];
      return;
    }

    const middle = Math.floor((start + end) / 2);
    this._build(node * 2, start, middle, values);
    this._build(node * 2 + 1, middle + 1, end, values);
    this._pull(node);
  }

  _pull(node) {
    this.sumTree[node] = this.sumTree[node * 2] + this.sumTree[node * 2 + 1];
    this.minTree[node] = Math.min(this.minTree[node * 2], this.minTree[node * 2 + 1]);
  }

  _apply(node, start, end, delta) {
    this.sumTree[node] += delta * (end - start + 1);
    this.minTree[node] += delta;
    this.lazy[node] += delta;
  }

  _push(node, start, end) {
    const delta = this.lazy[node];
    if (delta === 0 || start === end) return;

    const middle = Math.floor((start + end) / 2);
    this._apply(node * 2, start, middle, delta);
    this._apply(node * 2 + 1, middle + 1, end, delta);
    this.lazy[node] = 0;
  }

  _validateRange(left, right) {
    if (
      this.length === 0 ||
      !Number.isInteger(left) ||
      !Number.isInteger(right) ||
      left < 0 ||
      right < left ||
      right >= this.length
    ) {
      throw new RangeError("query range must be valid inclusive indexes");
    }
  }

  _validateIndex(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.length) {
      throw new RangeError("index is out of bounds");
    }
  }

  addRange(left, right, delta) {
    this._validateRange(left, right);
    if (!Number.isFinite(delta)) throw new TypeError("delta must be finite");
    this._add(1, 0, this.length - 1, left, right, delta);
  }

  _add(node, start, end, left, right, delta) {
    if (left <= start && end <= right) {
      this._apply(node, start, end, delta);
      return;
    }

    this._push(node, start, end);
    const middle = Math.floor((start + end) / 2);
    if (left <= middle) this._add(node * 2, start, middle, left, right, delta);
    if (right > middle) this._add(node * 2 + 1, middle + 1, end, left, right, delta);
    this._pull(node);
  }

  querySum(left, right) {
    this._validateRange(left, right);
    return this._querySum(1, 0, this.length - 1, left, right);
  }

  _querySum(node, start, end, left, right) {
    if (left <= start && end <= right) return this.sumTree[node];
    this._push(node, start, end);
    const middle = Math.floor((start + end) / 2);
    let result = 0;
    if (left <= middle) result += this._querySum(node * 2, start, middle, left, right);
    if (right > middle) result += this._querySum(node * 2 + 1, middle + 1, end, left, right);
    return result;
  }

  queryMin(left, right) {
    this._validateRange(left, right);
    return this._queryMin(1, 0, this.length - 1, left, right);
  }

  _queryMin(node, start, end, left, right) {
    if (left <= start && end <= right) return this.minTree[node];
    this._push(node, start, end);
    const middle = Math.floor((start + end) / 2);
    let result = Infinity;
    if (left <= middle) result = Math.min(result, this._queryMin(node * 2, start, middle, left, right));
    if (right > middle) result = Math.min(result, this._queryMin(node * 2 + 1, middle + 1, end, left, right));
    return result;
  }

  set(index, value) {
    this._validateIndex(index);
    if (!Number.isFinite(value)) throw new TypeError("value must be finite");
    const current = this.querySum(index, index);
    this.addRange(index, index, value - current);
  }
}

if (require.main === module) {
  const assert = require("node:assert/strict");

  const tree = new LazySegmentTree([2, -1, 3, 0, 5]);
  assert.equal(tree.querySum(0, 4), 9);
  assert.equal(tree.queryMin(0, 4), -1);

  tree.addRange(1, 3, 4); // [2, 3, 7, 4, 5]
  assert.equal(tree.querySum(0, 4), 21);
  assert.equal(tree.querySum(1, 3), 14);
  assert.equal(tree.queryMin(1, 3), 3);

  tree.set(2, -6); // [2, 3, -6, 4, 5]
  assert.equal(tree.querySum(2, 3), -2);
  assert.equal(tree.queryMin(0, 4), -6);

  tree.addRange(0, 4, -1); // [1, 2, -7, 3, 4]
  assert.equal(tree.querySum(0, 4), 3);
  assert.equal(tree.queryMin(0, 4), -7);
  assert.throws(() => tree.querySum(-1, 2), RangeError);
  assert.throws(() => new LazySegmentTree([]).queryMin(0, 0), RangeError);

  console.log("Lazy segment-tree tests passed");
}

module.exports = { LazySegmentTree };
