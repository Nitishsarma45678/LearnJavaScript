'use strict';

/**
 * Exact union area for axis-aligned rectangles using a sweep line and a
 * segment tree that tracks covered y-length. BigInt coordinates avoid
 * precision loss. Each rectangle is [x1, y1, x2, y2]; degenerate rectangles
 * are ignored.
 */
function toCoordinate(value, label) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  throw new TypeError(`${label} must be a BigInt or a safe integer Number`);
}

class CoveredLengthTree {
  constructor(coordinates) {
    this.coordinates = coordinates;
    this.intervals = coordinates.length - 1;
    const capacity = Math.max(4, this.intervals * 4);
    this.coverCount = Array(capacity).fill(0);
    this.coveredLength = Array(capacity).fill(0n);
  }

  update(queryLeft, queryRight, delta) {
    if (queryLeft >= queryRight || this.intervals === 0) return;
    this._update(1, 0, this.intervals, queryLeft, queryRight, delta);
  }

  _update(node, left, right, queryLeft, queryRight, delta) {
    if (queryLeft >= right || queryRight <= left) return;
    if (queryLeft <= left && right <= queryRight) {
      this.coverCount[node] += delta;
      if (this.coverCount[node] < 0) throw new Error('segment coverage invariant violated');
    } else {
      const middle = (left + right) >> 1;
      this._update(node * 2, left, middle, queryLeft, queryRight, delta);
      this._update(node * 2 + 1, middle, right, queryLeft, queryRight, delta);
    }
    this._pull(node, left, right);
  }

  _pull(node, left, right) {
    if (this.coverCount[node] > 0) {
      this.coveredLength[node] = this.coordinates[right] - this.coordinates[left];
    } else if (right - left === 1) {
      this.coveredLength[node] = 0n;
    } else {
      this.coveredLength[node] = this.coveredLength[node * 2] + this.coveredLength[node * 2 + 1];
    }
  }

  get totalCoveredLength() {
    return this.intervals === 0 ? 0n : this.coveredLength[1];
  }
}

function rectangleUnionArea(rectangles) {
  if (!Array.isArray(rectangles)) throw new TypeError('rectangles must be an array');
  const events = [];
  const yCoordinates = [];

  rectangles.forEach((rectangle, index) => {
    if (!Array.isArray(rectangle) || rectangle.length !== 4) {
      throw new TypeError(`rectangle ${index} must be [x1, y1, x2, y2]`);
    }
    const [x1, y1, x2, y2] = rectangle.map((value, axis) =>
      toCoordinate(value, `rectangle ${index}, coordinate ${axis}`));
    if (x1 > x2 || y1 > y2) throw new RangeError(`rectangle ${index} has reversed bounds`);
    if (x1 === x2 || y1 === y2) return;
    events.push({ x: x1, y1, y2, delta: 1 }, { x: x2, y1, y2, delta: -1 });
    yCoordinates.push(y1, y2);
  });

  if (events.length === 0) return 0n;
  yCoordinates.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const uniqueY = yCoordinates.filter((value, index) => index === 0 || value !== yCoordinates[index - 1]);
  const yIndex = new Map(uniqueY.map((value, index) => [value, index]));
  events.sort((a, b) => a.x < b.x ? -1 : a.x > b.x ? 1 : a.delta - b.delta);

  const tree = new CoveredLengthTree(uniqueY);
  let area = 0n;
  let previousX = events[0].x;
  let index = 0;

  while (index < events.length) {
    const currentX = events[index].x;
    area += (currentX - previousX) * tree.totalCoveredLength;
    while (index < events.length && events[index].x === currentX) {
      const event = events[index++];
      tree.update(yIndex.get(event.y1), yIndex.get(event.y2), event.delta);
    }
    previousX = currentX;
  }
  return area;
}

function runTests() {
  const assert = require('node:assert/strict');
  assert.equal(rectangleUnionArea([[0, 0, 2, 2], [1, 1, 3, 3]]), 7n);
  assert.equal(rectangleUnionArea([[-3, -2, 2, 4], [-1, 0, 0, 1]]), 30n);
  assert.equal(rectangleUnionArea([[0, 0, 5, 5], [1, 1, 2, 2], [2, 2, 5, 5]]), 25n);
  assert.equal(rectangleUnionArea([[0, 0, 0, 9], [2, 4, 7, 4]]), 0n);
  assert.equal(rectangleUnionArea([]), 0n);
  assert.equal(rectangleUnionArea([[0n, 0n, 10n ** 18n, 10n ** 18n]]), 10n ** 36n);
  assert.throws(() => rectangleUnionArea([[0, 0, 1.5, 2]]), TypeError);
  assert.throws(() => rectangleUnionArea([[2, 0, 1, 2]]), RangeError);

  // Unit-cell oracle for random small integer rectangles.
  let seed = 0x10203040;
  const random = max => ((seed = (seed * 1664525 + 1013904223) >>> 0) % max);
  for (let trial = 0; trial < 250; trial += 1) {
    const rectangles = [];
    const cells = new Set();
    for (let i = 0, count = random(8); i < count; i += 1) {
      const x1 = random(9) - 4, x2 = random(9) - 4;
      const y1 = random(9) - 4, y2 = random(9) - 4;
      const left = Math.min(x1, x2), right = Math.max(x1, x2);
      const bottom = Math.min(y1, y2), top = Math.max(y1, y2);
      rectangles.push([left, bottom, right, top]);
      for (let x = left; x < right; x += 1) {
        for (let y = bottom; y < top; y += 1) cells.add(`${x},${y}`);
      }
    }
    assert.equal(rectangleUnionArea(rectangles), BigInt(cells.size));
  }
  console.log('Rectangle union area tests passed');
}

if (require.main === module) runTests();
module.exports = { CoveredLengthTree, rectangleUnionArea };
