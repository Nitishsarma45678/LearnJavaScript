'use strict';

/**
 * Exercise: implement A* for weighted rectangular grids.
 *
 * Requirements:
 * - Orthogonal or diagonal movement, with optional corner-cutting prevention.
 * - Positive terrain-entry costs and impassable cells.
 * - An admissible Manhattan/octile heuristic scaled by the minimum terrain cost.
 * - A binary heap, stale-entry handling, and path reconstruction.
 *
 * Grid cells are positive numbers, '#' or null. Run: node 14-a-star-grid-pathfinder.js
 */

const assert = require('node:assert/strict');

class MinHeap {
  constructor(compare) {
    this.items = [];
    this.compare = compare;
  }

  get size() { return this.items.length; }

  push(value) {
    const items = this.items;
    items.push(value);
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.compare(items[parent], value) <= 0) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = value;
  }

  pop() {
    if (this.items.length === 0) return undefined;
    const root = this.items[0];
    const last = this.items.pop();
    if (this.items.length === 0) return root;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.items.length) break;
      let child = left;
      if (right < this.items.length && this.compare(this.items[right], this.items[left]) < 0) child = right;
      if (this.compare(last, this.items[child]) <= 0) break;
      this.items[index] = this.items[child];
      index = child;
    }
    this.items[index] = last;
    return root;
  }
}

function findPath(grid, start, goal, options = {}) {
  if (!Array.isArray(grid) || grid.length === 0 || !Array.isArray(grid[0]) || grid[0].length === 0) {
    throw new TypeError('grid must be a non-empty rectangular matrix');
  }
  const rows = grid.length;
  const columns = grid[0].length;
  if (grid.some(row => !Array.isArray(row) || row.length !== columns)) {
    throw new TypeError('grid must be rectangular');
  }
  const diagonal = Boolean(options.diagonal);
  const allowCornerCutting = Boolean(options.allowCornerCutting);
  const isWalkable = (row, column) => {
    if (row < 0 || row >= rows || column < 0 || column >= columns) return false;
    const cell = grid[row][column];
    return typeof cell === 'number' && Number.isFinite(cell) && cell > 0;
  };
  const validatePoint = (point, name) => {
    if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isInteger)) {
      throw new TypeError(`${name} must be [row, column]`);
    }
    if (!isWalkable(point[0], point[1])) throw new RangeError(`${name} is outside the grid or blocked`);
  };
  validatePoint(start, 'start');
  validatePoint(goal, 'goal');

  let minimumCost = Infinity;
  for (const row of grid) for (const cell of row) {
    if (typeof cell === 'number' && Number.isFinite(cell) && cell > 0) minimumCost = Math.min(minimumCost, cell);
  }

  const idOf = (row, column) => row * columns + column;
  const pointOf = id => [Math.floor(id / columns), id % columns];
  const startId = idOf(...start);
  const goalId = idOf(...goal);
  if (startId === goalId) return { path: [start.slice()], cost: 0, expanded: 0 };

  const heuristic = (row, column) => {
    const dx = Math.abs(goal[1] - column);
    const dy = Math.abs(goal[0] - row);
    if (!diagonal) return (dx + dy) * minimumCost;
    const smaller = Math.min(dx, dy);
    const larger = Math.max(dx, dy);
    return (larger + (Math.SQRT2 - 1) * smaller) * minimumCost;
  };

  const directions = diagonal
    ? [[-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1], [-1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [1, 1, Math.SQRT2]]
    : [[-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1]];

  const total = rows * columns;
  const best = new Float64Array(total);
  best.fill(Infinity);
  const previous = new Int32Array(total);
  previous.fill(-1);
  const closed = new Uint8Array(total);
  let sequence = 0;
  const open = new MinHeap((a, b) => a.f - b.f || a.h - b.h || a.sequence - b.sequence);
  best[startId] = 0;
  const startH = heuristic(...start);
  open.push({ id: startId, g: 0, h: startH, f: startH, sequence: sequence++ });
  let expanded = 0;

  while (open.size) {
    const current = open.pop();
    if (current.g !== best[current.id] || closed[current.id]) continue;
    if (current.id === goalId) {
      const ids = [];
      for (let cursor = goalId; cursor !== -1; cursor = previous[cursor]) ids.push(cursor);
      ids.reverse();
      return { path: ids.map(pointOf), cost: current.g, expanded };
    }

    closed[current.id] = 1;
    expanded += 1;
    const [row, column] = pointOf(current.id);
    for (const [dr, dc, distance] of directions) {
      const nextRow = row + dr;
      const nextColumn = column + dc;
      if (!isWalkable(nextRow, nextColumn)) continue;
      if (dr !== 0 && dc !== 0 && !allowCornerCutting) {
        if (!isWalkable(row + dr, column) || !isWalkable(row, column + dc)) continue;
      }
      const nextId = idOf(nextRow, nextColumn);
      if (closed[nextId]) continue;
      const tentative = current.g + distance * grid[nextRow][nextColumn];
      if (tentative >= best[nextId]) continue;
      best[nextId] = tentative;
      previous[nextId] = current.id;
      const h = heuristic(nextRow, nextColumn);
      open.push({ id: nextId, g: tentative, h, f: tentative + h, sequence: sequence++ });
    }
  }

  return { path: null, cost: Infinity, expanded };
}

function dijkstraReference(grid, start, goal, diagonal = false, allowCornerCutting = false) {
  const rows = grid.length;
  const columns = grid[0].length;
  const dist = new Map([[`${start[0]},${start[1]}`, 0]]);
  const visited = new Set();
  const dirs = diagonal
    ? [[-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1], [-1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [1, 1, Math.SQRT2]]
    : [[-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1]];
  while (true) {
    let current = null;
    let currentDistance = Infinity;
    for (const [key, value] of dist) {
      if (!visited.has(key) && value < currentDistance) { current = key; currentDistance = value; }
    }
    if (current === null) return Infinity;
    const [row, column] = current.split(',').map(Number);
    if (row === goal[0] && column === goal[1]) return currentDistance;
    visited.add(current);
    for (const [dr, dc, multiplier] of dirs) {
      const nr = row + dr;
      const nc = column + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= columns) continue;
      if (!(typeof grid[nr][nc] === 'number' && grid[nr][nc] > 0)) continue;
      if (dr && dc && !allowCornerCutting &&
          (!(typeof grid[row + dr][column] === 'number' && grid[row + dr][column] > 0) ||
           !(typeof grid[row][column + dc] === 'number' && grid[row][column + dc] > 0))) continue;
      const key = `${nr},${nc}`;
      const candidate = currentDistance + multiplier * grid[nr][nc];
      if (candidate < (dist.get(key) ?? Infinity)) dist.set(key, candidate);
    }
  }
}

function runTests() {
  const grid = [
    [1, 1, 1, 1],
    [1, '#', 5, 1],
    [1, 1, 1, 1]
  ];
  const result = findPath(grid, [0, 0], [2, 3]);
  assert.equal(result.cost, 5);
  assert.deepEqual(result.path[0], [0, 0]);
  assert.deepEqual(result.path.at(-1), [2, 3]);
  for (const [row, column] of result.path) assert.notEqual(grid[row][column], '#');

  assert.deepEqual(findPath([[1]], [0, 0], [0, 0]), { path: [[0, 0]], cost: 0, expanded: 0 });
  assert.equal(findPath([[1, '#'], ['#', 1]], [0, 0], [1, 1], { diagonal: true }).path, null);
  assert.equal(findPath([[1, '#'], ['#', 1]], [0, 0], [1, 1], { diagonal: true, allowCornerCutting: true }).cost, Math.SQRT2);
  assert.equal(findPath([[1, 1, 1]], [0, 0], [0, 2]).cost, 2);
  assert.throws(() => findPath([[1], [1, 2]], [0, 0], [1, 0]), /rectangular/);
  assert.throws(() => findPath([[1, '#']], [0, 0], [0, 1]), /blocked/);

  let seed = 0xdecafbad;
  const random = max => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed % max;
  };
  for (let trial = 0; trial < 350; trial += 1) {
    const rows = 3 + random(5);
    const columns = 3 + random(5);
    const candidate = Array.from({ length: rows }, () => Array.from({ length: columns }, () => {
      const roll = random(10);
      return roll < 2 ? '#' : 1 + random(7);
    }));
    candidate[0][0] = 1 + random(4);
    candidate[rows - 1][columns - 1] = 1 + random(4);
    const diagonalMode = random(2) === 1;
    const cornerMode = random(2) === 1;
    const actual = findPath(candidate, [0, 0], [rows - 1, columns - 1], {
      diagonal: diagonalMode,
      allowCornerCutting: cornerMode
    }).cost;
    const expected = dijkstraReference(candidate, [0, 0], [rows - 1, columns - 1], diagonalMode, cornerMode);
    if (Number.isFinite(expected)) assert.ok(Math.abs(actual - expected) < 1e-9, `trial ${trial}: ${actual} vs ${expected}`);
    else assert.equal(actual, Infinity, `trial ${trial} should be unreachable`);
  }

  console.log('A* grid pathfinder tests passed');
}

if (require.main === module) runTests();
module.exports = { findPath, MinHeap };
