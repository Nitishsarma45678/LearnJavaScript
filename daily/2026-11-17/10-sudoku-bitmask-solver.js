'use strict';

/**
 * EXERCISE: Write a Sudoku solver using bit masks and MRV backtracking.
 *
 * Validate the input grid, maintain row/column/box occupancy masks, choose the
 * next empty cell with the fewest legal candidates (minimum remaining values),
 * and stop after `limitSolutions` solutions so uniqueness can be checked.
 * Input is a 9x9 array of integers: 0 means empty, 1..9 are clues.
 *
 * Run: node 10-sudoku-bitmask-solver.js
 */

const FULL = (1 << 9) - 1;
const BOX = (row, col) => Math.floor(row / 3) * 3 + Math.floor(col / 3);

function popcount(value) {
  let count = 0;
  while (value) {
    value &= value - 1;
    count++;
  }
  return count;
}

function validateGrid(grid) {
  if (!Array.isArray(grid) || grid.length !== 9 || grid.some(row => !Array.isArray(row) || row.length !== 9)) {
    throw new TypeError('Grid must be a 9x9 array');
  }
  const rows = Array(9).fill(0), cols = Array(9).fill(0), boxes = Array(9).fill(0);
  const board = grid.map(row => row.slice());
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const value = board[r][c];
      if (!Number.isInteger(value) || value < 0 || value > 9) {
        throw new RangeError(`Invalid value at row ${r + 1}, column ${c + 1}`);
      }
      if (value === 0) continue;
      const bit = 1 << (value - 1);
      const box = BOX(r, c);
      if ((rows[r] & bit) || (cols[c] & bit) || (boxes[box] & bit)) {
        throw new RangeError(`Duplicate clue ${value} at row ${r + 1}, column ${c + 1}`);
      }
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[box] |= bit;
    }
  }
  return { board, rows, cols, boxes };
}

function solveSudoku(grid, options = {}) {
  const limit = options.limitSolutions ?? 2;
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('limitSolutions must be a positive integer');
  const { board, rows, cols, boxes } = validateGrid(grid);
  const solutions = [];

  function search() {
    let bestRow = -1, bestCol = -1, bestMask = 0, bestCount = 10;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] !== 0) continue;
        const mask = FULL & ~(rows[r] | cols[c] | boxes[BOX(r, c)]);
        const count = popcount(mask);
        if (count === 0) return false;
        if (count < bestCount) {
          bestCount = count;
          bestMask = mask;
          bestRow = r;
          bestCol = c;
          if (count === 1) break;
        }
      }
      if (bestCount === 1) break;
    }

    if (bestRow === -1) {
      solutions.push(board.map(row => row.slice()));
      return solutions.length >= limit;
    }

    const box = BOX(bestRow, bestCol);
    let candidates = bestMask;
    while (candidates) {
      const bit = candidates & -candidates;
      candidates ^= bit;
      const value = 32 - Math.clz32(bit);
      board[bestRow][bestCol] = value;
      rows[bestRow] |= bit;
      cols[bestCol] |= bit;
      boxes[box] |= bit;

      const stop = search();

      board[bestRow][bestCol] = 0;
      rows[bestRow] ^= bit;
      cols[bestCol] ^= bit;
      boxes[box] ^= bit;
      if (stop) return true;
    }
    return false;
  }

  search();
  return {
    solution: solutions[0] ?? null,
    solutionsFound: solutions.length,
    unique: solutions.length === 1
  };
}

function isSolvedGrid(grid) {
  try {
    const { board, rows, cols, boxes } = validateGrid(grid);
    if (board.some(row => row.some(value => value === 0))) return false;
    return rows.every(mask => mask === FULL) && cols.every(mask => mask === FULL) && boxes.every(mask => mask === FULL);
  } catch {
    return false;
  }
}

// ------------------------------ Tests ----------------------------------
if (require.main === module) {
  const assert = require('node:assert/strict');
  const puzzle = [
    [5, 3, 0, 0, 7, 0, 0, 0, 0],
    [6, 0, 0, 1, 9, 5, 0, 0, 0],
    [0, 9, 8, 0, 0, 0, 0, 6, 0],
    [8, 0, 0, 0, 6, 0, 0, 0, 3],
    [4, 0, 0, 8, 0, 3, 0, 0, 1],
    [7, 0, 0, 0, 2, 0, 0, 0, 6],
    [0, 6, 0, 0, 0, 0, 2, 8, 0],
    [0, 0, 0, 4, 1, 9, 0, 0, 5],
    [0, 0, 0, 0, 8, 0, 0, 7, 9]
  ];
  const solved = solveSudoku(puzzle);
  assert.equal(solved.solutionsFound, 1);
  assert.equal(solved.unique, true);
  assert.equal(isSolvedGrid(solved.solution), true);
  assert.equal(puzzle[0][2], 0, 'input grid is not mutated');

  const multiple = solveSudoku(Array.from({ length: 9 }, () => Array(9).fill(0)));
  assert.equal(multiple.solutionsFound, 2, 'search stops after the requested solution limit');
  assert.equal(multiple.unique, false);
  assert.equal(isSolvedGrid(multiple.solution), true);

  const impossible = Array.from({ length: 9 }, () => Array(9).fill(0));
  impossible[0] = [0, 1, 2, 3, 4, 6, 7, 8, 9];
  [3, 4, 5, 6, 7, 8, 9, 1].forEach((value, index) => { impossible[index + 1][0] = value; });
  assert.equal(solveSudoku(impossible).solution, null, 'a valid but contradictory partial grid has no solution');
  assert.equal(solveSudoku(impossible).solutionsFound, 0);

  const duplicate = puzzle.map(row => row.slice());
  duplicate[0][2] = 5;
  assert.throws(() => solveSudoku(duplicate), /Duplicate clue/);
  assert.throws(() => solveSudoku([[1, 2]]), /9x9/);
  assert.throws(() => solveSudoku(puzzle, { limitSolutions: 0 }), /positive integer/);
  assert.equal(popcount(0b101101), 4);
  console.log('Sudoku bitmask solver: all tests passed');
}

module.exports = { solveSudoku, isSolvedGrid, popcount };
