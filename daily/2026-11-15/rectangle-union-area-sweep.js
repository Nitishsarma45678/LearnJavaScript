'use strict';

/**
 * Computes the union area of axis-aligned rectangles using a sweep line.
 * Events are sorted by x; a segment tree maintains the total covered y-length
 * over compressed half-open intervals. Complexity: O(n log n) time, O(n) space.
 */
function lowerBound(values, target) {
  let low = 0, high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

class CoveredLengthTree {
  constructor(coordinates) {
    this.coordinates = coordinates;
    this.intervals = coordinates.length - 1;
    const capacity = Math.max(4, this.intervals * 4 + 8);
    this.cover = new Int32Array(capacity);
    this.covered = new Float64Array(capacity);
  }

  update(queryLeft, queryRight, delta) {
    if (queryLeft >= queryRight || this.intervals === 0) return;
    this._update(1, 0, this.intervals - 1, queryLeft, queryRight - 1, delta);
  }

  _update(node, left, right, queryLeft, queryRight, delta) {
    if (queryLeft <= left && right <= queryRight) {
      this.cover[node] += delta;
      if (this.cover[node] < 0) throw new Error('segment coverage became negative');
    } else {
      const middle = (left + right) >>> 1;
      if (queryLeft <= middle) this._update(node * 2, left, middle, queryLeft, queryRight, delta);
      if (queryRight > middle) this._update(node * 2 + 1, middle + 1, right, queryLeft, queryRight, delta);
    }
    if (this.cover[node] > 0) {
      this.covered[node] = this.coordinates[right + 1] - this.coordinates[left];
    } else if (left === right) {
      this.covered[node] = 0;
    } else {
      this.covered[node] = this.covered[node * 2] + this.covered[node * 2 + 1];
    }
  }

  get total() { return this.intervals ? this.covered[1] : 0; }
}

function rectangleUnionArea(rectangles) {
  if (!Array.isArray(rectangles)) throw new TypeError('rectangles must be an array');
  const events = [];
  const ys = [];
  for (let index = 0; index < rectangles.length; index++) {
    const rectangle = rectangles[index];
    if (!Array.isArray(rectangle) || rectangle.length !== 4 || !rectangle.every(Number.isFinite)) {
      throw new TypeError(`rectangle ${index} must be [x1, y1, x2, y2] with finite coordinates`);
    }
    const [x1, y1, x2, y2] = rectangle;
    if (x1 > x2 || y1 > y2) throw new RangeError(`rectangle ${index} has reversed bounds`);
    if (x1 === x2 || y1 === y2) continue;
    ys.push(y1, y2);
    events.push({ x: x1, y1, y2, delta: 1 }, { x: x2, y1, y2, delta: -1 });
  }
  if (events.length === 0) return 0;
  ys.sort((a, b) => a - b);
  const uniqueY = ys.filter((value, index) => index === 0 || value !== ys[index - 1]);
  events.sort((a, b) => a.x - b.x);
  const tree = new CoveredLengthTree(uniqueY);
  let area = 0;
  let previousX = events[0].x;
  for (let i = 0; i < events.length;) {
    const x = events[i].x;
    area += tree.total * (x - previousX);
    // Apply every event at x before moving to the next slab. Their order at
    // equal x is immaterial because no area is accumulated between them.
    while (i < events.length && events[i].x === x) {
      const event = events[i++];
      tree.update(lowerBound(uniqueY, event.y1), lowerBound(uniqueY, event.y2), event.delta);
    }
    previousX = x;
  }
  if (!Number.isFinite(area)) throw new RangeError('union area exceeds finite Number range');
  return area;
}

function runTests() {
  const assert = require('node:assert/strict');
  assert.equal(rectangleUnionArea([]), 0);
  assert.equal(rectangleUnionArea([[0, 0, 2, 2]]), 4);
  assert.equal(rectangleUnionArea([[0, 0, 2, 2], [1, 1, 3, 3]]), 7);
  assert.equal(rectangleUnionArea([[0, 0, 5, 5], [1, 1, 2, 2]]), 25);
  assert.equal(rectangleUnionArea([[0, 0, 1, 1], [2, 0, 3, 1]]), 2);
  assert.equal(rectangleUnionArea([[-2, -3, 1, 2], [-1, 0, 4, 3]]), 26);
  assert.equal(rectangleUnionArea([[0, 0, 0, 10], [1, 1, 2, 2]]), 1);
  assert.equal(rectangleUnionArea([[0.5, 0.5, 2.5, 2.5]]), 4);
  assert.throws(() => rectangleUnionArea([[2, 0, 1, 1]]), RangeError);
  assert.throws(() => rectangleUnionArea([[0, 0, Infinity, 1]]), TypeError);

  // Differential test on integer-coordinate rectangles using unit-cell coverage.
  let seed = 0xdecafbad;
  const random = max => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed % max; };
  for (let trial = 0; trial < 250; trial++) {
    const rectangles = [];
    const cells = new Set();
    const count = random(12);
    for (let i = 0; i < count; i++) {
      const x1 = random(9) - 4, x2 = x1 + random(5);
      const y1 = random(9) - 4, y2 = y1 + random(5);
      rectangles.push([x1, y1, x2, y2]);
      for (let x = x1; x < x2; x++) for (let y = y1; y < y2; y++) cells.add(`${x},${y}`);
    }
    assert.equal(rectangleUnionArea(rectangles), cells.size, `random trial ${trial}`);
  }
  console.log('Rectangle union sweep-line tests passed');
}

if (require.main === module) runTests();
module.exports = { rectangleUnionArea, CoveredLengthTree };
