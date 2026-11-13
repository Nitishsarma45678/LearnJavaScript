'use strict';

/*
 * Exercise: Solve a rectangular minimum-cost assignment problem.
 *
 * Assign every row to a different column while minimizing total cost.
 * The Hungarian algorithm below supports negative costs and forbidden
 * edges (Infinity), and runs in O(rows^2 * columns) when rows <= columns.
 *
 * Return rowToColumn[row] = selected column, total cost, and dual
 * potentials. A missing perfect assignment is reported explicitly.
 */

const assert = require('node:assert/strict');

function minimumCostAssignment(costs) {
  if (!Array.isArray(costs)) throw new TypeError('costs must be a matrix');
  const rowCount = costs.length;
  if (rowCount === 0) return { rowToColumn: [], totalCost: 0, rowPotentials: [], columnPotentials: [] };
  if (!Array.isArray(costs[0])) throw new TypeError('each row must be an array');

  const columnCount = costs[0].length;
  if (rowCount > columnCount) {
    throw new RangeError('there must be at least as many columns as rows');
  }

  for (const row of costs) {
    if (!Array.isArray(row) || row.length !== columnCount) {
      throw new TypeError('cost matrix must be rectangular');
    }
    for (const value of row) {
      if (typeof value !== 'number' || Number.isNaN(value) || value === -Infinity) {
        throw new TypeError('costs must be finite numbers or positive Infinity');
      }
    }
  }

  // Hungarian potentials and matching use 1-based indices; column 0 is
  // the temporary root of each augmenting search.
  const u = Array(rowCount + 1).fill(0);
  const v = Array(columnCount + 1).fill(0);
  const matchedRow = Array(columnCount + 1).fill(0);
  const predecessor = Array(columnCount + 1).fill(0);

  for (let row = 1; row <= rowCount; row += 1) {
    matchedRow[0] = row;
    let currentColumn = 0;
    const minReducedCost = Array(columnCount + 1).fill(Infinity);
    const used = Array(columnCount + 1).fill(false);

    do {
      used[currentColumn] = true;
      const currentRow = matchedRow[currentColumn];
      let delta = Infinity;
      let nextColumn = -1;

      for (let column = 1; column <= columnCount; column += 1) {
        if (used[column]) continue;
        const rawCost = costs[currentRow - 1][column - 1];
        const reducedCost = rawCost - u[currentRow] - v[column];

        if (reducedCost < minReducedCost[column]) {
          minReducedCost[column] = reducedCost;
          predecessor[column] = currentColumn;
        }
        if (minReducedCost[column] < delta) {
          delta = minReducedCost[column];
          nextColumn = column;
        }
      }

      if (nextColumn === -1 || !Number.isFinite(delta)) {
        throw new Error('No complete assignment exists');
      }

      for (let column = 0; column <= columnCount; column += 1) {
        if (used[column]) {
          u[matchedRow[column]] += delta;
          v[column] -= delta;
        } else {
          minReducedCost[column] -= delta;
        }
      }
      currentColumn = nextColumn;
    } while (matchedRow[currentColumn] !== 0);

    // Flip the alternating path to augment the matching by one row.
    do {
      const previousColumn = predecessor[currentColumn];
      matchedRow[currentColumn] = matchedRow[previousColumn];
      currentColumn = previousColumn;
    } while (currentColumn !== 0);
  }

  const rowToColumn = Array(rowCount).fill(-1);
  for (let column = 1; column <= columnCount; column += 1) {
    if (matchedRow[column] !== 0) {
      rowToColumn[matchedRow[column] - 1] = column - 1;
    }
  }

  let totalCost = 0;
  for (let row = 0; row < rowCount; row += 1) {
    const column = rowToColumn[row];
    if (column < 0 || costs[row][column] === Infinity) {
      throw new Error('No complete assignment exists');
    }
    totalCost += costs[row][column];
  }

  return {
    rowToColumn,
    totalCost,
    rowPotentials: u.slice(1),
    columnPotentials: v.slice(1)
  };
}

function bruteForceMinimum(costs) {
  const rows = costs.length;
  const columns = costs[0]?.length || 0;
  let best = Infinity;
  const used = new Set();

  function search(row, total) {
    if (row === rows) {
      best = Math.min(best, total);
      return;
    }
    for (let column = 0; column < columns; column += 1) {
      if (used.has(column) || costs[row][column] === Infinity) continue;
      used.add(column);
      search(row + 1, total + costs[row][column]);
      used.delete(column);
    }
  }

  search(0, 0);
  return best;
}

// Example usage and tests.
function runTests() {
  const classic = minimumCostAssignment([
    [4, 1, 3],
    [2, 0, 5],
    [3, 2, 2]
  ]);
  assert.equal(classic.totalCost, 5);
  assert.deepEqual(classic.rowToColumn, [1, 0, 2]);

  const rectangular = minimumCostAssignment([
    [-2, 4, 3, 9],
    [1, 0, 5, 2]
  ]);
  assert.equal(rectangular.totalCost, -2);
  assert.equal(new Set(rectangular.rowToColumn).size, 2);

  const forbidden = minimumCostAssignment([
    [1, Infinity, 7],
    [2, 3, Infinity]
  ]);
  assert.equal(forbidden.totalCost, 4);
  assert.deepEqual(forbidden.rowToColumn, [0, 1]);

  assert.deepEqual(minimumCostAssignment([]), {
    rowToColumn: [],
    totalCost: 0,
    rowPotentials: [],
    columnPotentials: []
  });
  assert.throws(() => minimumCostAssignment([[Infinity, 1], [Infinity, 2]]), /No complete assignment/);
  assert.throws(() => minimumCostAssignment([[1], [2]]), RangeError);
  assert.throws(() => minimumCostAssignment([[1, 2], [3]]), /rectangular/);
  assert.throws(() => minimumCostAssignment([[NaN]]), TypeError);

  // Check primal feasibility and complementary slackness on finite matrices.
  const dual = minimumCostAssignment([
    [8, 2, 5],
    [6, 7, 3]
  ]);
  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      assert.ok(
        dual.rowPotentials[row] + dual.columnPotentials[column] <=
          [[8, 2, 5], [6, 7, 3]][row][column] + 1e-9
      );
    }
    const chosen = dual.rowToColumn[row];
    assert.ok(Math.abs(
      dual.rowPotentials[row] + dual.columnPotentials[chosen] -
        [[8, 2, 5], [6, 7, 3]][row][chosen]
    ) < 1e-9);
  }

  // Randomized comparison with exhaustive enumeration for small matrices.
  let seed = 991827;
  const random = max => {
    seed = (seed * 48271) % 2147483647;
    return seed % max;
  };
  for (let trial = 0; trial < 180; trial += 1) {
    const rows = 1 + random(4);
    const columns = rows + random(3);
    const matrix = Array.from({ length: rows }, () =>
      Array.from({ length: columns }, () =>
        random(8) === 0 ? Infinity : random(31) - 15
      )
    );
    const expected = bruteForceMinimum(matrix);
    if (expected === Infinity) {
      assert.throws(() => minimumCostAssignment(matrix), /No complete assignment/);
    } else {
      const actual = minimumCostAssignment(matrix);
      assert.equal(actual.totalCost, expected);
      assert.equal(new Set(actual.rowToColumn).size, rows);
    }
  }

  console.log('HungarianAssignment: all tests passed');
}

if (require.main === module) runTests();

module.exports = { minimumCostAssignment };
