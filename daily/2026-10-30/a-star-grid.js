'use strict';

/**
 * A* pathfinding on a rectangular 0/1 grid (0 = walkable, 1 = blocked).
 * Supports four-way or eight-way movement, octile heuristics, and optional
 * corner cutting. A binary min-heap and stale-entry checks keep the search
 * efficient; deterministic tie-breaking makes examples reproducible.
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
    const root = a[0];
    const last = a.pop();
    if (a.length) {
      let i = 0;
      while (true) {
        let child = i * 2 + 1;
        if (child >= a.length) break;
        if (child + 1 < a.length && this.compare(a[child + 1], a[child]) < 0) child += 1;
        if (this.compare(last, a[child]) <= 0) break;
        a[i] = a[child]; i = child;
      }
      a[i] = last;
    }
    return root;
  }
}

function aStarGrid(grid, start, goal, { diagonal = false, allowCornerCutting = false } = {}) {
  if (!Array.isArray(grid) || grid.length === 0 || !Array.isArray(grid[0]) || grid[0].length === 0) {
    throw new TypeError('grid must be a non-empty rectangular array');
  }
  const rows = grid.length;
  const cols = grid[0].length;
  if (grid.some(row => !Array.isArray(row) || row.length !== cols || row.some(cell => cell !== 0 && cell !== 1))) {
    throw new TypeError('grid must be rectangular and contain only 0 (open) or 1 (blocked)');
  }
  const validPoint = point => point && Number.isInteger(point.row) && Number.isInteger(point.col) &&
    point.row >= 0 && point.row < rows && point.col >= 0 && point.col < cols;
  if (!validPoint(start) || !validPoint(goal)) throw new RangeError('start and goal must be inside the grid');
  const key = (r, c) => `${r},${c}`;
  if (grid[start.row][start.col] || grid[goal.row][goal.col]) return null;

  const heuristic = (r, c) => {
    const dx = Math.abs(goal.col - c);
    const dy = Math.abs(goal.row - r);
    if (!diagonal) return dx + dy;
    const diagonalSteps = Math.min(dx, dy);
    return (dx + dy - 2 * diagonalSteps) + Math.SQRT2 * diagonalSteps;
  };
  const moves = diagonal
    ? [[-1, 0, 1], [0, 1, 1], [1, 0, 1], [0, -1, 1],
       [-1, 1, Math.SQRT2], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, -1, Math.SQRT2]]
    : [[-1, 0, 1], [0, 1, 1], [1, 0, 1], [0, -1, 1]];

  let sequence = 0;
  const open = new MinHeap((a, b) => a.f - b.f || a.h - b.h || a.sequence - b.sequence);
  const startKey = key(start.row, start.col);
  const goalKey = key(goal.row, goal.col);
  const gScore = new Map([[startKey, 0]]);
  const cameFrom = new Map();
  const closed = new Set();
  const h0 = heuristic(start.row, start.col);
  open.push({ row: start.row, col: start.col, g: 0, h: h0, f: h0, sequence: sequence++ });
  let expanded = 0;

  while (open.size) {
    const current = open.pop();
    const currentKey = key(current.row, current.col);
    if (current.g !== gScore.get(currentKey) || closed.has(currentKey)) continue;
    expanded += 1;
    if (currentKey === goalKey) {
      const path = [];
      let cursor = goalKey;
      while (cursor !== undefined) {
        const [row, col] = cursor.split(',').map(Number);
        path.push({ row, col });
        cursor = cameFrom.get(cursor);
      }
      path.reverse();
      return { path, cost: current.g, expanded };
    }
    closed.add(currentKey);

    for (const [dr, dc, stepCost] of moves) {
      const nr = current.row + dr;
      const nc = current.col + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || grid[nr][nc] === 1) continue;
      if (diagonal && dr !== 0 && dc !== 0 && !allowCornerCutting &&
          (grid[current.row + dr][current.col] === 1 || grid[current.row][current.col + dc] === 1)) continue;
      const neighborKey = key(nr, nc);
      if (closed.has(neighborKey)) continue;
      const tentative = current.g + stepCost;
      if (tentative >= (gScore.get(neighborKey) ?? Infinity)) continue;
      cameFrom.set(neighborKey, currentKey);
      gScore.set(neighborKey, tentative);
      const h = heuristic(nr, nc);
      open.push({ row: nr, col: nc, g: tentative, h, f: tentative + h, sequence: sequence++ });
    }
  }
  return null;
}

// ------------------------------- Tests ----------------------------------
if (require.main === module) {
  const assert = require('node:assert/strict');
  const openGrid = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  const fourWay = aStarGrid(openGrid, { row: 0, col: 0 }, { row: 3, col: 3 });
  assert.equal(fourWay.cost, 6);
  assert.deepEqual(fourWay.path[0], { row: 0, col: 0 });
  assert.deepEqual(fourWay.path.at(-1), { row: 3, col: 3 });

  const eightWay = aStarGrid(openGrid, { row: 0, col: 0 }, { row: 3, col: 3 }, { diagonal: true });
  assert.ok(Math.abs(eightWay.cost - 3 * Math.SQRT2) < 1e-10);
  const blockedCorner = [[0, 1], [1, 0]];
  assert.equal(aStarGrid(blockedCorner, { row: 0, col: 0 }, { row: 1, col: 1 }, { diagonal: true }), null);
  assert.ok(aStarGrid(blockedCorner, { row: 0, col: 0 }, { row: 1, col: 1 },
    { diagonal: true, allowCornerCutting: true }));
  assert.equal(aStarGrid([[0, 1, 0]], { row: 0, col: 0 }, { row: 0, col: 2 }), null);
  assert.throws(() => aStarGrid([[0], [0, 1]], { row: 0, col: 0 }, { row: 1, col: 0 }), /rectangular/);
  console.log('A* grid pathfinding tests passed');
}

module.exports = { aStarGrid };
