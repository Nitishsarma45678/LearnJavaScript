/**
 * Segment Tree Beats: range add, range chmin, range chmax, and range sum.
 *
 * All public ranges are inclusive. The structure stores the largest and
 * second-largest values (and their counts), the smallest and second-smallest
 * values (and their counts), and the segment sum. Conditional clamps can
 * therefore update a whole node without descending to its children.
 *
 * Expected amortized complexity: O(log n) for common updates, with the
 * standard Segment Tree Beats amortized bound for mixed clamp operations.
 *
 * Run: node segment-tree-beats-range-queries.js
 */

class SegmentTreeBeats {
  constructor(values) {
    if (!Array.isArray(values) || values.length === 0) {
      throw new TypeError("values must be a non-empty array");
    }
    if (!values.every(Number.isFinite)) {
      throw new TypeError("all values must be finite numbers");
    }

    this.n = values.length;
    const size = 4 * this.n + 8;
    this.sum = new Array(size).fill(0);
    this.max1 = new Array(size).fill(-Infinity);
    this.max2 = new Array(size).fill(-Infinity);
    this.maxCount = new Array(size).fill(0);
    this.min1 = new Array(size).fill(Infinity);
    this.min2 = new Array(size).fill(Infinity);
    this.minCount = new Array(size).fill(0);
    this.lazyAdd = new Array(size).fill(0);
    this._build(1, 0, this.n - 1, values);
  }

  _build(node, left, right, values) {
    if (left === right) {
      const value = values[left];
      this.sum[node] = value;
      this.max1[node] = value;
      this.maxCount[node] = 1;
      this.min1[node] = value;
      this.minCount[node] = 1;
      return;
    }
    const mid = (left + right) >> 1;
    this._build(node * 2, left, mid, values);
    this._build(node * 2 + 1, mid + 1, right, values);
    this._pull(node);
  }

  _pull(node) {
    const a = node * 2;
    const b = a + 1;
    this.sum[node] = this.sum[a] + this.sum[b];

    if (this.max1[a] === this.max1[b]) {
      this.max1[node] = this.max1[a];
      this.maxCount[node] = this.maxCount[a] + this.maxCount[b];
      this.max2[node] = Math.max(this.max2[a], this.max2[b]);
    } else if (this.max1[a] > this.max1[b]) {
      this.max1[node] = this.max1[a];
      this.maxCount[node] = this.maxCount[a];
      this.max2[node] = Math.max(this.max2[a], this.max1[b]);
    } else {
      this.max1[node] = this.max1[b];
      this.maxCount[node] = this.maxCount[b];
      this.max2[node] = Math.max(this.max1[a], this.max2[b]);
    }

    if (this.min1[a] === this.min1[b]) {
      this.min1[node] = this.min1[a];
      this.minCount[node] = this.minCount[a] + this.minCount[b];
      this.min2[node] = Math.min(this.min2[a], this.min2[b]);
    } else if (this.min1[a] < this.min1[b]) {
      this.min1[node] = this.min1[a];
      this.minCount[node] = this.minCount[a];
      this.min2[node] = Math.min(this.min2[a], this.min1[b]);
    } else {
      this.min1[node] = this.min1[b];
      this.minCount[node] = this.minCount[b];
      this.min2[node] = Math.min(this.min1[a], this.min2[b]);
    }
  }

  _applyAdd(node, length, delta) {
    this.sum[node] += delta * length;
    this.max1[node] += delta;
    this.min1[node] += delta;
    if (this.max2[node] !== -Infinity) this.max2[node] += delta;
    if (this.min2[node] !== Infinity) this.min2[node] += delta;
    this.lazyAdd[node] += delta;
  }

  _applyChmin(node, ceiling) {
    if (this.max1[node] <= ceiling) return;
    if (this.max2[node] >= ceiling) {
      throw new Error("internal Segment Tree Beats chmin invariant violated");
    }
    const oldMaximum = this.max1[node];
    this.sum[node] += (ceiling - oldMaximum) * this.maxCount[node];
    if (this.min1[node] === oldMaximum) this.min1[node] = ceiling;
    else if (this.min2[node] === oldMaximum) this.min2[node] = ceiling;
    this.max1[node] = ceiling;
  }

  _applyChmax(node, floor) {
    if (this.min1[node] >= floor) return;
    if (this.min2[node] <= floor) {
      throw new Error("internal Segment Tree Beats chmax invariant violated");
    }
    const oldMinimum = this.min1[node];
    this.sum[node] += (floor - oldMinimum) * this.minCount[node];
    if (this.max1[node] === oldMinimum) this.max1[node] = floor;
    else if (this.max2[node] === oldMinimum) this.max2[node] = floor;
    this.min1[node] = floor;
  }

  _push(node, left, right) {
    if (left === right) return;
    const mid = (left + right) >> 1;
    const a = node * 2;
    const b = a + 1;
    const pending = this.lazyAdd[node];

    if (pending !== 0) {
      this._applyAdd(a, mid - left + 1, pending);
      this._applyAdd(b, right - mid, pending);
      this.lazyAdd[node] = 0;
    }

    for (const child of [a, b]) {
      if (this.max1[child] > this.max1[node]) {
        this._applyChmin(child, this.max1[node]);
      }
      if (this.min1[child] < this.min1[node]) {
        this._applyChmax(child, this.min1[node]);
      }
    }
  }

  _validateRange(left, right) {
    if (!Number.isInteger(left) || !Number.isInteger(right) ||
        left < 0 || right >= this.n || left > right) {
      throw new RangeError("expected an inclusive range within the array");
    }
  }

  rangeAdd(left, right, delta) {
    this._validateRange(left, right);
    if (!Number.isFinite(delta)) throw new TypeError("delta must be finite");
    this._rangeAdd(1, 0, this.n - 1, left, right, delta);
    return this;
  }

  _rangeAdd(node, lo, hi, ql, qr, delta) {
    if (ql <= lo && hi <= qr) {
      this._applyAdd(node, hi - lo + 1, delta);
      return;
    }
    this._push(node, lo, hi);
    const mid = (lo + hi) >> 1;
    if (ql <= mid) this._rangeAdd(node * 2, lo, mid, ql, qr, delta);
    if (qr > mid) this._rangeAdd(node * 2 + 1, mid + 1, hi, ql, qr, delta);
    this._pull(node);
  }

  rangeChmin(left, right, ceiling) {
    this._validateRange(left, right);
    if (!Number.isFinite(ceiling)) throw new TypeError("ceiling must be finite");
    this._rangeChmin(1, 0, this.n - 1, left, right, ceiling);
    return this;
  }

  _rangeChmin(node, lo, hi, ql, qr, ceiling) {
    if (qr < lo || hi < ql || this.max1[node] <= ceiling) return;
    if (ql <= lo && hi <= qr && this.max2[node] < ceiling) {
      this._applyChmin(node, ceiling);
      return;
    }
    this._push(node, lo, hi);
    const mid = (lo + hi) >> 1;
    if (ql <= mid) this._rangeChmin(node * 2, lo, mid, ql, qr, ceiling);
    if (qr > mid) this._rangeChmin(node * 2 + 1, mid + 1, hi, ql, qr, ceiling);
    this._pull(node);
  }

  rangeChmax(left, right, floor) {
    this._validateRange(left, right);
    if (!Number.isFinite(floor)) throw new TypeError("floor must be finite");
    this._rangeChmax(1, 0, this.n - 1, left, right, floor);
    return this;
  }

  _rangeChmax(node, lo, hi, ql, qr, floor) {
    if (qr < lo || hi < ql || this.min1[node] >= floor) return;
    if (ql <= lo && hi <= qr && this.min2[node] > floor) {
      this._applyChmax(node, floor);
      return;
    }
    this._push(node, lo, hi);
    const mid = (lo + hi) >> 1;
    if (ql <= mid) this._rangeChmax(node * 2, lo, mid, ql, qr, floor);
    if (qr > mid) this._rangeChmax(node * 2 + 1, mid + 1, hi, ql, qr, floor);
    this._pull(node);
  }

  rangeSum(left, right) {
    this._validateRange(left, right);
    return this._rangeSum(1, 0, this.n - 1, left, right);
  }

  _rangeSum(node, lo, hi, ql, qr) {
    if (ql <= lo && hi <= qr) return this.sum[node];
    this._push(node, lo, hi);
    const mid = (lo + hi) >> 1;
    let result = 0;
    if (ql <= mid) result += this._rangeSum(node * 2, lo, mid, ql, qr);
    if (qr > mid) result += this._rangeSum(node * 2 + 1, mid + 1, hi, ql, qr);
    return result;
  }

  rangeMinMax(left, right) {
    this._validateRange(left, right);
    return this._rangeMinMax(1, 0, this.n - 1, left, right);
  }

  _rangeMinMax(node, lo, hi, ql, qr) {
    if (ql <= lo && hi <= qr) {
      return { min: this.min1[node], max: this.max1[node] };
    }
    this._push(node, lo, hi);
    const mid = (lo + hi) >> 1;
    let min = Infinity;
    let max = -Infinity;
    if (ql <= mid) {
      const part = this._rangeMinMax(node * 2, lo, mid, ql, qr);
      min = Math.min(min, part.min);
      max = Math.max(max, part.max);
    }
    if (qr > mid) {
      const part = this._rangeMinMax(node * 2 + 1, mid + 1, hi, ql, qr);
      min = Math.min(min, part.min);
      max = Math.max(max, part.max);
    }
    return { min, max };
  }

  toArray() {
    return Array.from({ length: this.n }, (_, index) => this.rangeSum(index, index));
  }
}

function runTests() {
  const assert = require("node:assert/strict");
  const tree = new SegmentTreeBeats([5, 1, 7, 3, 9, 2]);
  tree.rangeChmin(0, 4, 6).rangeChmax(1, 5, 4).rangeAdd(2, 3, 2);
  assert.deepEqual(tree.toArray(), [5, 4, 8, 6, 6, 4]);
  assert.equal(tree.rangeSum(1, 4), 24);
  assert.deepEqual(tree.rangeMinMax(0, 5), { min: 4, max: 8 });

  let seed = 0x51a7;
  const random = (limit) => {
    seed = (seed * 48271) % 0x7fffffff;
    return seed % limit;
  };

  for (let trial = 0; trial < 80; trial += 1) {
    const n = 1 + random(28);
    const naive = Array.from({ length: n }, () => random(41) - 20);
    const beats = new SegmentTreeBeats(naive);
    for (let step = 0; step < 180; step += 1) {
      let left = random(n);
      let right = random(n);
      if (left > right) [left, right] = [right, left];
      const value = random(31) - 15;
      const operation = random(4);
      if (operation === 0) {
        beats.rangeAdd(left, right, value);
        for (let i = left; i <= right; i += 1) naive[i] += value;
      } else if (operation === 1) {
        beats.rangeChmin(left, right, value);
        for (let i = left; i <= right; i += 1) naive[i] = Math.min(naive[i], value);
      } else if (operation === 2) {
        beats.rangeChmax(left, right, value);
        for (let i = left; i <= right; i += 1) naive[i] = Math.max(naive[i], value);
      } else {
        const expected = naive.slice(left, right + 1).reduce((a, b) => a + b, 0);
        assert.equal(beats.rangeSum(left, right), expected);
      }
      assert.deepEqual(beats.toArray(), naive);
    }
  }

  assert.throws(() => new SegmentTreeBeats([]), TypeError);
  assert.throws(() => tree.rangeSum(-1, 2), RangeError);
  console.log("Segment Tree Beats tests passed");
}

module.exports = { SegmentTreeBeats };

if (require.main === module) runTests();
