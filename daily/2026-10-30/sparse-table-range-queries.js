'use strict';

/**
 * Immutable sparse table for idempotent range queries (minimum by default).
 * Preprocessing is O(n log n), each inclusive query is O(1), and queryIndex
 * returns the leftmost index when multiple values compare equal.
 */
class SparseTable {
  constructor(values, compare = (a, b) => a - b) {
    if (!Array.isArray(values)) throw new TypeError('values must be an array');
    if (typeof compare !== 'function') throw new TypeError('compare must be a function');
    this.values = values.slice();
    this.compare = compare;
    const n = values.length;
    this.logs = new Uint32Array(n + 1);
    for (let i = 2; i <= n; i += 1) this.logs[i] = this.logs[i >> 1] + 1;

    this.levels = [];
    if (n === 0) return;
    this.levels.push(Array.from({ length: n }, (_, index) => index));
    for (let power = 1; (1 << power) <= n; power += 1) {
      const half = 1 << (power - 1);
      const span = half * 2;
      const previous = this.levels[power - 1];
      const current = new Array(n - span + 1);
      for (let start = 0; start < current.length; start += 1) {
        current[start] = this.betterIndex(previous[start], previous[start + half]);
      }
      this.levels.push(current);
    }
  }

  betterIndex(leftIndex, rightIndex) {
    const order = this.compare(this.values[leftIndex], this.values[rightIndex]);
    if (typeof order !== 'number' || Number.isNaN(order)) {
      throw new TypeError('compare must return a number other than NaN');
    }
    if (order < 0) return leftIndex;
    if (order > 0) return rightIndex;
    return Math.min(leftIndex, rightIndex);
  }

  queryIndex(left, right) {
    if (!Number.isInteger(left) || !Number.isInteger(right) || left < 0 || right < left || right >= this.values.length) {
      throw new RangeError(\`query must satisfy 0 <= left <= right < \${this.values.length}\`);
    }
    const length = right - left + 1;
    const power = this.logs[length];
    const span = 1 << power;
    return this.betterIndex(this.levels[power][left], this.levels[power][right - span + 1]);
  }

  query(left, right) {
    return this.values[this.queryIndex(left, right)];
  }
}

// Examples and randomized checks against a direct scan.
const assert = require('node:assert/strict');
const values = [7, 3, 5, 3, -2, 8, -2, 4];
const table = new SparseTable(values);
assert.equal(table.query(0, 7), -2);
assert.equal(table.queryIndex(0, 7), 4); // leftmost minimum
assert.equal(table.queryIndex(5, 7), 6);
assert.equal(table.query(1, 3), 3);

const words = ['pear', 'fig', 'watermelon', 'kiwi'];
const longest = new SparseTable(words, (a, b) => b.length - a.length);
assert.equal(longest.query(0, 3), 'watermelon');
assert.equal(longest.queryIndex(0, 3), 2);

let seed = 91;
function randomInt(max) {
  seed = (seed * 1103515245 + 12345) >>> 0;
  return seed % max;
}
for (let trial = 0; trial < 300; trial += 1) {
  const left = randomInt(values.length);
  const right = left + randomInt(values.length - left);
  let expected = left;
  for (let i = left + 1; i <= right; i += 1) {
    if (values[i] < values[expected]) expected = i;
  }
  assert.equal(table.queryIndex(left, right), expected);
}
assert.throws(() => table.query(0, 8), RangeError);
assert.throws(() => table.query(2, 1), RangeError);
assert.throws(() => new SparseTable('not an array'), TypeError);
assert.throws(() => new SparseTable([]).query(0, 0), RangeError);
assert.throws(() => new SparseTable([1, 2], () => NaN), TypeError);
console.log('sparse-table-range-queries: all tests passed');
