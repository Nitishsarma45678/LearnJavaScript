'use strict';

/**
 * 2D Fenwick tree supporting rectangle-add and rectangle-sum in O(log R log C).
 * Coordinates are zero-based and both rectangle endpoints are inclusive.
 * Four internal 2D BITs represent the 2D difference array and its moments.
 */
class RangeFenwick2D {
  constructor(rows, columns) {
    if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(columns) || columns < 1) {
      throw new RangeError('rows and columns must be positive integers');
    }
    this.rows = rows;
    this.columns = columns;
    this.trees = Array.from({ length: 4 }, () =>
      Array.from({ length: rows + 1 }, () => new Float64Array(columns + 1))
    );
  }

  _add(tree, x, y, delta) {
    for (let i = x; i <= this.rows; i += i & -i) {
      for (let j = y; j <= this.columns; j += j & -j) tree[i][j] += delta;
    }
  }

  _sum(tree, x, y) {
    let total = 0;
    for (let i = x; i > 0; i -= i & -i) {
      for (let j = y; j > 0; j -= j & -j) total += tree[i][j];
    }
    return total;
  }

  _corner(x, y, delta) {
    if (x > this.rows || y > this.columns) return;
    const [b1, bx, by, bxy] = this.trees;
    this._add(b1, x, y, delta);
    this._add(bx, x, y, delta * (x - 1));
    this._add(by, x, y, delta * (y - 1));
    this._add(bxy, x, y, delta * (x - 1) * (y - 1));
  }

  _validateRectangle(x1, y1, x2, y2) {
    if (![x1, y1, x2, y2].every(Number.isInteger) ||
        x1 < 0 || y1 < 0 || x2 < x1 || y2 < y1 ||
        x2 >= this.rows || y2 >= this.columns) {
      throw new RangeError('invalid inclusive rectangle coordinates');
    }
  }

  addRectangle(x1, y1, x2, y2, delta) {
    this._validateRectangle(x1, y1, x2, y2);
    if (!Number.isFinite(delta)) throw new TypeError('delta must be finite');
    const left = x1 + 1;
    const top = y1 + 1;
    const right = x2 + 2;
    const bottom = y2 + 2;
    this._corner(left, top, delta);
    this._corner(left, bottom, -delta);
    this._corner(right, top, -delta);
    this._corner(right, bottom, delta);
  }

  prefixSum(x, y) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x >= this.rows || y >= this.columns) {
      throw new RangeError('prefix coordinates must be integers within the grid');
    }
    if (x < 0 || y < 0) return 0;
    const X = x + 1;
    const Y = y + 1;
    const [b1, bx, by, bxy] = this.trees;
    return X * Y * this._sum(b1, X, Y)
      - Y * this._sum(bx, X, Y)
      - X * this._sum(by, X, Y)
      + this._sum(bxy, X, Y);
  }

  sumRectangle(x1, y1, x2, y2) {
    this._validateRectangle(x1, y1, x2, y2);
    return this.prefixSum(x2, y2)
      - this.prefixSum(x1 - 1, y2)
      - this.prefixSum(x2, y1 - 1)
      + this.prefixSum(x1 - 1, y1 - 1);
  }
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  const grid = new RangeFenwick2D(4, 5);
  grid.addRectangle(0, 1, 2, 3, 5);
  grid.addRectangle(1, 2, 3, 4, -2);
  assert.equal(grid.sumRectangle(0, 0, 3, 4), 27);
  assert.equal(grid.sumRectangle(1, 2, 2, 3), 12);
  assert.equal(grid.sumRectangle(3, 4, 3, 4), -2);
  assert.equal(grid.sumRectangle(0, 0, 0, 0), 0);

  // Differential test against a plain matrix after deterministic rectangle updates.
  const rows = 7;
  const cols = 6;
  const fast = new RangeFenwick2D(rows, cols);
  const slow = Array.from({ length: rows }, () => Array(cols).fill(0));
  let seed = 0x12345678;
  const random = max => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % max;
  };
  for (let step = 0; step < 80; step += 1) {
    let x1 = random(rows), x2 = random(rows), y1 = random(cols), y2 = random(cols);
    if (x1 > x2) [x1, x2] = [x2, x1];
    if (y1 > y2) [y1, y2] = [y2, y1];
    const delta = random(11) - 5;
    fast.addRectangle(x1, y1, x2, y2, delta);
    for (let x = x1; x <= x2; x += 1) {
      for (let y = y1; y <= y2; y += 1) slow[x][y] += delta;
    }
    let a = random(rows), b = random(rows), c = random(cols), d = random(cols);
    if (a > b) [a, b] = [b, a];
    if (c > d) [c, d] = [d, c];
    let expected = 0;
    for (let x = a; x <= b; x += 1) for (let y = c; y <= d; y += 1) expected += slow[x][y];
    assert.equal(fast.sumRectangle(a, c, b, d), expected);
  }
  assert.throws(() => grid.addRectangle(-1, 0, 1, 1, 2), RangeError);
  console.log('2D range Fenwick tree: all tests passed');
}

module.exports = { RangeFenwick2D };
