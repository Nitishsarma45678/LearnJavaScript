/**
 * Exercise: Solve N-Queens with bitmask backtracking.
 *
 * Place N queens so no two share a row, column, or diagonal. Use bitmasks
 * rather than scanning the board at every recursive step. Return every board.
 *
 * Run: node 02-n-queens-bitmask-backtracking.js
 */
"use strict";
const assert = require("node:assert/strict");

function solveNQueens(n) {
  if (!Number.isInteger(n) || n < 0 || n > 14) {
    throw new RangeError("n must be an integer from 0 through 14");
  }
  if (n === 0) return [[]];

  const full = (1n << BigInt(n)) - 1n;
  const placement = Array(n).fill(-1);
  const solutions = [];

  function search(row, columns, descending, ascending) {
    if (row === n) {
      solutions.push(placement.map(column =>
        ".".repeat(column) + "Q" + ".".repeat(n - column - 1)
      ));
      return;
    }

    let available = full & ~(columns | descending | ascending);
    while (available !== 0n) {
      const bit = available & -available;
      available ^= bit;
      const column = bit.toString(2).length - 1;
      placement[row] = column;
      search(
        row + 1,
        columns | bit,
        ((descending | bit) << 1n) & full,
        (ascending | bit) >> 1n
      );
    }
    placement[row] = -1;
  }

  search(0, 0n, 0n, 0n);
  return solutions;
}

function countNQueens(n) {
  return solveNQueens(n).length;
}

function isValidBoard(board) {
  const n = board.length;
  const columns = new Set();
  const diagA = new Set();
  const diagB = new Set();
  for (let row = 0; row < n; row++) {
    if ((board[row].match(/Q/g) || []).length !== 1) return false;
    const column = board[row].indexOf("Q");
    if (columns.has(column) || diagA.has(row - column) || diagB.has(row + column)) return false;
    columns.add(column);
    diagA.add(row - column);
    diagB.add(row + column);
  }
  return true;
}

const four = solveNQueens(4);
assert.equal(four.length, 2);
assert.ok(four.every(isValidBoard));
assert.equal(countNQueens(1), 1);
assert.equal(countNQueens(2), 0);
assert.equal(countNQueens(3), 0);
assert.deepEqual(solveNQueens(0), [[]]);
assert.throws(() => solveNQueens(-1), RangeError);
console.log("N-Queens tests passed");

module.exports = { solveNQueens, countNQueens, isValidBoard };
