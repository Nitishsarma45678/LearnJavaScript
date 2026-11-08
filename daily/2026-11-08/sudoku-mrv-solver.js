'use strict';

// Exercise: Solve a standard 9x9 Sudoku with bitmask constraints and the
// minimum-remaining-values (MRV) heuristic. Count up to maxSolutions so the
// caller can distinguish unique puzzles from ambiguous ones.
//
// Input: nine strings/arrays containing 1-9 and '.' (or '0' for empty cells).
// The input is never mutated. Invalid givens throw; valid unsatisfiable puzzles
// return status "unsatisfiable".

const assert = require('node:assert/strict');

const FULL_MASK = (1 << 9) - 1;

function popcount(value) {
  let count = 0;
  while (value) {
    value &= value - 1;
    count += 1;
  }
  return count;
}

function normalizeGrid(input) {
  let rows;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    rows = trimmed.split(/\s+/);
    if (rows.length === 1 && rows[0].length === 81) {
      rows = Array.from({ length: 9 }, (_, i) => rows[0].slice(i * 9, i * 9 + 9));
    }
  } else {
    rows = input;
  }

  if (!Array.isArray(rows) || rows.length !== 9) {
    throw new TypeError('Sudoku must contain exactly nine rows');
  }

  const grid = rows.map(row => {
    const cells = Array.isArray(row) ? row.map(String) : Array.from(String(row));
    if (cells.length !== 9) throw new TypeError('Every Sudoku row must contain nine cells');
    return cells.map(cell => {
      if (cell === '.' || cell === '0') return '.';
      if (!/^[1-9]$/.test(cell)) throw new TypeError('Cells must be digits 1-9 or empty');
      return cell;
    });
  });
  return grid;
}

function solveSudoku(input, options = {}) {
  const maxSolutions = options.maxSolutions === undefined ? 2 : options.maxSolutions;
  if (!Number.isInteger(maxSolutions) || maxSolutions < 1) {
    throw new RangeError('maxSolutions must be a positive integer');
  }

  const grid = normalizeGrid(input);
  const rowMasks = Array(9).fill(0);
  const columnMasks = Array(9).fill(0);
  const boxMasks = Array(9).fill(0);
  const empty = [];

  const boxIndex = (row, column) => Math.floor(row / 3) * 3 + Math.floor(column / 3);

  for (let row = 0; row < 9; row += 1) {
    for (let column = 0; column < 9; column += 1) {
      const value = grid[row][column];
      if (value === '.') {
        empty.push([row, column]);
        continue;
      }
      const bit = 1 << (Number(value) - 1);
      const box = boxIndex(row, column);
      if ((rowMasks[row] | columnMasks[column] | boxMasks[box]) & bit) {
        throw new RangeError('Duplicate given at row ' + row + ', column ' + column);
      }
      rowMasks[row] |= bit;
      columnMasks[column] |= bit;
      boxMasks[box] |= bit;
    }
  }

  const solutions = [];

  function search(depth) {
    if (solutions.length >= maxSolutions) return;
    if (depth === empty.length) {
      solutions.push(grid.map(row => row.join('')));
      return;
    }

    let bestIndex = depth;
    let bestMask = 0;
    let fewest = 10;

    for (let i = depth; i < empty.length; i += 1) {
      const [row, column] = empty[i];
      const box = boxIndex(row, column);
      const candidates = FULL_MASK & ~(rowMasks[row] | columnMasks[column] | boxMasks[box]);
      const count = popcount(candidates);
      if (count < fewest) {
        fewest = count;
        bestIndex = i;
        bestMask = candidates;
        if (count <= 1) break;
      }
    }

    if (fewest === 0) return;

    const temporary = empty[depth];
    empty[depth] = empty[bestIndex];
    empty[bestIndex] = temporary;

    const [row, column] = empty[depth];
    const box = boxIndex(row, column);
    for (let candidates = bestMask; candidates; candidates &= candidates - 1) {
      const bit = candidates & -candidates;
      const digit = 1 + Math.log2(bit);
      grid[row][column] = String(digit);
      rowMasks[row] |= bit;
      columnMasks[column] |= bit;
      boxMasks[box] |= bit;

      search(depth + 1);

      grid[row][column] = '.';
      rowMasks[row] ^= bit;
      columnMasks[column] ^= bit;
      boxMasks[box] ^= bit;
      if (solutions.length >= maxSolutions) break;
    }

    empty[bestIndex] = empty[depth];
    empty[depth] = temporary;
  }

  search(0);
  return {
    status: solutions.length === 0
      ? 'unsatisfiable'
      : solutions.length === 1
        ? 'unique'
        : 'multiple',
    count: solutions.length,
    solutions
  };
}

function runTests() {
  const puzzle = [
    '53..7....',
    '6..195...',
    '.98....6.',
    '8...6...3',
    '4..8.3..1',
    '7...2...6',
    '.6....28.',
    '...419..5',
    '....8..79'
  ];
  const original = puzzle.slice();
  const solved = solveSudoku(puzzle);
  assert.equal(solved.status, 'unique');
  assert.deepEqual(solved.solutions[0], [
    '534678912', '672195348', '198342567',
    '859761423', '426853791', '713924856',
    '961537284', '287419635', '345286179'
  ]);
  assert.deepEqual(puzzle, original, 'solver must not mutate caller input');

  const ambiguous = solveSudoku(Array(9).fill('.........'), { maxSolutions: 2 });
  assert.equal(ambiguous.status, 'multiple');
  assert.equal(ambiguous.count, 2);

  const duplicate = puzzle.slice();
  duplicate[0] = '553.7....';
  assert.throws(() => solveSudoku(duplicate), /Duplicate given/);
  assert.throws(() => solveSudoku(puzzle, { maxSolutions: 0 }), /positive integer/);

  console.log('SudokuSolver: all tests passed');
}

if (require.main === module) runTests();
module.exports = { solveSudoku };
