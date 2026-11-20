// Exercise: Use a Fenwick tree to support inclusive range additions and point queries.
// Each update is O(log n), as is each point query.
// Run: node daily/2026-11-20/20-fenwick-range-add-point-query.js
"use strict";
const assert = require("node:assert/strict");
class RangeAddPointQuery {
  constructor(values) {
    if (!Array.isArray(values) || values.some(value => !Number.isFinite(value))) {
      throw new TypeError("values must be an array of finite numbers");
    }
    this.length = values.length;
    this.tree = Array(values.length + 1).fill(0);
    values.forEach((value, index) => this.rangeAdd(index, index, value));
  }
  _checkRange(left, right) {
    if (!Number.isInteger(left) || !Number.isInteger(right) ||
        left < 0 || right >= this.length || left > right) {
      throw new RangeError("invalid inclusive range");
    }
  }
  _add(index, delta) {
    for (let i = index + 1; i <= this.length; i += i & -i) this.tree[i] += delta;
  }
  rangeAdd(left, right, delta) {
    this._checkRange(left, right);
    if (!Number.isFinite(delta)) throw new TypeError("delta must be finite");
    this._add(left, delta);
    if (right + 1 < this.length) this._add(right + 1, -delta);
  }
  pointQuery(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.length) throw new RangeError("index out of range");
    let total = 0;
    for (let i = index + 1; i > 0; i -= i & -i) total += this.tree[i];
    return total;
  }
}
const values = new RangeAddPointQuery([1, 2, 3, 4, 5]);
assert.deepEqual([0,1,2,3,4].map(index => values.pointQuery(index)), [1,2,3,4,5]);
values.rangeAdd(1, 3, 10);
assert.deepEqual([0,1,2,3,4].map(index => values.pointQuery(index)), [1,12,13,14,5]);
values.rangeAdd(0, 4, -2);
assert.deepEqual([0,1,2,3,4].map(index => values.pointQuery(index)), [-1,10,11,12,3]);
assert.throws(() => values.rangeAdd(3, 1, 1), /range/);
assert.throws(() => values.pointQuery(5), /index/);
assert.throws(() => new RangeAddPointQuery([1, NaN]), /finite/);
console.log("Fenwick range-add/point-query: all tests passed");
