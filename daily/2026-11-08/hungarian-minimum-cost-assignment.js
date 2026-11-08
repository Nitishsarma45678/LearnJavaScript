'use strict';

/**
 * Minimum-cost one-to-one assignment for a rectangular cost matrix (rows <= columns).
 * The Hungarian algorithm runs in O(rows^2 * columns). A null or Infinity entry
 * forbids that assignment. Negative and fractional finite costs are supported.
 */
function minimumCostAssignment(costMatrix) {
  if (!Array.isArray(costMatrix)) throw new TypeError('costMatrix must be an array');
  const rows = costMatrix.length;
  if (rows === 0) return { cost: 0, assignment: [] };
  if (!Array.isArray(costMatrix[0])) throw new TypeError('each row must be an array');
  const columns = costMatrix[0].length;
  if (columns < rows) throw new RangeError('there must be at least as many columns as rows');

  const costs = costMatrix.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== columns) throw new TypeError(`row ${rowIndex} has inconsistent length`);
    return row.map((value, columnIndex) => {
      if (value === null || value === Infinity) return Infinity;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`cost at [${rowIndex}, ${columnIndex}] must be finite, null or Infinity`);
      }
      return value;
    });
  });

  // 1-based arrays; column 0 is the temporary unmatched column.
  const rowPotential = Array(rows + 1).fill(0);
  const columnPotential = Array(columns + 1).fill(0);
  const matchedRow = Array(columns + 1).fill(0);
  const predecessor = Array(columns + 1).fill(0);

  for (let row = 1; row <= rows; row += 1) {
    matchedRow[0] = row;
    let currentColumn = 0;
    const minimumReducedCost = Array(columns + 1).fill(Infinity);
    const used = Array(columns + 1).fill(false);

    do {
      used[currentColumn] = true;
      const currentRow = matchedRow[currentColumn];
      let delta = Infinity;
      let nextColumn = -1;

      for (let column = 1; column <= columns; column += 1) {
        if (used[column]) continue;
        const rawCost = costs[currentRow - 1][column - 1];
        if (rawCost !== Infinity) {
          const reducedCost = rawCost - rowPotential[currentRow] - columnPotential[column];
          if (reducedCost < minimumReducedCost[column]) {
            minimumReducedCost[column] = reducedCost;
            predecessor[column] = currentColumn;
          }
        }
        if (minimumReducedCost[column] < delta ||
            (minimumReducedCost[column] === delta && (nextColumn === -1 || column < nextColumn))) {
          delta = minimumReducedCost[column];
          nextColumn = column;
        }
      }

      if (nextColumn === -1 || delta === Infinity) {
        throw new Error('no complete assignment exists under the allowed edges');
      }
      for (let column = 0; column <= columns; column += 1) {
        if (used[column]) {
          rowPotential[matchedRow[column]] += delta;
          columnPotential[column] -= delta;
        } else if (minimumReducedCost[column] !== Infinity) {
          minimumReducedCost[column] -= delta;
        }
      }
      currentColumn = nextColumn;
    } while (matchedRow[currentColumn] !== 0);

    do {
      const previousColumn = predecessor[currentColumn];
      matchedRow[currentColumn] = matchedRow[previousColumn];
      currentColumn = previousColumn;
    } while (currentColumn !== 0);
  }

  const assignment = Array(rows).fill(-1);
  for (let column = 1; column <= columns; column += 1) {
    if (matchedRow[column] !== 0) assignment[matchedRow[column] - 1] = column - 1;
  }
  if (assignment.some((column, row) => column < 0 || costs[row][column] === Infinity) ||
      new Set(assignment).size !== rows) {
    throw new Error('no complete assignment exists under the allowed edges');
  }
  const cost = assignment.reduce((sum, column, row) => sum + costs[row][column], 0);
  return { cost, assignment };
}

function bruteForceAssignment(costs) {
  const rows = costs.length;
  const columns = rows ? costs[0].length : 0;
  let bestCost = Infinity;
  let best = null;
  const used = new Set();
  const current = Array(rows).fill(-1);
  function search(row, total) {
    if (row === rows) {
      if (total < bestCost) { bestCost = total; best = [...current]; }
      return;
    }
    for (let column = 0; column < columns; column += 1) {
      const value = costs[row][column];
      if (used.has(column) || value === null || value === Infinity) continue;
      // Negative costs in later rows make naive partial-cost pruning unsafe.
      used.add(column);
      current[row] = column;
      search(row + 1, total + value);
      used.delete(column);
    }
  }
  search(0, 0);
  return best === null ? null : { cost: bestCost, assignment: best };
}

function runTests() {
  const assert = require('node:assert/strict');
  const sample = minimumCostAssignment([[4, 1, 3], [2, 0, 5], [3, 2, 2]]);
  assert.equal(sample.cost, 5);
  assert.deepEqual(sample.assignment, [1, 0, 2]);
  assert.equal(minimumCostAssignment([[-5, 2, 1], [3, -4, 0]]).cost, -9);
  assert.equal(minimumCostAssignment([[null, 4, 2], [3, null, 1]]).cost, 5);
  assert.deepEqual(minimumCostAssignment([]), { cost: 0, assignment: [] });
  assert.throws(() => minimumCostAssignment([[1], [2]]), RangeError);
  assert.throws(() => minimumCostAssignment([[Infinity, null], [Infinity, null]]), /no complete assignment/);
  assert.throws(() => minimumCostAssignment([[1, NaN]]), TypeError);

  // Exhaustive differential tests on small rectangular matrices.
  let seed = 0x76543210;
  const random = max => ((seed = (seed * 1664525 + 1013904223) >>> 0) % max);
  for (let trial = 0; trial < 500; trial += 1) {
    const rows = 1 + random(4);
    const columns = rows + random(3);
    const matrix = Array.from({ length: rows }, () => Array.from({ length: columns }, () => {
      const value = random(9);
      return value === 0 ? null : random(31) - 15;
    }));
    const expected = bruteForceAssignment(matrix);
    if (expected === null) {
      assert.throws(() => minimumCostAssignment(matrix), /no complete assignment/);
    } else {
      const actual = minimumCostAssignment(matrix);
      assert.equal(actual.cost, expected.cost);
      assert.equal(new Set(actual.assignment).size, rows);
      actual.assignment.forEach((column, row) => assert.notEqual(matrix[row][column], null));
    }
  }
  console.log('Hungarian assignment optimizer tests passed');
}

if (require.main === module) runTests();
module.exports = { minimumCostAssignment, bruteForceAssignment };
