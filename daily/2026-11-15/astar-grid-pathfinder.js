'use strict';

/**
 * A* pathfinding on a rectangular weighted grid.
 *
 * A cell is either a non-negative traversal cost or null (blocked). The cost
 * of the starting cell is excluded; entering a neighbor pays that cell's cost.
 * Diagonal moves cost sqrt(2) times the destination cost. The heuristic is
 * scaled by the cheapest traversable cell, so it remains admissible even when
 * the grid contains different weights (and becomes Dijkstra when min cost is 0).
 */

const assert = require('node:assert/strict');

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
      a[i] = a[p];
      i = p;
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
        let child = i * 2 + 1;
        if (child >= a.length) break;
        if (child + 1 < a.length && this.compare(a[child + 1], a[child]) < 0) child++;
        if (this.compare(last, a[child]) <= 0) break;
        a[i] = a[child];
        i = child;
      }
      a[i] = last;
    }
    return first;
  }
}

function validateGrid(grid) {
  if (!Array.isArray(grid) || grid.length === 0 || !Array.isArray(grid[0]) || grid[0].length === 0) {
    throw new TypeError('Grid must be a non-empty rectangular matrix');
  }
  const cols = grid[0].length;
  let minCost = Infinity;
  for (const row of grid) {
    if (!Array.isArray(row) || row.length !== cols) throw new TypeError('Grid must be rectangular');
    for (const cost of row) {
      if (cost === null) continue;
      if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) {
        throw new TypeError('Cell costs must be non-negative finite numbers or null');
      }
      minCost = Math.min(minCost, cost);
    }
  }
  return { rows: grid.length, cols, minCost };
}

function coordinate(value, rows, cols, label) {
  if (!Array.isArray(value) || value.length !== 2 ||
      !Number.isInteger(value[0]) || !Number.isInteger(value[1]) ||
      value[0] < 0 || value[0] >= rows || value[1] < 0 || value[1] >= cols) {
    throw new RangeError(`${label} must be a valid [row, column] coordinate`);
  }
  return value;
}

function heuristic(r, c, goal, minCost, diagonal) {
  const dr = Math.abs(goal[0] - r);
  const dc = Math.abs(goal[1] - c);
  if (!diagonal) return (dr + dc) * minCost;
  const small = Math.min(dr, dc);
  const large = Math.max(dr, dc);
  return (large - small + small * Math.SQRT2) * minCost;
}

function findPath(grid, start, goal, options = {}) {
  const { rows, cols, minCost } = validateGrid(grid);
  coordinate(start, rows, cols, 'start');
  coordinate(goal, rows, cols, 'goal');
  const diagonal = options.diagonal === true;
  const cornerCutting = options.cornerCutting === true;
  const [sr, sc] = start;
  const [gr, gc] = goal;
  if (grid[sr][sc] === null || grid[gr][gc] === null) {
    return { path: [], cost: Infinity, expanded: 0 };
  }
  if (sr === gr && sc === gc) return { path: [[sr, sc]], cost: 0, expanded: 0 };

  const offsets = diagonal
    ? [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]
    : [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const best = Array.from({ length: rows }, () => Array(cols).fill(Infinity));
  const parent = Array.from({ length: rows }, () => Array(cols).fill(null));
  let sequence = 0;
  const open = new MinHeap((a, b) => a.f - b.f || a.h - b.h || a.sequence - b.sequence);
  best[sr][sc] = 0;
  const firstH = heuristic(sr, sc, goal, minCost, diagonal);
  open.push({ r: sr, c: sc, g: 0, h: firstH, f: firstH, sequence: sequence++ });
  let expanded = 0;

  while (open.size) {
    const current = open.pop();
    if (current.g !== best[current.r][current.c]) continue; // stale heap entry
    expanded++;
    if (current.r === gr && current.c === gc) {
      const path = [];
      let cursor = [gr, gc];
      while (cursor) {
        path.push(cursor);
        cursor = parent[cursor[0]][cursor[1]];
      }
      path.reverse();
      return { path, cost: current.g, expanded };
    }

    for (const [dr, dc] of offsets) {
      const nr = current.r + dr;
      const nc = current.c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || grid[nr][nc] === null) continue;
      const isDiagonal = dr !== 0 && dc !== 0;
      if (isDiagonal && !cornerCutting) {
        if (grid[current.r + dr][current.c] === null || grid[current.r][current.c + dc] === null) continue;
      }
      const step = grid[nr][nc] * (isDiagonal ? Math.SQRT2 : 1);
      const candidate = current.g + step;
      if (candidate + Number.EPSILON >= best[nr][nc]) continue;
      best[nr][nc] = candidate;
      parent[nr][nc] = [current.r, current.c];
      const h = heuristic(nr, nc, goal, minCost, diagonal);
      open.push({ r: nr, c: nc, g: candidate, h, f: candidate + h, sequence: sequence++ });
    }
  }
  return { path: [], cost: Infinity, expanded };
}

function dijkstraReference(grid, start, goal, diagonal = false, cornerCutting = false) {
  const rows = grid.length;
  const cols = grid[0].length;
  const dist = Array.from({ length: rows }, () => Array(cols).fill(Infinity));
  const used = Array.from({ length: rows }, () => Array(cols).fill(false));
  dist[start[0]][start[1]] = 0;
  const offsets = diagonal
    ? [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]
    : [[-1, 0], [1, 0], [0, -1], [0, 1]];
  while (true) {
    let best = Infinity;
    let point = null;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (!used[r][c] && dist[r][c] < best) { best = dist[r][c]; point = [r, c]; }
    }
    if (!point || (point[0] === goal[0] && point[1] === goal[1])) return best;
    const [r, c] = point;
    used[r][c] = true;
    for (const [dr, dc] of offsets) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || grid[nr][nc] === null) continue;
      const diag = dr !== 0 && dc !== 0;
      if (diag && !cornerCutting && (grid[r + dr][c] === null || grid[r][c + dc] === null)) continue;
      const candidate = best + grid[nr][nc] * (diag ? Math.SQRT2 : 1);
      if (candidate < dist[nr][nc]) dist[nr][nc] = candidate;
    }
  }
}

function runTests() {
  const basic = findPath([[1, 1, 1], [1, null, 1], [1, 1, 1]], [0, 0], [2, 2]);
  assert.equal(basic.cost, 4);
  assert.deepEqual(basic.path[0], [0, 0]);
  assert.deepEqual(basic.path.at(-1), [2, 2]);

  const weighted = findPath([[1, 50, 1], [1, 1, 1]], [0, 0], [0, 2]);
  assert.equal(weighted.cost, 4, 'path should avoid an expensive cell');
  assert.deepEqual(findPath([[1, null], [null, 1]], [0, 0], [1, 1], { diagonal: true }).path, []);
  assert.ok(findPath([[1, null], [null, 1]], [0, 0], [1, 1], { diagonal: true, cornerCutting: true }).cost > 0);
  assert.deepEqual(findPath([[1, 1]], [0, 0], [0, 0]).path, [[0, 0]]);
  assert.equal(findPath([[1, null]], [0, 0], [0, 1]).cost, Infinity);
  assert.throws(() => findPath([[1], [1, 2]], [0, 0], [1, 0]), /rectangular/);

  let seed = 0x12345678;
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 0x100000000);
  for (let trial = 0; trial < 60; trial++) {
    const rows = 4 + Math.floor(random() * 4);
    const cols = 4 + Math.floor(random() * 4);
    const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () =>
      random() < 0.18 ? null : Math.floor(random() * 8) + 1));
    grid[0][0] = 1;
    grid[rows - 1][cols - 1] = 1;
    const diagonal = random() < 0.5;
    const cornerCutting = random() < 0.5;
    const actual = findPath(grid, [0, 0], [rows - 1, cols - 1], { diagonal, cornerCutting }).cost;
    const expected = dijkstraReference(grid, [0, 0], [rows - 1, cols - 1], diagonal, cornerCutting);
    assert.ok((actual === Infinity && expected === Infinity) || Math.abs(actual - expected) < 1e-9,
      `trial ${trial}: A* ${actual}, Dijkstra ${expected}`);
  }
  console.log('A* Grid Pathfinder: all tests passed');
}

if (require.main === module) runTests();
module.exports = { findPath, MinHeap, runTests };
