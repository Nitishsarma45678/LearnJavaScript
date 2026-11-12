'use strict';

/**
 * Closest pair of 2D points in O(n log n) time.
 * Returns original input indices and uses a deterministic tie-break.
 */
function closestPair(points) {
  if (!Array.isArray(points)) throw new TypeError('points must be an array');
  if (points.length < 2) return null;

  const records = points.map((point, index) => {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
        Math.abs(point.x) > 1e150 || Math.abs(point.y) > 1e150) {
      throw new TypeError('each point needs finite x/y coordinates within +/-1e150');
    }
    return { x: point.x, y: point.y, index };
  });
  const byX = records.slice().sort((a, b) => a.x - b.x || a.y - b.y || a.index - b.index);
  const byY = records.slice().sort((a, b) => a.y - b.y || a.x - b.x || a.index - b.index);

  for (let i = 1; i < byX.length; i++) {
    if (byX[i - 1].x === byX[i].x && byX[i - 1].y === byX[i].y) {
      const pair = [byX[i - 1], byX[i]].sort((a, b) => a.index - b.index);
      return makeResult(pair[0], pair[1], 0);
    }
  }

  function distanceSquared(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  function makeResult(a, b, squaredDistance) {
    const pair = a.index < b.index ? [a, b] : [b, a];
    return {
      indices: pair.map(point => point.index),
      points: pair.map(point => ({ x: point.x, y: point.y })),
      squaredDistance,
      distance: Math.sqrt(squaredDistance)
    };
  }

  function choose(first, second) {
    if (!first) return second;
    if (!second) return first;
    if (first.squaredDistance !== second.squaredDistance) {
      return first.squaredDistance < second.squaredDistance ? first : second;
    }
    const a = first.indices;
    const b = second.indices;
    return a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? first : second;
  }

  function bruteForce(items) {
    let best = null;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        best = choose(best, makeResult(items[i], items[j], distanceSquared(items[i], items[j])));
      }
    }
    return best;
  }

  function divide(xSorted, ySorted) {
    if (xSorted.length <= 3) return bruteForce(xSorted);
    const middle = Math.floor(xSorted.length / 2);
    const leftX = xSorted.slice(0, middle);
    const rightX = xSorted.slice(middle);
    const splitX = rightX[0].x;
    const leftIds = new Set(leftX.map(point => point.index));
    const leftY = [];
    const rightY = [];
    for (const point of ySorted) (leftIds.has(point.index) ? leftY : rightY).push(point);

    let best = choose(divide(leftX, leftY), divide(rightX, rightY));
    const strip = ySorted.filter(point => (point.x - splitX) ** 2 < best.squaredDistance);

    // In y-order, geometry guarantees at most seven relevant successors.
    for (let i = 0; i < strip.length; i++) {
      for (let j = i + 1; j < strip.length && j <= i + 7; j++) {
        const dy = strip[j].y - strip[i].y;
        if (dy * dy >= best.squaredDistance) break;
        best = choose(best, makeResult(strip[i], strip[j], distanceSquared(strip[i], strip[j])));
      }
    }
    return best;
  }

  return divide(byX, byY);
}

function runTests() {
  const assert = require('node:assert/strict');
  const example = closestPair([
    { x: 0, y: 0 }, { x: 5, y: 5 }, { x: 1, y: 1 }, { x: 2, y: 2 }
  ]);
  assert.equal(example.squaredDistance, 2);
  assert.deepEqual(example.indices, [0, 2]);
  assert.equal(closestPair([{ x: 3, y: 4 }, { x: 3, y: 4 }]).distance, 0);
  assert.equal(closestPair([{ x: 0, y: 0 }]), null);
  assert.throws(() => closestPair([{ x: Infinity, y: 0 }, { x: 0, y: 0 }]), TypeError);

  function brute(points) {
    let best = Infinity;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[i].x - points[j].x;
        const dy = points[i].y - points[j].y;
        best = Math.min(best, dx * dx + dy * dy);
      }
    }
    return best;
  }
  let seed = 0xc105e57;
  const random = max => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % max;
  };
  for (let trial = 0; trial < 350; trial++) {
    const count = 2 + random(65);
    const data = Array.from({ length: count }, () => ({
      x: random(2001) - 1000,
      y: random(2001) - 1000
    }));
    const actual = closestPair(data);
    assert.equal(actual.squaredDistance, brute(data));
    const [a, b] = actual.indices;
    assert.notEqual(a, b);
    const dx = data[a].x - data[b].x;
    const dy = data[a].y - data[b].y;
    assert.equal(dx * dx + dy * dy, actual.squaredDistance);
  }
  console.log('Closest-pair tests passed');
}

if (require.main === module) runTests();
module.exports = { closestPair };
