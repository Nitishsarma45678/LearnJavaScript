'use strict';

/**
 * Exercise: implement A* for a weighted rectangular grid.
 *
 * A cell is either a non-negative entry cost or a wall (null / Infinity).
 * The path cost charges the destination cell for each move. Optional diagonal
 * movement costs sqrt(2) times the destination cell cost. By default, diagonal
 * moves may not cut across blocked corners.
 *
 * Return null when no path exists; otherwise return { path, cost, expanded }.
 * Coordinates are [row, column]. Use heuristic: 'zero' for Dijkstra's algorithm.
 */

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
      if (right < this.items.length &&
          this.compare(this.items[right], this.items[left]) < 0) child = right;
      if (this.compare(last, this.items[child]) <= 0) break;
      this.items[index] = this.items[child];
      index = child;
    }
    this.items[index] = last;
    return root;
  }
}

function validateGrid(grid) {
  if (!Array.isArray(grid) || grid.length === 0 ||
      !Array.isArray(grid[0]) || grid[0].length === 0) {
    throw new TypeError('grid must be a non-empty rectangular matrix');
  }
  const columns = grid[0].length;
  let minimumCost = Infinity;

  for (const row of grid) {
    if (!Array.isArray(row) || row.length !== columns) {
      throw new TypeError('grid must be rectangular');
    }
    for (const cell of row) {
      if (cell === null || cell === Infinity) continue;
      if (typeof cell !== 'number' || !Number.isFinite(cell) || cell < 0) {
        throw new TypeError('walkable cells must have finite non-negative costs');
      }
      minimumCost = Math.min(minimumCost, cell);
    }
  }

  return { rows: grid.length, columns, minimumCost };
}

function isWalkable(grid, row, column) {
  if (row < 0 || column < 0 || row >= grid.length || column >= grid[0].length) return false;
  const value = grid[row][column];
  return value !== null && value !== Infinity;
}

function normalizePoint(point, rows, columns, name) {
  if (!Array.isArray(point) || point.length !== 2 ||
      !Number.isInteger(point[0]) || !Number.isInteger(point[1]) ||
      point[0] < 0 || point[0] >= rows || point[1] < 0 || point[1] >= columns) {
    throw new RangeError(name + ' must be an in-bounds [row, column] pair');
  }
  return point;
}

function aStar(grid, start, goal, options = {}) {
  const { rows, columns, minimumCost } = validateGrid(grid);
  normalizePoint(start, rows, columns, 'start');
  normalizePoint(goal, rows, columns, 'goal');

  const diagonal = options.diagonal === true;
  const allowCornerCutting = options.allowCornerCutting === true;
  const heuristicMode = options.heuristic || 'auto';
  if (heuristicMode !== 'auto' && heuristicMode !== 'zero') {
    throw new TypeError("heuristic must be 'auto' or 'zero'");
  }

  if (!isWalkable(grid, start[0], start[1]) ||
      !isWalkable(grid, goal[0], goal[1])) return null;

  const cellCount = rows * columns;
  const idOf = (row, column) => row * columns + column;
  const pointOf = id => [Math.floor(id / columns), id % columns];
  const startId = idOf(start[0], start[1]);
  const goalId = idOf(goal[0], goal[1]);
  const distances = new Float64Array(cellCount);
  distances.fill(Infinity);
  const parents = new Int32Array(cellCount);
  parents.fill(-1);

  const heuristic = (row, column) => {
    if (heuristicMode === 'zero' || minimumCost === Infinity) return 0;
    const dr = Math.abs(goal[0] - row);
    const dc = Math.abs(goal[1] - column);
    const steps = diagonal
      ? Math.max(dr, dc) + (Math.SQRT2 - 1) * Math.min(dr, dc)
      : dr + dc;
    return steps * minimumCost;
  };

  const heap = new MinHeap((a, b) =>
    a.f - b.f || a.h - b.h || a.sequence - b.sequence
  );
  let sequence = 0;
  let expanded = 0;
  distances[startId] = 0;
  const initialH = heuristic(start[0], start[1]);
  heap.push({ id: startId, g: 0, h: initialH, f: initialH, sequence: sequence++ });

  const directions = diagonal
    ? [[-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
       [-1, -1, Math.SQRT2], [-1, 1, Math.SQRT2],
       [1, -1, Math.SQRT2], [1, 1, Math.SQRT2]]
    : [[-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1]];

  while (heap.size > 0) {
    const current = heap.pop();
    if (current.g !== distances[current.id]) continue;
    expanded += 1;

    if (current.id === goalId) {
      const path = [];
      for (let id = goalId; id !== -1; id = parents[id]) path.push(pointOf(id));
      path.reverse();
      return { path, cost: current.g, expanded };
    }

    const [row, column] = pointOf(current.id);
    for (const [dr, dc, multiplier] of directions) {
      const nextRow = row + dr;
      const nextColumn = column + dc;
      if (!isWalkable(grid, nextRow, nextColumn)) continue;

      if (dr !== 0 && dc !== 0 && !allowCornerCutting) {
        if (!isWalkable(grid, row + dr, column) ||
            !isWalkable(grid, row, column + dc)) continue;
      }

      const nextId = idOf(nextRow, nextColumn);
      const nextCost = current.g + grid[nextRow][nextColumn] * multiplier;
      if (nextCost >= distances[nextId]) continue;

      distances[nextId] = nextCost;
      parents[nextId] = current.id;
      const h = heuristic(nextRow, nextColumn);
      heap.push({
        id: nextId, g: nextCost, h, f: nextCost + h, sequence: sequence++
      });
    }
  }

  return null;
}

function runTests() {
  const assert = require('node:assert/strict');

  const open = aStar([[1, 1, 1], [1, null, 1], [1, 1, 1]], [0, 0], [2, 2]);
  assert.equal(open.cost, 4);
  assert.deepEqual(open.path[0], [0, 0]);
  assert.deepEqual(open.path[open.path.length - 1], [2, 2]);
  assert.equal(aStar([[1, null], [null, 1]], [0, 0], [1, 1], { diagonal: true }), null);
  assert.equal(
    aStar([[1, null], [null, 1]], [0, 0], [1, 1],
      { diagonal: true, allowCornerCutting: true }).cost,
    Math.SQRT2
  );

  const weighted = aStar([[1, 20, 1], [1, 1, 1]], [0, 0], [0, 2]);
  assert.equal(weighted.cost, 4);
  assert.deepEqual(weighted.path, [[0, 0], [1, 0], [1, 1], [1, 2], [0, 2]]);
  assert.equal(aStar([[1, null]], [0, 0], [0, 1]), null);
  assert.equal(aStar([[0]], [0, 0], [0, 0]).cost, 0);
  assert.throws(() => aStar([[1], [1, 2]], [0, 0], [1, 0]), /rectangular/);
  assert.throws(() => aStar([[1, -1]], [0, 0], [0, 1]), /non-negative/);

  // Compare A* with Dijkstra on deterministic random weighted maps.
  let seed = 0xabcddcba;
  const random = limit => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed % limit;
  };
  let compared = 0;
  for (let trial = 0; trial < 150; trial += 1) {
    const grid = Array.from({ length: 7 }, () =>
      Array.from({ length: 7 }, () => random(5) === 0 ? null : 1 + random(9))
    );
    grid[0][0] = 1;
    grid[6][6] = 1;
    const informed = aStar(grid, [0, 0], [6, 6]);
    const reference = aStar(grid, [0, 0], [6, 6], { heuristic: 'zero' });
    assert.equal(informed === null, reference === null);
    if (informed) assert.ok(Math.abs(informed.cost - reference.cost) < 1e-9);
    compared += 1;
  }

  return { checks: 10 + compared, randomizedTrials: compared };
}

if (typeof module !== 'undefined') {
  module.exports = { aStar, MinHeap, runTests };
}
