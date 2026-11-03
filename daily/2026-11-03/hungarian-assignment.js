const assert = require('node:assert/strict');

// Assign every row to a distinct column. Requires rows <= columns.
function hungarian(cost) {
  if (!Array.isArray(cost) || !cost.length) return { cost: 0, assignment: [] };
  const n = cost.length, m = cost[0].length;
  if (!m || n > m || cost.some(row => !Array.isArray(row) || row.length !== m ||
      row.some(value => !Number.isFinite(value)))) {
    throw new RangeError('Expected a finite rectangular matrix with 1 <= rows <= columns');
  }
  const u = Array(n + 1).fill(0), v = Array(m + 1).fill(0);
  const p = Array(m + 1).fill(0), way = Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minValue = Array(m + 1).fill(Infinity);
    const used = Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const current = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (current < minValue[j]) { minValue[j] = current; way[j] = j0; }
        if (minValue[j] < delta) { delta = minValue[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
        else minValue[j] -= delta;
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
  return { assignment, cost: assignment.reduce((sum, column, row) => sum + cost[row][column], 0) };
}

function bruteForceMinimum(cost) {
  const n = cost.length, m = cost[0].length;
  let best = Infinity;
  function search(row, used, total) {
    if (row === n) { best = Math.min(best, total); return; }
    for (let col = 0; col < m; col++) {
      if (!used.has(col)) {
        used.add(col); search(row + 1, used, total + cost[row][col]); used.delete(col);
      }
    }
  }
  search(0, new Set(), 0);
  return best;
}

const classic = hungarian([[4, 1, 3], [2, 0, 5], [3, 2, 2]]);
assert.deepEqual(classic.assignment, [1, 0, 2]);
assert.equal(classic.cost, 5);
const rectangular = [[10, 19, 8, 15], [10, 18, 7, 17], [13, 16, 9, 14]];
const result = hungarian(rectangular);
assert.equal(new Set(result.assignment).size, rectangular.length);
assert.equal(result.cost, bruteForceMinimum(rectangular));
assert.equal(hungarian([[-5, -2], [-3, -4]]).cost, -9);
assert.deepEqual(hungarian([]), { cost: 0, assignment: [] });
assert.throws(() => hungarian([[1], [2]]), RangeError);
assert.throws(() => hungarian([[1, Infinity]]), RangeError);
console.log('Hungarian assignment tests passed');