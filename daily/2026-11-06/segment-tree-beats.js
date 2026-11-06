'use strict';

/**
 * Segment Tree Beats: range chmin, range chmax, range add and range sum.
 * All public ranges are zero-based and inclusive. Updates use conditional
 * beats pruning; complexity is amortized and data-dependent.
 */
class SegmentTreeBeats {
  constructor(values) {
    if (!Array.isArray(values) || values.length === 0 || values.some(v => !Number.isFinite(v))) {
      throw new TypeError('values must be a non-empty array of finite numbers');
    }
    this.length = values.length;
    this.root = this._build(values, 0, values.length - 1);
  }

  _build(values, left, right) {
    const node = {
      left, right, sum: 0, max1: -Infinity, max2: -Infinity, maxCount: 0,
      min1: Infinity, min2: Infinity, minCount: 0, add: 0, a: null, b: null
    };
    if (left === right) {
      const value = values[left];
      node.sum = node.max1 = node.min1 = value;
      node.maxCount = node.minCount = 1;
      return node;
    }
    const mid = (left + right) >> 1;
    node.a = this._build(values, left, mid);
    node.b = this._build(values, mid + 1, right);
    this._pull(node);
    return node;
  }

  _pull(node) {
    const a = node.a;
    const b = node.b;
    node.sum = a.sum + b.sum;

    if (a.max1 === b.max1) {
      node.max1 = a.max1;
      node.maxCount = a.maxCount + b.maxCount;
      node.max2 = Math.max(a.max2, b.max2);
    } else if (a.max1 > b.max1) {
      node.max1 = a.max1;
      node.maxCount = a.maxCount;
      node.max2 = Math.max(a.max2, b.max1);
    } else {
      node.max1 = b.max1;
      node.maxCount = b.maxCount;
      node.max2 = Math.max(a.max1, b.max2);
    }

    if (a.min1 === b.min1) {
      node.min1 = a.min1;
      node.minCount = a.minCount + b.minCount;
      node.min2 = Math.min(a.min2, b.min2);
    } else if (a.min1 < b.min1) {
      node.min1 = a.min1;
      node.minCount = a.minCount;
      node.min2 = Math.min(a.min2, b.min1);
    } else {
      node.min1 = b.min1;
      node.minCount = b.minCount;
      node.min2 = Math.min(a.min1, b.min2);
    }
  }

  _applyAdd(node, delta) {
    node.sum += delta * (node.right - node.left + 1);
    node.max1 += delta;
    if (node.max2 !== -Infinity) node.max2 += delta;
    node.min1 += delta;
    if (node.min2 !== Infinity) node.min2 += delta;
    node.add += delta;
  }

  _applyChmin(node, limit) {
    if (node.max1 <= limit) return;
    node.sum += (limit - node.max1) * node.maxCount;
    if (node.min1 === node.max1) node.min1 = limit;
    else if (node.min2 === node.max1) node.min2 = limit;
    node.max1 = limit;
  }

  _applyChmax(node, limit) {
    if (node.min1 >= limit) return;
    node.sum += (limit - node.min1) * node.minCount;
    if (node.max1 === node.min1) node.max1 = limit;
    else if (node.max2 === node.min1) node.max2 = limit;
    node.min1 = limit;
  }

  _push(node) {
    if (!node.a) return;
    if (node.add !== 0) {
      this._applyAdd(node.a, node.add);
      this._applyAdd(node.b, node.add);
      node.add = 0;
    }
    if (node.a.max1 > node.max1) this._applyChmin(node.a, node.max1);
    if (node.b.max1 > node.max1) this._applyChmin(node.b, node.max1);
    if (node.a.min1 < node.min1) this._applyChmax(node.a, node.min1);
    if (node.b.min1 < node.min1) this._applyChmax(node.b, node.min1);
  }

  _validate(left, right) {
    if (!Number.isInteger(left) || !Number.isInteger(right) || left < 0 || right < left || right >= this.length) {
      throw new RangeError('invalid inclusive range');
    }
  }

  rangeAdd(left, right, delta) {
    this._validate(left, right);
    if (!Number.isFinite(delta)) throw new TypeError('delta must be finite');
    this._add(this.root, left, right, delta);
  }

  _add(node, left, right, delta) {
    if (left <= node.left && node.right <= right) {
      this._applyAdd(node, delta);
      return;
    }
    this._push(node);
    if (left <= node.a.right) this._add(node.a, left, right, delta);
    if (right >= node.b.left) this._add(node.b, left, right, delta);
    this._pull(node);
  }

  rangeChmin(left, right, limit) {
    this._validate(left, right);
    if (!Number.isFinite(limit)) throw new TypeError('limit must be finite');
    this._chmin(this.root, left, right, limit);
  }

  _chmin(node, left, right, limit) {
    if (node.max1 <= limit) return;
    if (left <= node.left && node.right <= right && node.max2 < limit) {
      this._applyChmin(node, limit);
      return;
    }
    this._push(node);
    if (left <= node.a.right) this._chmin(node.a, left, right, limit);
    if (right >= node.b.left) this._chmin(node.b, left, right, limit);
    this._pull(node);
  }

  rangeChmax(left, right, limit) {
    this._validate(left, right);
    if (!Number.isFinite(limit)) throw new TypeError('limit must be finite');
    this._chmax(this.root, left, right, limit);
  }

  _chmax(node, left, right, limit) {
    if (node.min1 >= limit) return;
    if (left <= node.left && node.right <= right && node.min2 > limit) {
      this._applyChmax(node, limit);
      return;
    }
    this._push(node);
    if (left <= node.a.right) this._chmax(node.a, left, right, limit);
    if (right >= node.b.left) this._chmax(node.b, left, right, limit);
    this._pull(node);
  }

  sum(left, right) {
    this._validate(left, right);
    return this._query(this.root, left, right);
  }

  _query(node, left, right) {
    if (left <= node.left && node.right <= right) return node.sum;
    this._push(node);
    let total = 0;
    if (left <= node.a.right) total += this._query(node.a, left, right);
    if (right >= node.b.left) total += this._query(node.b, left, right);
    return total;
  }
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  const tree = new SegmentTreeBeats([1, 5, 7, 9, 6]);
  tree.rangeChmin(1, 3, 6); // [1, 5, 6, 6, 6]
  tree.rangeChmax(0, 2, 4); // [4, 5, 6, 6, 6]
  tree.rangeAdd(2, 4, 2);   // [4, 5, 8, 8, 8]
  assert.equal(tree.sum(0, 4), 33);
  assert.equal(tree.sum(1, 3), 21);
  tree.rangeChmax(0, 4, 10);
  assert.equal(tree.sum(0, 4), 50);
  tree.rangeChmin(2, 4, 7);
  assert.equal(tree.sum(0, 4), 41);

  // Differential testing mixes all three update types against a plain array.
  let seed = 987654321;
  const random = max => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed % max;
  };
  const values = Array.from({ length: 23 }, () => random(41) - 20);
  const fast = new SegmentTreeBeats(values);
  const slow = [...values];
  for (let step = 0; step < 500; step += 1) {
    let left = random(slow.length), right = random(slow.length);
    if (left > right) [left, right] = [right, left];
    const value = random(31) - 15;
    const operation = random(4);
    if (operation === 0) {
      fast.rangeAdd(left, right, value);
      for (let i = left; i <= right; i += 1) slow[i] += value;
    } else if (operation === 1) {
      fast.rangeChmin(left, right, value);
      for (let i = left; i <= right; i += 1) slow[i] = Math.min(slow[i], value);
    } else if (operation === 2) {
      fast.rangeChmax(left, right, value);
      for (let i = left; i <= right; i += 1) slow[i] = Math.max(slow[i], value);
    } else {
      assert.equal(fast.sum(left, right), slow.slice(left, right + 1).reduce((a, b) => a + b, 0));
    }
    if (step % 7 === 0) {
      const a = random(slow.length), b = random(slow.length);
      const lo = Math.min(a, b), hi = Math.max(a, b);
      assert.equal(fast.sum(lo, hi), slow.slice(lo, hi + 1).reduce((x, y) => x + y, 0));
    }
  }
  assert.throws(() => fast.sum(-1, 2), RangeError);
  console.log('Segment Tree Beats: all tests passed');
}

module.exports = { SegmentTreeBeats };
