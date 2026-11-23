// Exercise: Find the closest pair of points in O(n log n) time.
// Use divide-and-conquer with x-sorted and y-sorted views; do not sort each
// recursive strip from scratch.
//
// Run: node 08-closest-pair-divide-conquer.js
const assert = require("node:assert/strict");

function closestPair(points) {
  if (!Array.isArray(points)) throw new TypeError("points must be an array");
  const normalized = points.map((point, index) => {
    if (!Array.isArray(point) || point.length !== 2 ||
        !point.every(Number.isFinite)) throw new TypeError("point must be [x, y]");
    return { x: point[0], y: point[1], index };
  });
  if (normalized.length < 2) return null;

  const byX = normalized.slice().sort((a, b) =>
    a.x - b.x || a.y - b.y || a.index - b.index
  );
  const byY = normalized.slice().sort((a, b) =>
    a.y - b.y || a.x - b.x || a.index - b.index
  );

  function squared(a, b) {
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  }

  function solve(xPoints, yPoints) {
    const n = xPoints.length;
    if (n <= 3) {
      let best = { distanceSquared: Infinity, a: null, b: null };
      for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
          const candidate = squared(xPoints[i], xPoints[j]);
          if (candidate < best.distanceSquared) {
            best = { distanceSquared: candidate, a: xPoints[i], b: xPoints[j] };
          }
        }
      }
      return best;
    }

    const middle = Math.floor(n / 2);
    const leftX = xPoints.slice(0, middle);
    const rightX = xPoints.slice(middle);
    const divider = rightX[0].x;
    const leftIds = new Set(leftX.map((point) => point.index));
    const leftY = [];
    const rightY = [];
    for (const point of yPoints) {
      (leftIds.has(point.index) ? leftY : rightY).push(point);
    }

    const leftBest = solve(leftX, leftY);
    const rightBest = solve(rightX, rightY);
    let best = leftBest.distanceSquared <= rightBest.distanceSquared ? leftBest : rightBest;
    const strip = yPoints.filter((point) =>
      (point.x - divider) ** 2 < best.distanceSquared
    );

    for (let i = 0; i < strip.length; i += 1) {
      for (let j = i + 1; j < strip.length &&
        (strip[j].y - strip[i].y) ** 2 < best.distanceSquared; j += 1) {
        const candidate = squared(strip[i], strip[j]);
        if (candidate < best.distanceSquared) {
          best = { distanceSquared: candidate, a: strip[i], b: strip[j] };
        }
      }
    }
    return best;
  }

  const best = solve(byX, byY);
  return {
    distance: Math.sqrt(best.distanceSquared),
    distanceSquared: best.distanceSquared,
    pair: [best.a, best.b].map((point) => [point.x, point.y]),
    originalIndices: [best.a.index, best.b.index]
  };
}

// Example tests
{
  const result = closestPair([[0, 0], [5, 5], [1, 1], [2, 2], [10, 0]]);
  assert.equal(result.distanceSquared, 2);
  assert.deepEqual(result.pair, [[0, 0], [1, 1]]);

  const duplicate = closestPair([[3, 4], [3, 4], [9, 9]]);
  assert.equal(duplicate.distance, 0);
  assert.deepEqual(duplicate.pair, [[3, 4], [3, 4]]);

  assert.equal(closestPair([[1, 2]]), null);
  assert.equal(closestPair([]), null);
  assert.throws(() => closestPair([[0, Infinity], [1, 1]]), /point/);
}
console.log("closest-pair tests passed");
