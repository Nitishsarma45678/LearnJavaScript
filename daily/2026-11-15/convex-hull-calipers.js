/**
 * Convex Hull and Rotating-Calipers Diameter
 * -----------------------------------------
 * Build a monotone-chain convex hull, then find the farthest pair of input
 * points with rotating calipers. Duplicate coordinates are removed, points
 * may be [x, y] tuples or { x, y } objects, and coordinates must be finite.
 *
 * Hull construction: O(n log n). Diameter after the hull: O(h), where h is
 * the number of hull vertices.
 */

'use strict';

function normalizePoints(input) {
  if (!Array.isArray(input)) throw new TypeError('points must be an array');
  const unique = new Map();
  for (const point of input) {
    let x;
    let y;
    if (Array.isArray(point) && point.length >= 2) {
      [x, y] = point;
    } else if (point && typeof point === 'object') {
      ({ x, y } = point);
    } else {
      throw new TypeError('each point must be [x, y] or { x, y }');
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new TypeError('point coordinates must be finite numbers');
    }
    if (Object.is(x, -0)) x = 0;
    if (Object.is(y, -0)) y = 0;
    unique.set(x + ',' + y, { x, y });
  }
  return Array.from(unique.values()).sort((a, b) => a.x - b.x || a.y - b.y);
}

function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function convexHull(input, options = {}) {
  const { includeCollinear = false } = options;
  if (typeof includeCollinear !== 'boolean') {
    throw new TypeError('includeCollinear must be a boolean');
  }

  const points = normalizePoints(input);
  if (points.length <= 1) return points;

  let allCollinear = true;
  for (let i = 2; i < points.length; i += 1) {
    if (cross(points[0], points[1], points[i]) !== 0) {
      allCollinear = false;
      break;
    }
  }
  if (allCollinear) return includeCollinear ? points : [points[0], points[points.length - 1]];

  const shouldRemove = value => includeCollinear ? value < 0 : value <= 0;
  const lower = [];
  for (const point of points) {
    while (
      lower.length >= 2 &&
      shouldRemove(cross(lower[lower.length - 2], lower[lower.length - 1], point))
    ) lower.pop();
    lower.push(point);
  }

  const upper = [];
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const point = points[i];
    while (
      upper.length >= 2 &&
      shouldRemove(cross(upper[upper.length - 2], upper[upper.length - 1], point))
    ) upper.pop();
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function squaredDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function farthestPair(input) {
  const hull = convexHull(input);
  if (hull.length === 0) return { distance: 0, distanceSquared: 0, pair: [] };
  if (hull.length === 1) {
    return {
      distance: 0,
      distanceSquared: 0,
      pair: [{ ...hull[0] }, { ...hull[0] }]
    };
  }
  if (hull.length === 2) {
    const d2 = squaredDistance(hull[0], hull[1]);
    return { distance: Math.sqrt(d2), distanceSquared: d2, pair: hull.map(p => ({ ...p })) };
  }

  let bestSquared = -1;
  let bestPair = null;
  const comparePoint = (a, b) => a.x - b.x || a.y - b.y;

  const consider = (a, b) => {
    const d2 = squaredDistance(a, b);
    const pair = comparePoint(a, b) <= 0 ? [a, b] : [b, a];
    const isEarlier = bestPair && (
      comparePoint(pair[0], bestPair[0]) < 0 ||
      (comparePoint(pair[0], bestPair[0]) === 0 &&
        comparePoint(pair[1], bestPair[1]) < 0)
    );
    if (d2 > bestSquared || (d2 === bestSquared && isEarlier)) {
      bestSquared = d2;
      bestPair = pair;
    }
  };

  const n = hull.length;
  let antipode = 1;
  for (let i = 0; i < n; i += 1) {
    const next = (i + 1) % n;
    let currentArea = cross(hull[i], hull[next], hull[antipode]);
    let steps = 0;

    while (steps < n) {
      const candidate = (antipode + 1) % n;
      const candidateArea = cross(hull[i], hull[next], hull[candidate]);
      if (candidateArea <= currentArea) break;
      antipode = candidate;
      currentArea = candidateArea;
      steps += 1;
    }

    consider(hull[i], hull[antipode]);
    consider(hull[next], hull[antipode]);

    const tied = (antipode + 1) % n;
    if (cross(hull[i], hull[next], hull[tied]) === currentArea) {
      consider(hull[i], hull[tied]);
      consider(hull[next], hull[tied]);
    }
  }

  return {
    distance: Math.sqrt(bestSquared),
    distanceSquared: bestSquared,
    pair: bestPair.map(point => ({ ...point }))
  };
}

function runTests() {
  const assert = require('node:assert/strict');

  const square = convexHull([
    [0, 0], [2, 0], [2, 2], [0, 2], [1, 1], [0, 0]
  ]);
  assert.deepEqual(square, [
    { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }
  ]);
  const squareDiameter = farthestPair(square);
  assert.equal(squareDiameter.distanceSquared, 8);

  const line = convexHull([[0, 0], [2, 2], [5, 5], [10, 10]]);
  assert.deepEqual(line, [{ x: 0, y: 0 }, { x: 10, y: 10 }]);
  assert.equal(farthestPair([[0, 0], [2, 2], [10, 10]]).distanceSquared, 200);

  const boundary = convexHull([
    [0, 0], [1, 0], [2, 0], [2, 2], [1, 1], [0, 2], [0, 1]
  ], { includeCollinear: true });
  assert.equal(boundary.length, 6);
  assert.equal(convexHull([]).length, 0);
  assert.equal(farthestPair([]).distance, 0);
  assert.throws(() => convexHull([[0, Infinity]]), /finite/);
  assert.throws(() => convexHull([[0, 0]], { includeCollinear: 1 }), /boolean/);

  // Deterministic differential test against an O(n^2) diameter reference.
  let seed = 0x12345678;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let trial = 0; trial < 180; trial += 1) {
    const points = Array.from({ length: 3 + Math.floor(random() * 18) }, () => [
      Math.floor(random() * 31) - 15,
      Math.floor(random() * 31) - 15
    ]);
    let expected = 0;
    const unique = normalizePoints(points);
    for (let i = 0; i < unique.length; i += 1) {
      for (let j = i + 1; j < unique.length; j += 1) {
        expected = Math.max(expected, squaredDistance(unique[i], unique[j]));
      }
    }
    assert.equal(farthestPair(points).distanceSquared, expected);
  }

  console.log('convex-hull-calipers: all tests passed');
}

if (require.main === module) runTests();

module.exports = { convexHull, farthestPair };
