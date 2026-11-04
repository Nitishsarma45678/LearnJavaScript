'use strict';

/**
 * Exercise: implement Algorithm X with Dancing Links (DLX).
 * Every column is a required constraint; each row is one possible choice.
 * The solver can enumerate multiple covers and is demonstrated with Sudoku.
 */

function solveExactCover(columnNames, rows, { maxSolutions = 1 } = {}) {
  if (!Array.isArray(columnNames) || columnNames.length === 0 || !Array.isArray(rows)) {
    throw new TypeError('Provide a non-empty column array and a row array');
  }
  if (!Number.isInteger(maxSolutions) || maxSolutions < 1) throw new RangeError('maxSolutions must be a positive integer');
  if (new Set(columnNames).size !== columnNames.length) throw new Error('Column names must be unique');

  const root = { L: null, R: null, U: null, D: null, C: null, size: 0, name: '<root>' };
  root.L = root.R = root.U = root.D = root;
  const columns = new Map();
  for (const name of columnNames) {
    const header = { L: root.L, R: root, U: null, D: null, C: null, size: 0, name };
    header.U = header.D = header;
    root.L.R = header;
    root.L = header;
    header.C = header;
    columns.set(name, header);
  }

  const rowIds = new Set();
  for (const row of rows) {
    if (!row || (typeof row.id !== 'string' && typeof row.id !== 'number') || !Array.isArray(row.columns)) {
      throw new TypeError('Each row must have an id and a columns array');
    }
    if (rowIds.has(row.id)) throw new Error(`Duplicate row id: ${row.id}`);
    rowIds.add(row.id);
    if (row.columns.length === 0 || new Set(row.columns).size !== row.columns.length) {
      throw new Error(`Row ${row.id} must contain distinct, non-empty columns`);
    }
    let first = null;
    for (const name of row.columns) {
      const column = columns.get(name);
      if (!column) throw new Error(`Unknown column ${name} in row ${row.id}`);
      const node = { L: null, R: null, U: column.U, D: column, C: column, rowId: row.id };
      column.U.D = node;
      column.U = node;
      column.size++;
      if (!first) {
        first = node;
        node.L = node.R = node;
      } else {
        node.L = first.L;
        node.R = first;
        first.L.R = node;
        first.L = node;
      }
    }
  }

  function cover(column) {
    column.R.L = column.L;
    column.L.R = column.R;
    for (let row = column.D; row !== column; row = row.D) {
      for (let node = row.R; node !== row; node = node.R) {
        node.D.U = node.U;
        node.U.D = node.D;
        node.C.size--;
      }
    }
  }

  function uncover(column) {
    for (let row = column.U; row !== column; row = row.U) {
      for (let node = row.L; node !== row; node = node.L) {
        node.C.size++;
        node.D.U = node;
        node.U.D = node;
      }
    }
    column.R.L = column;
    column.L.R = column;
  }

  function chooseColumn() {
    let best = root.R;
    for (let column = best.R; column !== root; column = column.R) {
      if (column.size < best.size) best = column;
      if (best.size === 0) break;
    }
    return best;
  }

  const solutions = [];
  const partial = [];
  function search() {
    if (root.R === root) {
      solutions.push(partial.slice());
      return solutions.length >= maxSolutions;
    }
    const column = chooseColumn();
    if (column.size === 0) return false;
    cover(column);
    let stop = false;
    for (let row = column.D; row !== column && !stop; row = row.D) {
      partial.push(row.rowId);
      for (let node = row.R; node !== row; node = node.R) cover(node.C);
      stop = search();
      for (let node = row.L; node !== row; node = node.L) uncover(node.C);
      partial.pop();
    }
    uncover(column);
    return stop;
  }

  search();
  return solutions;
}

function solveSudoku(board) {
  const size = 9;
  if (!Array.isArray(board) || board.length !== size || board.some(row =>
    !Array.isArray(row) || row.length !== size || row.some(value => !Number.isInteger(value) || value < 0 || value > 9))) {
    throw new TypeError('Sudoku board must be a 9x9 matrix of integers from 0 through 9');
  }
  const seenRows = Array.from({ length: 9 }, () => new Set());
  const seenCols = Array.from({ length: 9 }, () => new Set());
  const seenBoxes = Array.from({ length: 9 }, () => new Set());
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    const value = board[r][c];
    if (!value) continue;
    const box = Math.floor(r / 3) * 3 + Math.floor(c / 3);
    if (seenRows[r].has(value) || seenCols[c].has(value) || seenBoxes[box].has(value)) return null;
    seenRows[r].add(value); seenCols[c].add(value); seenBoxes[box].add(value);
  }

  const columnNames = [];
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) columnNames.push(`cell:${r}:${c}`);
  for (let r = 0; r < 9; r++) for (let d = 1; d <= 9; d++) columnNames.push(`row:${r}:${d}`);
  for (let c = 0; c < 9; c++) for (let d = 1; d <= 9; d++) columnNames.push(`col:${c}:${d}`);
  for (let b = 0; b < 9; b++) for (let d = 1; d <= 9; d++) columnNames.push(`box:${b}:${d}`);

  const rows = [];
  const assignments = new Map();
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    const box = Math.floor(r / 3) * 3 + Math.floor(c / 3);
    const candidates = board[r][c] ? [board[r][c]] : [1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (const d of candidates) {
      const id = `${r},${c},${d}`;
      rows.push({ id, columns: [`cell:${r}:${c}`, `row:${r}:${d}`, `col:${c}:${d}`, `box:${box}:${d}`] });
      assignments.set(id, [r, c, d]);
    }
  }
  const [solution] = solveExactCover(columnNames, rows, { maxSolutions: 1 });
  if (!solution) return null;
  const solved = board.map(row => row.slice());
  for (const id of solution) {
    const [r, c, d] = assignments.get(id);
    solved[r][c] = d;
  }
  return solved;
}

module.exports = { solveExactCover, solveSudoku };

if (require.main === module) {
  const assert = require('node:assert/strict');
  const columns = ['A', 'B', 'C', 'D'];
  const rows = [
    { id: 'ab', columns: ['A', 'B'] }, { id: 'cd', columns: ['C', 'D'] },
    { id: 'ac', columns: ['A', 'C'] }, { id: 'bd', columns: ['B', 'D'] }
  ];
  const solutions = solveExactCover(columns, rows, { maxSolutions: 5 });
  assert.equal(solutions.length, 2);
  assert.deepEqual(solveExactCover(['x'], [{ id: 'empty', columns: ['x'] }]), [['empty']]);
  assert.deepEqual(solveExactCover(['x', 'y'], [{ id: 'only-x', columns: ['x'] }]), []);

  const puzzle = [
    [5, 3, 0, 0, 7, 0, 0, 0, 0], [6, 0, 0, 1, 9, 5, 0, 0, 0],
    [0, 9, 8, 0, 0, 0, 0, 6, 0], [8, 0, 0, 0, 6, 0, 0, 0, 3],
    [4, 0, 0, 8, 0, 3, 0, 0, 1], [7, 0, 0, 0, 2, 0, 0, 0, 6],
    [0, 6, 0, 0, 0, 0, 2, 8, 0], [0, 0, 0, 4, 1, 9, 0, 0, 5],
    [0, 0, 0, 0, 8, 0, 0, 7, 9]
  ];
  const solved = solveSudoku(puzzle);
  assert.deepEqual(solved[0], [5, 3, 4, 6, 7, 8, 9, 1, 2]);
  assert.deepEqual(solved[8], [3, 4, 5, 2, 8, 6, 1, 7, 9]);
  assert.equal(solveSudoku([[1, 1, 0, 0, 0, 0, 0, 0, 0], ...Array.from({ length: 8 }, () => Array(9).fill(0))]), null);
  assert.throws(() => solveSudoku([[0]]), TypeError);
  console.log('Dancing Links exact cover: all tests passed');
}
