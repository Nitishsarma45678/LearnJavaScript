// Exercise: Compute the convex hull of 2D points and its diameter.
// The hull should be counter-clockwise and omit interior collinear points.
// Diameter is returned as a pair of original coordinate values.
//
// Run: node 07-convex-hull-diameter-geometry.js
const assert = require("node:assert/strict");

function cross(origin, a, b) {
  return (a[0] - origin[0]) * (b[1] - origin[1]) -
    (a[1] - origin[1]) * (b[0] - origin[0]);
}

function squaredDistance(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

function convexHull(points) {
  if (!Array.isArray(points)) throw new TypeError("points must be an array");
  const unique = new Map();
  for (const point of points) {
    if (!Array.isArray(point) || point.length !== 2 ||
        !point.every(Number.isFinite)) throw new TypeError("each point must be [x, y]");
    unique.set(point[0] + "," + point[1], [point[0], point[1]]);
  }

  const sorted = Array.from(unique.values()).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length <= 1) return sorted;

  const lower = [];
  for (const point of sorted) {
    while (lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }

  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const point = sorted[i];
    while (upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function convexDiameter(points) {
  const hull = convexHull(points);
  const n = hull.length;
  if (n === 0) return { distance: 0, squaredDistance: 0, pair: null, hull };
  if (n === 1) return { distance: 0, squaredDistance: 0, pair: [hull[0], hull[0]], hull };
  if (n === 2) {
    const squared = squaredDistance(hull[0], hull[1]);
    return { distance: Math.sqrt(squared), squaredDistance: squared, pair: hull, hull };
  }

  let best = -1;
  let pair = null;
  let opposite = 1;
  const consider = (a, b) => {
    const squared = squaredDistance(a, b);
    if (squared > best) {
      best = squared;
      pair = [a, b];
    }
  };

  for (let i = 0; i < n; i += 1) {
    const next = (i + 1) % n;
    const area = (index) => Math.abs(cross(hull[i], hull[next], hull[index]));

    while (area((opposite + 1) % n) > area(opposite)) {
      opposite = (opposite + 1) % n;
    }
    consider(hull[i], hull[opposite]);
    consider(hull[next], hull[opposite]);
    const after = (opposite + 1) % n;
    if (area(after) === area(opposite)) {
      consider(hull[i], hull[after]);
      consider(hull[next], hull[after]);
    }
  }

  return { distance: Math.sqrt(best), squaredDistance: best, pair, hull };
}

// Example tests
{
  const square = convexDiameter([[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]]);
  assert.equal(square.hull.length, 4);
  assert.equal(square.squaredDistance, 2);

  const line = convexDiameter([[0, 0], [1, 1], [2, 2], [1, 1]]);
  assert.deepEqual(line.hull, [[0, 0], [2, 2]]);
  assert.equal(line.squaredDistance, 8);

  assert.equal(convexDiameter([]).pair, null);
  assert.equal(convexDiameter([[4, 7]]).distance, 0);
  assert.throws(() => convexHull([[0, NaN]]), /point/);
}
console.log("convex hull and diameter tests passed");
