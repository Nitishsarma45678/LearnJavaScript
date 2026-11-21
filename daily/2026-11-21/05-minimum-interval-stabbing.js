// Exercise: Given closed intervals, choose the fewest points so every interval contains
// at least one chosen point. Return the chosen points in ascending order.

function minimumStabbingPoints(intervals) {
  if (!Array.isArray(intervals)) throw new TypeError("intervals must be an array");

  const sorted = intervals.map((interval, index) => {
    if (!Array.isArray(interval) || interval.length !== 2) {
      throw new TypeError("each interval must be [start, end]");
    }
    const [start, end] = interval;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
      throw new RangeError("interval endpoints must be finite and start <= end");
    }
    return { start, end, index };
  }).sort((a, b) => a.end - b.end || a.start - b.start);

  const points = [];
  let lastPoint = -Infinity;
  for (const interval of sorted) {
    if (lastPoint < interval.start) {
      lastPoint = interval.end;
      points.push(lastPoint);
    }
  }
  return points;
}

// Tests
const assert = require("node:assert/strict");
assert.deepEqual(
  minimumStabbingPoints([[1, 4], [2, 5], [7, 9], [8, 10], [3, 6]]),
  [4, 9]
);
assert.deepEqual(minimumStabbingPoints([[1, 1], [1, 2], [2, 2]]), [1, 2]);
assert.deepEqual(minimumStabbingPoints([]), []);
assert.deepEqual(minimumStabbingPoints([[-5, -1], [-3, 0], [2, 3]]), [-1, 3]);
assert.throws(() => minimumStabbingPoints([[4, 2]]), RangeError);
console.log("interval stabbing tests passed");
