'use strict';

const assert = require('node:assert/strict');

class DisjointSparseTable {
  constructor(values, combine, identity) {
    if (typeof combine !== 'function') throw new TypeError('combine must be a function');
    this.values = values.slice();
    this.combine = combine;
    this.identity = identity;
    const n = values.length;
    const levels = Math.ceil(Math.log2(Math.max(1, n)));
    this.table = Array.from({ length: levels }, () => Array(n));

    for (let level = 0; level < levels; level++) {
      const half = 2 ** level;
      const block = half * 2;
      for (let start = 0; start < n; start += block) {
        const middle = Math.min(start + half, n);
        const end = Math.min(start + block, n);
        if (middle > start) {
          this.table[level][middle - 1] = values[middle - 1];
          for (let i = middle - 2; i >= start; i--) {
            this.table[level][i] = combine(values[i], this.table[level][i + 1]);
          }
        }
        if (middle < end) {
          this.table[level][middle] = values[middle];
          for (let i = middle + 1; i < end; i++) {
            this.table[level][i] = combine(this.table[level][i - 1], values[i]);
          }
        }
      }
    }
  }

  query(left, right) {
    if (!Number.isInteger(left) || !Number.isInteger(right) || left < 0 || right < left || right > this.values.length) {
      throw new RangeError('Expected a valid half-open range');
    }
    if (left === right) return this.identity;
    if (right - left === 1) return this.values[left];
    const last = right - 1;
    const level = 31 - Math.clz32(left ^ last);
    return this.combine(this.table[level][left], this.table[level][last]);
  }
}

const strings = new DisjointSparseTable(['a', 'b', 'c', 'd', 'e'], (a, b) => a + b, '');
assert.equal(strings.query(1, 4), 'bcd');
assert.equal(strings.query(0, 5), 'abcde');
assert.equal(strings.query(2, 3), 'c');
assert.equal(strings.query(2, 2), '');
const sums = new DisjointSparseTable([3, 1, 4, 1, 5, 9], (a, b) => a + b, 0);
assert.equal(sums.query(1, 5), 11);
assert.throws(() => sums.query(-1, 2), RangeError);
console.log('Disjoint-sparse-table examples passed.');

module.exports = { DisjointSparseTable };
