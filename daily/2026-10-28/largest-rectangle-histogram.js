// Largest Rectangle in a Histogram
// Find the largest rectangle area in O(n) using a monotonic increasing stack.
// Run: node daily/2026-10-28/largest-rectangle-histogram.js

"use strict";

const assert = require("node:assert/strict");

function largestRectangleArea(heights) {
  if (!Array.isArray(heights)) throw new TypeError("heights must be an array");
  for (const height of heights) {
    if (!Number.isFinite(height) || height < 0) {
      throw new RangeError("heights must be finite, non-negative numbers");
    }
  }

  const stack = []; // indices with non-decreasing bar heights
  let best = 0;

  // A virtual zero-height bar flushes every remaining stack entry.
  for (let i = 0; i <= heights.length; i += 1) {
    const current = i === heights.length ? 0 : heights[i];

    while (stack.length && heights[stack[stack.length - 1]] > current) {
      const height = heights[stack.pop()];
      const leftBoundary = stack.length ? stack[stack.length - 1] : -1;
      const width = i - leftBoundary - 1;
      best = Math.max(best, height * width);
    }

    stack.push(i);
  }

  return best;
}

assert.equal(largestRectangleArea([]), 0);
assert.equal(largestRectangleArea([2, 1, 5, 6, 2, 3]), 10);
assert.equal(largestRectangleArea([2, 4]), 4);
assert.equal(largestRectangleArea([3, 3, 3]), 9);
assert.equal(largestRectangleArea([0, 0, 0]), 0);
assert.equal(largestRectangleArea([6, 5, 4, 3, 2, 1]), 12);
assert.throws(() => largestRectangleArea([-1]), RangeError);
assert.throws(() => largestRectangleArea([1, Infinity]), RangeError);

console.log("largest-rectangle-histogram: all tests passed");
module.exports = { largestRectangleArea };
