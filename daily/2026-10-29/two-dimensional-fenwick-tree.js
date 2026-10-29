/**
 * Two-dimensional Fenwick Tree (Binary Indexed Tree)
 *
 * Exercise: support point updates and inclusive rectangle-sum queries on a
 * rectangular matrix in O(log rows * log cols) per operation.
 * Coordinates are zero-based in the public API.
 */
"use strict";
const assert = require("node:assert/strict");

class Fenwick2D {
  constructor(matrix) {
    if (!Array.isArray(matrix) || matrix.length === 0 ||
        !Array.isArray(matrix[0]) || matrix[0].length === 0) {
      throw new TypeError("matrix must be a non-empty rectangular array");
    }
    this.rows = matrix.length;
    this.cols = matrix[0].length;
    if (matrix.some(row => !Array.isArray(row) || row.length !== this.cols ||
        row.some(value => !Number.isFinite(value)))) {
      throw new TypeError("matrix must contain finite numbers and have equal row lengths");
    }
    this.bit = Array.from({ length: this.rows + 1 },
      () => Array(this.cols + 1).fill(0));
    this.values = Array.from({ length: this.rows },
      (_, r) => Array.from(matrix[r]));
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) this.#add(r, c, this.values[r][c]);
    }
  }

  #checkCell(row, col) {
    if (!Number.isInteger(row) || !Number.isInteger(col) ||
        row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
      throw new RangeError("cell coordinate out of bounds");
    }
  }

  #add(row, col, delta) {
    for (let r = row + 1; r <= this.rows; r += r & -r) {
      for (let c = col + 1; c <= this.cols; c += c & -c) {
        this.bit[r][c] += delta;
      }
    }
  }

  update(row, col, newValue) {
    this.#checkCell(row, col);
    if (!Number.isFinite(newValue)) throw new TypeError("value must be finite");
    const delta = newValue - this.values[row][col];
    this.values[row][col] = newValue;
    this.#add(row, col, delta);
  }

  #prefix(row, col) {
    if (row < 0 || col < 0) return 0;
    let sum = 0;
    for (let r = row + 1; r > 0; r -= r & -r) {
      for (let c = col + 1; c > 0; c -= c & -c) sum += this.bit[r][c];
    }
    return sum;
  }

  sumRegion(top, left, bottom, right) {
    this.#checkCell(top, left);
    this.#checkCell(bottom, right);
    if (top > bottom || left > right) throw new RangeError("invalid rectangle");
    return this.#prefix(bottom, right) - this.#prefix(top - 1, right)
      - this.#prefix(bottom, left - 1) + this.#prefix(top - 1, left - 1);
  }
}

// Examples and edge-case tests.
const grid = [
  [3, 0, 1, 4, 2],
  [5, 6, 3, 2, 1],
  [1, 2, 0, 1, 5],
  [4, 1, 0, 1, 7],
  [1, 0, 3, 0, 5]
];
const tree = new Fenwick2D(grid);
assert.equal(tree.sumRegion(2, 1, 4, 3), 8);
assert.equal(tree.sumRegion(1, 1, 2, 2), 11);
tree.update(3, 2, 2); // old value 0 -> 2
assert.equal(tree.sumRegion(2, 1, 4, 3), 10);
assert.equal(tree.sumRegion(0, 0, 4, 4),
  grid.flat().reduce((a, b) => a + b, 0) + 2);
assert.throws(() => tree.update(5, 0, 1), RangeError);
assert.throws(() => tree.sumRegion(3, 3, 1, 4), RangeError);

module.exports = { Fenwick2D };
