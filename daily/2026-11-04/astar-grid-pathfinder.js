'use strict';

/**
 * Exercise: implement A* for a rectangular 0/1 grid.
 * 0 is walkable, 1 is blocked. Diagonal moves may be enabled, but may not
 * cut through the corner of two blocked cells. Returns an optimal path.
 */

class MinHeap {
  constructor(compare) { this.items = []; this.compare = compare; }
  get size() { return this.items.length; }
  push(value) {
    const a = this.items;
    a.push(value);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.compare(a[p], value) <= 0) break;
      a[i] = a[p]; i = p;
    }
    a[i] = value;
  }
  pop() {
    const a = this.items;
    if (!a.length) return undefined;
    const first = a[0];
    const last = a.pop();
    if (a.length) {
      let i = 0;
      while (true) {
        const left = i * 2 + 1;
        if (left >= a.length) break;
        const right = left + 1;
        const child = right < a.length && this.compare(a[right], a[left]) < 0 ? right : left;
        if (this.compare(a[child], last) >= 0) break;
        a[i] = a[child]; i = child;
      }
      a[i] = last;
    }
    return first;
  }
}

function findPath(grid, start, goal, { diagonal = false } = {}) {
  if (!Array.isArray(grid) || grid.length === 0 || !Array.isArray(grid[0]) || grid[0].length === 0) {
    throw new TypeError('grid must be a non-empty rectangular matrix');
  }
  const rows = grid.length;
  const cols = grid[0].length;
  if (grid.some(row => !Array.isArray(row) || row.length !== cols || row.some(cell => cell !== 0 && cell !== 1))) {
    throw new TypeError('grid must be rectangular and contain only 0 (open) or 1 (blocked)');
  }
  const validPoint = point => Array.isArray(point) && point.length === 2 &&
    point.every(Number.isInteger) && point[0] >= 0 && point[0] < rows && point[1] >= 0 && point[1] < cols;
  if (!validPoint(start) || !validPoint(goal)) throw new RangeError('start and goal must be in-bounds [row, column] pairs');
  const [sr, sc] = start;
  const [gr, gc] = goal;
  if (grid[sr][sc] === 1 || grid[gr][gc] === 1) return null;

  const directions = diagonal
    ? [[-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
       [-1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [1, 1, Math.SQRT2]]
    : [[-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1]];
  const key = (r, c) => `${r},${c}`;
  const heuristic = (r, c) => {
    const dx = Math.abs(gr - r), dy = Math.abs(gc - c);
    return diagonal ? Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy) : dx + dy;
  };
  const startKey = key(sr, sc);
  const goalKey = key(gr, gc);
  const gScore = new Map([[startKey, 0]]);
  const cameFrom = new Map();
  let sequence = 0;
  const open = new MinHeap((a, b) => a.f - b.f || a.h - b.h || a.sequence - b.sequence);
  open.push({ r: sr, c: sc, g: 0, h: heuristic(sr, sc), f: heuristic(sr, sc), sequence: sequence++ });
  let expanded = 0;

  while (open.size) {
    const current = open.pop();
    const currentKey = key(current.r, current.c);
    // Duplicate heap entries are allowed; discard entries superseded by a better route.
    if (current.g !== gScore.get(currentKey)) continue;
    expanded++;
    if (currentKey === goalKey) {
      const path = [[gr, gc]];
      let cursor = goalKey;
      while (cursor !== startKey) {
        cursor = cameFrom.get(cursor);
        if (cursor === undefined) throw new Error('Broken predecessor chain');
        const [r, c] = cursor.split(',').map(Number);
        path.push([r, c]);
      }
      path.reverse();
      return { path, cost: current.g, expanded };
    }

    for (const [dr, dc, moveCost] of directions) {
      const nr = current.r + dr, nc = current.c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || grid[nr][nc] === 1) continue;
      if (diagonal && dr !== 0 && dc !== 0) {
        // Prevent diagonal corner cutting through either blocked orthogonal neighbor.
        if (grid[current.r + dr][current.c] === 1 || grid[current.r][current.c + dc] === 1) continue;
      }
      const nextKey = key(nr, nc);
      const tentative = current.g + moveCost;
      if (tentative >= (gScore.get(nextKey) ?? Infinity)) continue;
      cameFrom.set(nextKey, currentKey);
      gScore.set(nextKey, tentative);
      const h = heuristic(nr, nc);
      open.push({ r: nr, c: nc, g: tentative, h, f: tentative + h, sequence: sequence++ });
    }
  }
  return null;
}

module.exports = { MinHeap, findPath };

if (require.main === module) {
  const assert = require('node:assert/strict');
  const grid = [[0, 0, 0], [1, 1, 0], [0, 0, 0]];
  const result = findPath(grid, [0, 0], [2, 2]);
  assert.equal(result.cost, 4);
  assert.deepEqual(result.path[0], [0, 0]);
  assert.deepEqual(result.path.at(-1), [2, 2]);
  assert.equal(findPath([[0, 1], [1, 0]], [0, 0], [1, 1], { diagonal: true }), null);
  assert.equal(findPath([[0, 0], [0, 0]], [0, 0], [1, 1], { diagonal: true }).cost, Math.SQRT2);
  assert.equal(findPath([[0, 1], [0, 0]], [0, 0], [0, 1]), null);
  assert.deepEqual(findPath([[0]], [0, 0], [0, 0]).path, [[0, 0]]);
  assert.throws(() => findPath([[0], [0, 1]], [0, 0], [1, 0]), TypeError);
  assert.throws(() => findPath([[0]], [-1, 0], [0, 0]), RangeError);
  console.log('A* grid pathfinder: all tests passed');
}
