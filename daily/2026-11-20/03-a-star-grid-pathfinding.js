// Exercise: Find a shortest 4-directional path through a rectangular grid using A*.
// Cells with value 1 are blocked; 0 means traversable. Ties are deterministic.
// Run: node daily/2026-11-20/03-a-star-grid-pathfinding.js
"use strict";
const assert = require("node:assert/strict");
class MinHeap {
  constructor(compare) { this.items = []; this.compare = compare; }
  get size() { return this.items.length; }
  push(value) {
    const a = this.items; a.push(value); let i = a.length - 1;
    while (i > 0) { const p = Math.floor((i - 1) / 2); if (this.compare(a[p], value) <= 0) break; a[i] = a[p]; i = p; }
    a[i] = value;
  }
  pop() {
    const a = this.items; if (!a.length) return undefined;
    const first = a[0], last = a.pop();
    if (a.length) {
      let i = 0;
      while (true) {
        let child = i * 2 + 1; if (child >= a.length) break;
        if (child + 1 < a.length && this.compare(a[child + 1], a[child]) < 0) child++;
        if (this.compare(last, a[child]) <= 0) break;
        a[i] = a[child]; i = child;
      }
      a[i] = last;
    }
    return first;
  }
}
function aStar(grid, start, goal) {
  if (!Array.isArray(grid) || grid.length === 0 || !grid.every(row => Array.isArray(row) && row.length === grid[0].length)) {
    throw new TypeError("grid must be a non-empty rectangular matrix");
  }
  const rows = grid.length, cols = grid[0].length;
  const valid = ([r, c]) => Number.isInteger(r) && Number.isInteger(c) && r >= 0 && c >= 0 && r < rows && c < cols;
  if (!valid(start) || !valid(goal)) throw new RangeError("start and goal must be inside the grid");
  if (grid[start[0]][start[1]] || grid[goal[0]][goal[1]]) return null;
  const key = ([r, c]) => r * cols + c;
  const heuristic = ([r, c]) => Math.abs(r - goal[0]) + Math.abs(c - goal[1]);
  const startKey = key(start), goalKey = key(goal);
  const open = new MinHeap((a, b) => a.f - b.f || a.h - b.h || a.order - b.order);
  const distance = new Map([[startKey, 0]]), previous = new Map();
  let order = 0;
  open.push({ point: start, key: startKey, g: 0, h: heuristic(start), f: heuristic(start), order: order++ });
  const directions = [[-1, 0], [0, 1], [1, 0], [0, -1]];
  while (open.size) {
    const current = open.pop();
    if (current.g !== distance.get(current.key)) continue;
    if (current.key === goalKey) {
      const path = []; let cursor = goalKey;
      while (cursor !== undefined) { path.push([Math.floor(cursor / cols), cursor % cols]); cursor = previous.get(cursor); }
      return path.reverse();
    }
    for (const [dr, dc] of directions) {
      const next = [current.point[0] + dr, current.point[1] + dc];
      if (!valid(next) || grid[next[0]][next[1]]) continue;
      const nextKey = key(next), nextG = current.g + 1;
      if (nextG >= (distance.get(nextKey) ?? Infinity)) continue;
      distance.set(nextKey, nextG); previous.set(nextKey, current.key);
      const h = heuristic(next);
      open.push({ point: next, key: nextKey, g: nextG, h, f: nextG + h, order: order++ });
    }
  }
  return null;
}
const grid = [[0,0,0,0,0],[1,1,0,1,0],[0,0,0,1,0],[0,1,1,1,0],[0,0,0,0,0]];
const path = aStar(grid, [0, 0], [4, 4]);
assert.deepEqual(path[0], [0, 0]);
assert.deepEqual(path.at(-1), [4, 4]);
assert.equal(path.length - 1, 8);
for (let i = 1; i < path.length; i++) assert.equal(Math.abs(path[i][0]-path[i-1][0])+Math.abs(path[i][1]-path[i-1][1]), 1);
assert.equal(aStar([[0,1],[1,0]], [0,0], [1,1]), null);
assert.deepEqual(aStar([[0]], [0,0], [0,0]), [[0,0]]);
assert.throws(() => aStar([[0],[0,0]], [0,0], [1,1]), /rectangular/);
console.log("A* grid pathfinding: all tests passed");
