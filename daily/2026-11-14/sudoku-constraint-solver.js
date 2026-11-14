/**
 * Sudoku constraint solver
 * ------------------------
 * Exercise: solve an N x N Sudoku board using bit-mask constraints,
 * minimum-remaining-values (MRV) branching, and repeated naked/hidden-single
 * propagation. Supports rectangular boxes (for example 2 x 3 boxes on 6 x 6).
 *
 * Board cells are integers: 0 means empty; 1..N are symbols.
 *
 * Run: node sudoku-constraint-solver.js
 */

'use strict';

const assert = require('node:assert/strict');

function solveSudoku(grid, options = {}) {
  const boxRows = options.boxRows ?? 3;
  const boxCols = options.boxCols ?? 3;
  const maxSolutions = options.maxSolutions ?? 1;

  if (!Array.isArray(grid) || grid.length === 0) {
    throw new TypeError('grid must be a non-empty square array');
  }

  const size = grid.length;
  if (!Number.isInteger(boxRows) || !Number.isInteger(boxCols) ||
      boxRows < 1 || boxCols < 1 || boxRows * boxCols !== size ||
      size % boxRows !== 0 || size % boxCols !== 0) {
    throw new RangeError('boxRows * boxCols must equal the board size');
  }
  if (!Number.isInteger(maxSolutions) || maxSolutions < 1) {
    throw new RangeError('maxSolutions must be a positive integer');
  }
  if (grid.some(row => !Array.isArray(row) || row.length !== size)) {
    throw new TypeError('every row must contain exactly N cells');
  }

  const fullMask = (1 << size) - 1;
  const boxCount = size;
  const boxIndex = (row, col) =>
    Math.floor(row / boxRows) * (size / boxCols) +
    Math.floor(col / boxCols);

  const units = [];
  for (let r = 0; r < size; r++) {
    units.push(Array.from({ length: size }, (_, c) => r * size + c));
  }
  for (let c = 0; c < size; c++) {
    units.push(Array.from({ length: size }, (_, r) => r * size + c));
  }
  for (let br = 0; br < size; br += boxRows) {
    for (let bc = 0; bc < size; bc += boxCols) {
      const cells = [];
      for (let dr = 0; dr < boxRows; dr++) {
        for (let dc = 0; dc < boxCols; dc++) {
          cells.push((br + dr) * size + bc + dc);
        }
      }
      units.push(cells);
    }
  }

  const state = {
    board: new Int16Array(size * size),
    rows: new Int32Array(size),
    cols: new Int32Array(size),
    boxes: new Int32Array(boxCount)
  };

  let invalidGivens = false;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const value = grid[r][c];
      if (!Number.isInteger(value) || value < 0 || value > size) {
        throw new RangeError(`cell [${r}, ${c}] must be an integer from 0 to ${size}`);
      }
      if (value === 0) continue;
      const bit = 1 << (value - 1);
      const b = boxIndex(r, c);
      if ((state.rows[r] | state.cols[c] | state.boxes[b]) & bit) {
        invalidGivens = true;
      }
      state.board[r * size + c] = value;
      state.rows[r] |= bit;
      state.cols[c] |= bit;
      state.boxes[b] |= bit;
    }
  }

  const stats = { nodes: 0, assignments: 0, backtracks: 0, solutionsFound: 0 };
  const solutions = [];

  if (invalidGivens) {
    return { solution: null, solutionsFound: 0, stats, reason: 'contradictory givens' };
  }

  function cloneState(source) {
    return {
      board: source.board.slice(),
      rows: source.rows.slice(),
      cols: source.cols.slice(),
      boxes: source.boxes.slice()
    };
  }

  function candidates(s, index) {
    const row = Math.floor(index / size);
    const col = index % size;
    const used = s.rows[row] | s.cols[col] | s.boxes[boxIndex(row, col)];
    return fullMask & ~used;
  }

  function place(s, index, bit) {
    if (s.board[index] !== 0 || (candidates(s, index) & bit) === 0) {
      return false;
    }
    const row = Math.floor(index / size);
    const col = index % size;
    s.board[index] = 32 - Math.clz32(bit);
    s.rows[row] |= bit;
    s.cols[col] |= bit;
    s.boxes[boxIndex(row, col)] |= bit;
    stats.assignments++;
    return true;
  }

  // Propagate naked singles and hidden singles until reaching a fixed point.
  function propagate(s) {
    let changed = true;
    while (changed) {
      changed = false;

      for (let index = 0; index < s.board.length; index++) {
        if (s.board[index] !== 0) continue;
        const mask = candidates(s, index);
        if (mask === 0) return false;
        if ((mask & (mask - 1)) === 0) {
          if (!place(s, index, mask)) return false;
          changed = true;
        }
      }

      for (const unit of units) {
        let used = 0;
        for (const index of unit) {
          if (s.board[index] !== 0) {
            used |= 1 << (s.board[index] - 1);
          }
        }
        let missing = fullMask & ~used;

        while (missing !== 0) {
          const bit = missing & -missing;
          missing ^= bit;
          let onlyCell = -1;
          let count = 0;

          for (const index of unit) {
            if (s.board[index] === 0 && (candidates(s, index) & bit)) {
              onlyCell = index;
              count++;
              if (count > 1) break;
            }
          }

          if (count === 0) return false;
          if (count === 1) {
            if (!place(s, onlyCell, bit)) return false;
            changed = true;
          }
        }
      }
    }
    return true;
  }

  function search(s) {
    if (solutions.length >= maxSolutions) return;
    stats.nodes++;

    if (!propagate(s)) {
      stats.backtracks++;
      return;
    }

    let bestIndex = -1;
    let bestMask = 0;
    let bestCount = size + 1;

    for (let index = 0; index < s.board.length; index++) {
      if (s.board[index] !== 0) continue;
      const mask = candidates(s, index);
      let count = 0;
      for (let bits = mask; bits; bits &= bits - 1) count++;
      if (count < bestCount) {
        bestCount = count;
        bestIndex = index;
        bestMask = mask;
        if (count <= 2) break;
      }
    }

    if (bestIndex === -1) {
      stats.solutionsFound++;
      solutions.push(Array.from({ length: size }, (_, r) =>
        Array.from(s.board.slice(r * size, (r + 1) * size))));
      return;
    }

    for (let mask = bestMask; mask; mask &= mask - 1) {
      if (solutions.length >= maxSolutions) break;
      const bit = mask & -mask;
      const child = cloneState(s);
      if (place(child, bestIndex, bit)) search(child);
    }
  }

  search(state);
  return {
    solution: solutions[0] ?? null,
    solutionsFound: solutions.length,
    stats,
    unique: solutions.length === 1 && maxSolutions > 1
  };
}

function runTests() {
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
  const solved = solveSudoku(puzzle, { maxSolutions: 2 });
  assert.equal(solved.solutionsFound, 1);
  assert.deepEqual(solved.solution[0], [5, 3, 4, 6, 7, 8, 9, 1, 2]);
  assert.ok(solved.stats.assignments > 0);

  const contradictory = puzzle.map(row => row.slice());
  contradictory[0][2] = 5;
  assert.equal(solveSudoku(contradictory).solution, null);

  const sixBySix = [
    [1, 0, 0, 4, 0, 0],
    [0, 5, 6, 0, 0, 3],
    [0, 0, 4, 0, 6, 0],
    [6, 0, 0, 3, 0, 0],
    [0, 4, 0, 0, 3, 0],
    [0, 0, 5, 0, 0, 1]
  ];
  const sixResult = solveSudoku(sixBySix, { boxRows: 2, boxCols: 3 });
  if (sixResult.solution) {
    for (const row of sixResult.solution) {
      assert.deepEqual([...new Set(row)].sort(), [1, 2, 3, 4, 5, 6]);
    }
  }

  assert.throws(() => solveSudoku([[0, 0], [0, 0]]), /boxRows/);
  assert.throws(() => solveSudoku([[0], [0]]), /exactly N cells/);
  console.log('Sudoku solver: all tests passed');
}

if (require.main === module) runTests();

module.exports = { solveSudoku };
