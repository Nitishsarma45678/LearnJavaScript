/**
 * Exercise: Solve a rectangular minimum-cost assignment problem.
 * Assign every row to a distinct column (rows <= columns), minimizing total
 * cost. Return the chosen column for each row and the minimum cost.
 * Target complexity: O(rows^2 * columns).
 * Run: node 13-hungarian-assignment-algorithm.js
 */
"use strict";
const assert = require("node:assert/strict");

function hungarian(cost) {
  if (!Array.isArray(cost) || cost.length === 0 || !Array.isArray(cost[0])) {
    throw new TypeError("cost must be a non-empty matrix");
  }
  const n = cost.length, m = cost[0].length;
  if (m < n || m === 0 || cost.some(row => !Array.isArray(row) || row.length !== m ||
      row.some(value => !Number.isFinite(value)))) {
    throw new RangeError("matrix must be rectangular, finite, and have columns >= rows");
  }

  const u = Array(n + 1).fill(0);
  const v = Array(m + 1).fill(0);
  const p = Array(m + 1).fill(0);
  const way = Array(m + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = Array(m + 1).fill(Infinity);
    const used = Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const current = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (current < minv[j]) { minv[j] = current; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
        else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const assignment = Array(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j] !== 0) assignment[p[j] - 1] = j - 1;
  const totalCost = assignment.reduce((sum, column, row) => sum + cost[row][column], 0);
  return { assignment, totalCost };
}

const square = hungarian([[4, 1, 3], [2, 0, 5], [3, 2, 2]]);
assert.deepEqual(square.assignment, [1, 0, 2]);
assert.equal(square.totalCost, 5);
const rectangular = hungarian([[10, 2, 8, 7], [6, 9, 4, 3]]);
assert.equal(rectangular.assignment.length, 2);
assert.equal(new Set(rectangular.assignment).size, 2);
assert.equal(rectangular.totalCost, 5);
assert.throws(() => hungarian([[1, 2], [3]]), RangeError);
assert.throws(() => hungarian([[1], [2]]), RangeError);
console.log("Hungarian assignment tests passed");
module.exports = { hungarian };
