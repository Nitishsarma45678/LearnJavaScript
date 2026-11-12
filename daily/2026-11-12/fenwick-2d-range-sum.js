/**
 * Two-dimensional Fenwick Tree (Binary Indexed Tree).
 *
 * Exercise:
 * Maintain a mutable numeric matrix with point additions/assignments and
 * inclusive rectangular sum queries. The constructor builds the index in
 * O(rows * columns) using two propagation passes.
 *
 * Complexity: O(log R * log C) per update or query; O(R * C) storage.
 *
 * Run: node fenwick-2d-range-sum.js
 */

class Fenwick2D {
  constructor(matrix) {
    if (!Array.isArray(matrix) || matrix.length === 0 ||
        !Array.isArray(matrix[0]) || matrix[0].length === 0) {
      throw new TypeError("matrix must be a non-empty rectangular array");
    }
    this.rows = matrix.length;
    this.columns = matrix[0].length;
    for (const row of matrix) {
      if (!Array.isArray(row) || row.length !== this.columns ||
          row.some(value => typeof value !== "number" || !Number.isFinite(value))) {
        throw new TypeError("matrix must be rectangular and contain finite numbers");
      }
    }

    this.values = matrix.map(row => row.slice());
    this.tree = Array.from(
      { length: this.rows + 1 },
      () => new Float64Array(this.columns + 1)
    );

    for (let r = 1; r <= this.rows; r++) {
      for (let c = 1; c <= this.columns; c++) {
        this.tree[r][c] = matrix[r - 1][c - 1];
      }
    }
    // Propagate along the row dimension, then the column dimension.
    for (let r = 1; r <= this.rows; r++) {
      const parent = r + (r & -r);
      if (parent <= this.rows) {
        for (let c = 1; c <= this.columns; c++) {
          this.tree[parent][c] += this.tree[r][c];
        }
      }
    }
    for (let c = 1; c <= this.columns; c++) {
      const parent = c + (c & -c);
      if (parent <= this.columns) {
        for (let r = 1; r <= this.rows; r++) {
          this.tree[r][parent] += this.tree[r][c];
        }
      }
    }
  }

  _coordinates(row, column) {
    if (!Number.isInteger(row) || !Number.isInteger(column) ||
        row < 0 || row >= this.rows || column < 0 || column >= this.columns) {
      throw new RangeError("cell coordinates are outside the matrix");
    }
  }

  add(row, column, delta) {
    this._coordinates(row, column);
    if (typeof delta !== "number" || !Number.isFinite(delta)) {
      throw new TypeError("delta must be a finite number");
    }
    this.values[row][column] += delta;
    for (let r = row + 1; r <= this.rows; r += r & -r) {
      for (let c = column + 1; c <= this.columns; c += c & -c) {
        this.tree[r][c] += delta;
      }
    }
  }

  set(row, column, value) {
    this._coordinates(row, column);
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError("value must be a finite number");
    }
    this.add(row, column, value - this.values[row][column]);
  }

  // Sum of [0..row] x [0..column], inclusive. A -1 boundary yields zero.
  prefixSum(row, column) {
    if (!Number.isInteger(row) || !Number.isInteger(column) ||
        row >= this.rows || column >= this.columns) {
      throw new RangeError("prefix boundary is outside the matrix");
    }
    let total = 0;
    for (let r = row + 1; r > 0; r -= r & -r) {
      for (let c = column + 1; c > 0; c -= c & -c) {
        total += this.tree[r][c];
      }
    }
    return total;
  }

  // Sum of [top..bottom] x [left..right], all boundaries inclusive.
  sumRegion(top, left, bottom, right) {
    this._coordinates(top, left);
    this._coordinates(bottom, right);
    if (top > bottom || left > right) {
      throw new RangeError("rectangle boundaries must be ordered");
    }
    return this.prefixSum(bottom, right)
      - this.prefixSum(top - 1, right)
      - this.prefixSum(bottom, left - 1)
      + this.prefixSum(top - 1, left - 1);
  }
}

function runTests() {
  const assert = require("node:assert/strict");
  const matrix = [
    [3, 0, 1, 4, 2],
    [5, 6, 3, 2, 1],
    [1, 2, 0, 1, 5],
    [4, 1, 0, 1, 7]
  ];
  const bit = new Fenwick2D(matrix);
  assert.equal(bit.sumRegion(1, 1, 2, 3), 14);
  assert.equal(bit.prefixSum(0, 4), 10);
  bit.add(2, 2, 8);
  assert.equal(bit.sumRegion(1, 1, 2, 3), 22);
  bit.set(0, 0, -3);
  assert.equal(bit.sumRegion(0, 0, 0, 0), -3);
  assert.throws(() => bit.add(4, 0, 1), /outside/);
  assert.throws(() => bit.sumRegion(2, 2, 1, 3), /ordered/);

  // Deterministic randomized differential test against a plain matrix.
  let seed = 0x51f15e;
  const random = max => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % max;
  };
  const plain = Array.from({ length: 13 }, () =>
    Array.from({ length: 9 }, () => random(21) - 10));
  const index = new Fenwick2D(plain);
  for (let step = 0; step < 250; step++) {
    if (step % 3 === 0) {
      const r = random(13), c = random(9), delta = random(15) - 7;
      plain[r][c] += delta;
      index.add(r, c, delta);
    } else {
      const r1 = random(13), r2 = random(13);
      const c1 = random(9), c2 = random(9);
      const top = Math.min(r1, r2), bottom = Math.max(r1, r2);
      const left = Math.min(c1, c2), right = Math.max(c1, c2);
      let expected = 0;
      for (let r = top; r <= bottom; r++) {
        for (let c = left; c <= right; c++) expected += plain[r][c];
      }
      assert.equal(index.sumRegion(top, left, bottom, right), expected);
    }
  }
  console.log("Fenwick2D: all tests passed");
}

if (require.main === module) runTests();
module.exports = { Fenwick2D };
