'use strict';

// Exercise: calculate the union area of axis-aligned rectangles using an x-sweep
// and a segment tree that tracks covered y-length, not merely active segment count.

function rectangleUnionArea(rectangles) {
  const valid = rectangles.filter(([x1, y1, x2, y2]) => x1 < x2 && y1 < y2);
  if (!valid.length) return 0;
  const ys = [...new Set(valid.flatMap(([, y1, , y2]) => [y1, y2]))].sort((a, b) => a - b);
  const index = new Map(ys.map((value, i) => [value, i]));
  const events = [];
  for (const [x1, y1, x2, y2] of valid) {
    events.push({ x: x1, low: index.get(y1), high: index.get(y2), delta: 1 });
    events.push({ x: x2, low: index.get(y1), high: index.get(y2), delta: -1 });
  }
  events.sort((a, b) => a.x - b.x);

  const segments = ys.length - 1;
  const cover = Array(segments * 4 + 8).fill(0);
  const length = Array(segments * 4 + 8).fill(0);

  function update(node, left, right, ql, qr, delta) {
    if (ql >= right || qr <= left) return;
    if (ql <= left && right <= qr) cover[node] += delta;
    else {
      const mid = (left + right) >> 1;
      update(node * 2, left, mid, ql, qr, delta);
      update(node * 2 + 1, mid, right, ql, qr, delta);
    }
    if (cover[node] > 0) length[node] = ys[right] - ys[left];
    else if (right - left === 1) length[node] = 0;
    else length[node] = length[node * 2] + length[node * 2 + 1];
  }

  let area = 0;
  let previousX = events[0].x;
  let cursor = 0;
  while (cursor < events.length) {
    const x = events[cursor].x;
    area += (x - previousX) * length[1];
    while (cursor < events.length && events[cursor].x === x) {
      const event = events[cursor++];
      update(1, 0, segments, event.low, event.high, event.delta);
    }
    previousX = x;
  }
  return area;
}

const assert = require('node:assert/strict');
assert.equal(rectangleUnionArea([[0, 0, 2, 2]]), 4);
assert.equal(rectangleUnionArea([[0, 0, 2, 2], [1, 1, 3, 3]]), 7);
assert.equal(rectangleUnionArea([[0, 0, 4, 1], [1, -1, 2, 2]]), 6);
assert.equal(rectangleUnionArea([[0, 0, 1, 1], [1, 0, 2, 1]]), 2);
assert.equal(rectangleUnionArea([]), 0);
console.log('Rectangle union area tests passed');

module.exports = { rectangleUnionArea };
