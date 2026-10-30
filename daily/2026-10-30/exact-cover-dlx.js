'use strict';

/**
 * Algorithm X with Dancing Links (DLX) for exact-cover problems.
 * Each row covers a non-empty subset of columns; every column must be covered
 * exactly once. The sparse toroidal linked structure supports reversible
 * cover/uncover operations without copying the matrix during backtracking.
 */
class Link {
  constructor() {
    this.left = this;
    this.right = this;
    this.up = this;
    this.down = this;
    this.column = null;
    this.rowId = null;
  }
}

class Column extends Link {
  constructor(name) {
    super();
    this.name = name;
    this.size = 0;
    this.column = this;
  }
}

class ExactCover {
  constructor(columnNames) {
    if (!Array.isArray(columnNames)) throw new TypeError('columnNames must be an array');
    if (new Set(columnNames).size !== columnNames.length) {
      throw new Error('column names must be unique');
    }
    this.root = new Link();
    this.columns = columnNames.map(name => new Column(name));
    this.rows = new Set();
    for (const column of this.columns) {
      column.left = this.root.left;
      column.right = this.root;
      this.root.left.right = column;
      this.root.left = column;
    }
  }

  addRow(rowId, columnIndexes) {
    if (this.rows.has(rowId)) throw new Error(`duplicate row id: ${String(rowId)}`);
    if (!Array.isArray(columnIndexes) || columnIndexes.length === 0) {
      throw new TypeError('each row must cover at least one column');
    }
    if (new Set(columnIndexes).size !== columnIndexes.length) {
      throw new Error('a row cannot cover the same column twice');
    }
    for (const index of columnIndexes) {
      if (!Number.isInteger(index) || index < 0 || index >= this.columns.length) {
        throw new RangeError(`invalid column index: ${index}`);
      }
    }

    this.rows.add(rowId);
    let first = null;
    for (const index of columnIndexes) {
      const column = this.columns[index];
      const node = new Link();
      node.column = column;
      node.rowId = rowId;
      node.up = column.up;
      node.down = column;
      column.up.down = node;
      column.up = node;
      column.size += 1;

      if (!first) {
        first = node;
      } else {
        node.left = first.left;
        node.right = first;
        first.left.right = node;
        first.left = node;
      }
    }
    return this;
  }

  solve({ limit = Infinity } = {}) {
    if (!(limit === Infinity || (Number.isInteger(limit) && limit >= 0))) {
      throw new RangeError('limit must be a non-negative integer or Infinity');
    }
    const solutions = [];
    if (limit === 0) return solutions;
    const partial = [];

    const cover = column => {
      column.right.left = column.left;
      column.left.right = column.right;
      for (let row = column.down; row !== column; row = row.down) {
        for (let node = row.right; node !== row; node = node.right) {
          node.down.up = node.up;
          node.up.down = node.down;
          node.column.size -= 1;
        }
      }
    };

    const uncover = column => {
      for (let row = column.up; row !== column; row = row.up) {
        for (let node = row.left; node !== row; node = node.left) {
          node.column.size += 1;
          node.down.up = node;
          node.up.down = node;
        }
      }
      column.right.left = column;
      column.left.right = column;
    };

    const search = () => {
      if (solutions.length >= limit) return;
      if (this.root.right === this.root) {
        solutions.push(partial.slice());
        return;
      }

      let chosen = null;
      for (let column = this.root.right; column !== this.root; column = column.right) {
        if (!chosen || column.size < chosen.size) chosen = column;
      }
      if (!chosen || chosen.size === 0) return;

      cover(chosen);
      for (let row = chosen.down; row !== chosen && solutions.length < limit; row = row.down) {
        partial.push(row.rowId);
        for (let node = row.right; node !== row; node = node.right) cover(node.column);
        search();
        for (let node = row.left; node !== row; node = node.left) uncover(node.column);
        partial.pop();
      }
      uncover(chosen);
    };

    search();
    return solutions;
  }
}

// ------------------------------- Tests ----------------------------------
if (require.main === module) {
  const assert = require('node:assert/strict');
  const puzzle = new ExactCover(['A', 'B', 'C', 'D']);
  puzzle.addRow('r1', [0, 2]).addRow('r2', [1, 3])
    .addRow('r3', [0, 3]).addRow('r4', [1, 2]);
  const solutions = puzzle.solve().map(rows => rows.slice().sort()).sort((a, b) => a[0].localeCompare(b[0]));
  assert.deepEqual(solutions, [['r1', 'r2'], ['r3', 'r4']]);
  assert.equal(puzzle.solve({ limit: 1 }).length, 1);

  const impossible = new ExactCover(['X', 'Y', 'Z']);
  impossible.addRow('only-x-y', [0, 1]);
  assert.deepEqual(impossible.solve(), []);
  assert.deepEqual(new ExactCover([]).solve(), [[]]);
  assert.throws(() => puzzle.addRow('bad', [0, 0]), /same column/);
  assert.throws(() => puzzle.solve({ limit: -1 }), /limit/);
  console.log('Dancing Links exact-cover tests passed');
}

module.exports = { ExactCover };
