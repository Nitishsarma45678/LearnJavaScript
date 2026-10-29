"use strict";

const assert = require("node:assert/strict");

const SIZE = 9;
const FULL_MASK = (1 << SIZE) - 1;

function bitCount(value) {
  let count = 0;
  while (value) {
    value &= value - 1;
    count += 1;
  }
  return count;
}

/**
 * Solve a 9x9 Sudoku with bit-mask constraints and the MRV heuristic.
 * Empty cells are 0. The input board is never mutated.
 *
 * maxSolutions defaults to 2: enough to distinguish unique from multiple
 * solutions without enumerating every solution of an ambiguous puzzle.
 */
function solveSudoku(input, { maxSolutions = 2 } = {}) {
  if (!Array.isArray(input) || input.length !== SIZE ||
      input.some(row => !Array.isArray(row) || row.length !== SIZE)) {
    throw new TypeError("board must be a 9x9 array");
  }
  if (!Number.isInteger(maxSolutions) || maxSolutions < 1) {
    throw new TypeError("maxSolutions must be a positive integer");
  }

  const board = input.map(row => row.slice());
  for (const row of board) {
    for (const value of row) {
      if (!Number.isInteger(value) || value < 0 || value > 9) {
        throw new TypeError("cells must be integers from 0 through 9");
      }
    }
  }

  const rows = Array(SIZE).fill(0);
  const cols = Array(SIZE).fill(0);
  const boxes = Array(SIZE).fill(0);
  const boxIndex = (r, c) => Math.floor(r / 3) * 3 + Math.floor(c / 3);

  // Load givens; a duplicate in any constraint makes the puzzle impossible.
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const value = board[r][c];
      if (value === 0) continue;
      const bit = 1 << (value - 1);
      const box = boxIndex(r, c);
      if ((rows[r] | cols[c] | boxes[box]) & bit) {
        return { solution: null, solutionsFound: 0, unique: false };
      }
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[box] |= bit;
    }
  }

  let solutionsFound = 0;
  let firstSolution = null;

  function search() {
    if (solutionsFound >= maxSolutions) return;

    let bestRow = -1;
    let bestCol = -1;
    let bestCandidates = 0;
    let fewest = SIZE + 1;

    // Minimum Remaining Values: branch on the most constrained empty cell.
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (board[r][c] !== 0) continue;
        const box = boxIndex(r, c);
        const candidates = FULL_MASK & ~(rows[r] | cols[c] | boxes[box]);
        const count = bitCount(candidates);
        if (count === 0) return;
        if (count < fewest) {
          fewest = count;
          bestRow = r;
          bestCol = c;
          bestCandidates = candidates;
          if (count === 1) break;
        }
      }
      if (fewest === 1) break;
    }

    if (bestRow === -1) {
      solutionsFound += 1;
      if (firstSolution === null) firstSolution = board.map(row => row.slice());
      return;
    }

    const box = boxIndex(bestRow, bestCol);
    let candidates = bestCandidates;
    while (candidates && solutionsFound < maxSolutions) {
      const bit = candidates & -candidates;
      candidates ^= bit;
      const value = 32 - Math.clz32(bit);
      board[bestRow][bestCol] = value;
      rows[bestRow] |= bit;
      cols[bestCol] |= bit;
      boxes[box] |= bit;

      search();

      board[bestRow][bestCol] = 0;
      rows[bestRow] ^= bit;
      cols[bestCol] ^= bit;
      boxes[box] ^= bit;
    }
  }

  search();
  return {
    solution: firstSolution,
    solutionsFound,
    unique: solutionsFound === 1
  };
}

function isSolvedSudoku(board) {
  const expected = "123456789";
  const validGroup = values => values.slice().sort((a, b) => a - b).join("") === expected;
  for (let i = 0; i < SIZE; i++) {
    if (!validGroup(board[i])) return false;
    if (!validGroup(board.map(row => row[i]))) return false;
  }
  for (let br = 0; br < SIZE; br += 3) {
    for (let bc = 0; bc < SIZE; bc += 3) {
      const values = [];
      for (let r = br; r < br + 3; r++) {
        for (let c = bc; c < bc + 3; c++) values.push(board[r][c]);
      }
      if (!validGroup(values)) return false;
    }
  }
  return true;
}

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
const original = puzzle.map(row => row.slice());
const result = solveSudoku(puzzle);
assert.ok(result.solution);
assert.equal(result.unique, true);
assert.equal(result.solutionsFound, 1);
assert.equal(isSolvedSudoku(result.solution), true);
assert.deepEqual(puzzle, original, "the input puzzle must remain unchanged");

// Contradictory givens return no solution rather than throwing.
const conflict = puzzle.map(row => row.slice());
conflict[0][1] = 5;
assert.deepEqual(solveSudoku(conflict), {
  solution: null,
  solutionsFound: 0,
  unique: false
});

// An empty board has multiple solutions; stop after the requested limit.
const ambiguous = solveSudoku(Array.from({ length: 9 }, () => Array(9).fill(0)));
assert.equal(ambiguous.solutionsFound, 2);
assert.equal(ambiguous.unique, false);
assert.throws(() => solveSudoku([[1, 2], [3, 4]]), TypeError);
assert.throws(() => solveSudoku(puzzle, { maxSolutions: 0 }), TypeError);

console.log("sudoku-solver-mrv: all assertions passed");
