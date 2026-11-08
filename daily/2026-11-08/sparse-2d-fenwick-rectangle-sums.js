"use strict";

const assert = require("node:assert/strict");

function lowerBound(values, target) {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (values[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBound(values, target) {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (values[mid] <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function finiteCoordinate(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(label + " must be a finite number");
  }
  return value;
}

/**
 * Sparse 2D Fenwick tree for point additions and inclusive rectangle sums.
 *
 * The possible update coordinates must be known at construction time. The
 * nested y-coordinate lists are compressed independently for each outer
 * Fenwick node, so memory is O(m log m), not O(maxX * maxY).
 *
 * add(x, y, delta) is O(log^2 m).
 * rectangleSum(x1, y1, x2, y2) is O(log^2 m).
 */
class SparseFenwick2D {
  constructor(updatePoints) {
    if (!Array.isArray(updatePoints)) {
      throw new TypeError("updatePoints must be an array of [x, y] pairs");
    }

    const normalized = updatePoints.map((point, index) => {
      if (!Array.isArray(point) || point.length !== 2) {
        throw new TypeError("update point " + index + " must be [x, y]");
      }
      return [
        finiteCoordinate(point[0], "x coordinate"),
        finiteCoordinate(point[1], "y coordinate")
      ];
    });

    this.xs = [...new Set(normalized.map(([x]) => x))].sort((a, b) => a - b);
    this.ys = Array.from({ length: this.xs.length + 1 }, () => []);

    for (const [x, y] of normalized) {
      const outerIndex = lowerBound(this.xs, x) + 1;
      for (let i = outerIndex; i < this.ys.length; i += i & -i) {
        this.ys[i].push(y);
      }
    }

    this.bits = Array(this.ys.length);
    for (let i = 1; i < this.ys.length; i++) {
      const coordinates = [...new Set(this.ys[i])].sort((a, b) => a - b);
      this.ys[i] = coordinates;
      this.bits[i] = new Float64Array(coordinates.length + 1);
    }
  }

  add(x, y, delta) {
    finiteCoordinate(x, "x coordinate");
    finiteCoordinate(y, "y coordinate");
    if (typeof delta !== "number" || !Number.isFinite(delta)) {
      throw new TypeError("delta must be a finite number");
    }

    const compressedX = lowerBound(this.xs, x);
    if (compressedX === this.xs.length || this.xs[compressedX] !== x) {
      throw new RangeError("x was not registered during construction");
    }

    for (let i = compressedX + 1; i < this.ys.length; i += i & -i) {
      const compressedY = lowerBound(this.ys[i], y);
      if (
        compressedY === this.ys[i].length ||
        this.ys[i][compressedY] !== y
      ) {
        throw new RangeError("the coordinate pair was not registered");
      }

      for (
        let j = compressedY + 1;
        j < this.bits[i].length;
        j += j & -j
      ) {
        this.bits[i][j] += delta;
      }
    }
    return this;
  }

  // Prefix sum over x < xLimit or x <= xLimit, and independently for y.
  _prefix(xLimit, yLimit, inclusiveX, inclusiveY) {
    finiteCoordinate(xLimit, "x limit");
    finiteCoordinate(yLimit, "y limit");

    let total = 0;
    const outerCount = inclusiveX
      ? upperBound(this.xs, xLimit)
      : lowerBound(this.xs, xLimit);

    for (let i = outerCount; i > 0; i -= i & -i) {
      const innerCount = inclusiveY
        ? upperBound(this.ys[i], yLimit)
        : lowerBound(this.ys[i], yLimit);

      for (let j = innerCount; j > 0; j -= j & -j) {
        total += this.bits[i][j];
      }
    }
    return total;
  }

  prefixSum(x, y) {
    return this._prefix(x, y, true, true);
  }

  // Bounds are inclusive. Reversed bounds describe an empty rectangle.
  rectangleSum(x1, y1, x2, y2) {
    finiteCoordinate(x1, "x1");
    finiteCoordinate(y1, "y1");
    finiteCoordinate(x2, "x2");
    finiteCoordinate(y2, "y2");
    if (x1 > x2 || y1 > y2) return 0;

    return (
      this._prefix(x2, y2, true, true) -
      this._prefix(x1, y2, false, true) -
      this._prefix(x2, y1, true, false) +
      this._prefix(x1, y1, false, false)
    );
  }
}

function runTests() {
  const xs = [-5, -1, 2, 8];
  const ys = [-4, 0, 3, 9];
  const points = xs.flatMap(x => ys.map(y => [x, y]));
  const tree = new SparseFenwick2D(points);
  const model = new Map();
  const keyOf = (x, y) => x + "," + y;

  let seed = 0x12345678;
  const random = max => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % max;
  };

  for (let step = 0; step < 500; step++) {
    const x = xs[random(xs.length)];
    const y = ys[random(ys.length)];
    const delta = random(21) - 10;
    tree.add(x, y, delta);
    const key = keyOf(x, y);
    model.set(key, (model.get(key) || 0) + delta);

    const ax = xs[random(xs.length)];
    const bx = xs[random(xs.length)];
    const ay = ys[random(ys.length)];
    const by = ys[random(ys.length)];
    const minX = Math.min(ax, bx);
    const maxX = Math.max(ax, bx);
    const minY = Math.min(ay, by);
    const maxY = Math.max(ay, by);

    let expected = 0;
    for (const [px, py] of points) {
      if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
        expected += model.get(keyOf(px, py)) || 0;
      }
    }
    assert.equal(tree.rectangleSum(minX, minY, maxX, maxY), expected);
  }

  assert.equal(tree.prefixSum(2, 3), points
    .filter(([x, y]) => x <= 2 && y <= 3)
    .reduce((sum, [x, y]) => sum + (model.get(keyOf(x, y)) || 0), 0));
  assert.equal(tree.rectangleSum(10, 10, 20, 20), 0);
  assert.throws(() => tree.add(99, 99, 1), RangeError);
  assert.throws(() => tree.add(-5, 9, 1), RangeError);

  const example = new SparseFenwick2D([[1, 1], [1, 4], [3, 1], [3, 4]]);
  example.add(1, 1, 5).add(3, 4, 7);
  assert.equal(example.rectangleSum(1, 1, 3, 4), 12);
  assert.equal(example.rectangleSum(2, 2, 3, 4), 7);
}

if (require.main === module) {
  runTests();
  console.log("SparseFenwick2D: all tests passed");
}

module.exports = { SparseFenwick2D };
