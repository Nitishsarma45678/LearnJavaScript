// Exercise: Implement a 2D Fenwick tree for point updates and rectangle-sum queries.
// Coordinates are zero-based; sumRegion uses inclusive boundaries.

class Fenwick2D {
  constructor(matrix) {
    if (!Array.isArray(matrix) || matrix.some(row => !Array.isArray(row))) {
      throw new TypeError("matrix must be a two-dimensional array");
    }
    const columns = matrix.length ? matrix[0].length : 0;
    if (matrix.some(row => row.length !== columns)) {
      throw new TypeError("matrix must be rectangular");
    }
    this.rows = matrix.length;
    this.columns = columns;
    this.values = matrix.map(row => row.slice());
    this.tree = Array.from({ length: this.rows + 1 },
      () => Array(this.columns + 1).fill(0));

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.columns; c++) {
        this._add(r, c, this.values[r][c]);
      }
    }
  }

  _check(row, column) {
    if (!Number.isInteger(row) || !Number.isInteger(column) ||
        row < 0 || row >= this.rows || column < 0 || column >= this.columns) {
      throw new RangeError("cell coordinate is out of bounds");
    }
  }

  _add(row, column, delta) {
    for (let r = row + 1; r <= this.rows; r += r & -r) {
      for (let c = column + 1; c <= this.columns; c += c & -c) {
        this.tree[r][c] += delta;
      }
    }
  }

  add(row, column, delta) {
    this._check(row, column);
    if (!Number.isFinite(delta)) throw new TypeError("delta must be finite");
    this.values[row][column] += delta;
    this._add(row, column, delta);
  }

  set(row, column, value) {
    this._check(row, column);
    if (!Number.isFinite(value)) throw new TypeError("value must be finite");
    const delta = value - this.values[row][column];
    this.values[row][column] = value;
    this._add(row, column, delta);
  }

  prefixSum(row, column) {
    if (row < 0 || column < 0) return 0;
    if (!Number.isInteger(row) || !Number.isInteger(column) ||
        row >= this.rows || column >= this.columns) {
      throw new RangeError("prefix coordinate is out of bounds");
    }
    let sum = 0;
    for (let r = row + 1; r > 0; r -= r & -r) {
      for (let c = column + 1; c > 0; c -= c & -c) {
        sum += this.tree[r][c];
      }
    }
    return sum;
  }

  sumRegion(row1, column1, row2, column2) {
    this._check(row1, column1);
    this._check(row2, column2);
    if (row1 > row2 || column1 > column2) {
      throw new RangeError("region start must not exceed region end");
    }
    return this.prefixSum(row2, column2)
      - this.prefixSum(row1 - 1, column2)
      - this.prefixSum(row2, column1 - 1)
      + this.prefixSum(row1 - 1, column1 - 1);
  }
}

// Tests
const assert = require("node:assert/strict");
const matrix = [
  [3, 0, 1, 4],
  [5, 6, 3, 2],
  [1, 2, 0, 1],
  [4, 1, 0, 1]
];
const fenwick = new Fenwick2D(matrix);
assert.equal(fenwick.sumRegion(1, 1, 2, 2), 11);
fenwick.add(2, 2, 7);
assert.equal(fenwick.sumRegion(1, 1, 2, 2), 18);
fenwick.set(0, 0, -3);
assert.equal(fenwick.prefixSum(0, 0), -3);
assert.throws(() => fenwick.add(9, 0, 1), RangeError);
assert.throws(() => new Fenwick2D([[1], [2, 3]]), TypeError);
console.log("2D Fenwick tree tests passed");
