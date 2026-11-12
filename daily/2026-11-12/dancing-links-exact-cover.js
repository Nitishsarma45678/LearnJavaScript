/**
 * Dancing Links (Algorithm X) — exact cover solver.
 *
 * Exercise:
 * Given rows that each cover a subset of columns, find collections of rows
 * that cover every column exactly once. Implement Knuth's reversible
 * cover/uncover operations with sparse circular doubly linked lists.
 *
 * Complexity: search is exponential in the worst case; choosing the
 * smallest remaining column is the standard minimum-remaining-values
 * heuristic. Sparse updates are proportional to the nodes removed/restored.
 *
 * Run: node dancing-links-exact-cover.js
 */

class DancingLinks {
  constructor(columnCount, rows) {
    if (!Number.isInteger(columnCount) || columnCount < 0) {
      throw new TypeError("columnCount must be a non-negative integer");
    }
    this.root = this._header("root");
    this.columns = Array.from({ length: columnCount }, (_, i) => this._header(i));
    for (const column of this.columns) {
      column.left = this.root.left;
      column.right = this.root;
      this.root.left.right = column;
      this.root.left = column;
    }
    this.rowIds = new Set();

    for (const entry of rows) {
      if (!entry || !Object.prototype.hasOwnProperty.call(entry, "id") ||
          !Array.isArray(entry.columns)) {
        throw new TypeError("each row must be { id, columns }");
      }
      if (this.rowIds.has(entry.id)) throw new Error("row ids must be unique");
      this.rowIds.add(entry.id);
      const indexes = [...new Set(entry.columns)];
      if (indexes.length !== entry.columns.length) {
        throw new Error(`row ${String(entry.id)} contains duplicate columns`);
      }
      if (indexes.length === 0) throw new Error("exact-cover rows cannot be empty");
      let first = null;
      for (const index of indexes) {
        if (!Number.isInteger(index) || index < 0 || index >= columnCount) {
          throw new RangeError(`invalid column index: ${index}`);
        }
        const column = this.columns[index];
        const node = { rowId: entry.id, column, left: null, right: null, up: column.up, down: column };
        column.up.down = node;
        column.up = node;
        column.size++;
        if (first === null) {
          first = node;
          node.left = node.right = node;
        } else {
          node.left = first.left;
          node.right = first;
          first.left.right = node;
          first.left = node;
        }
      }
    }
  }

  _header(name) {
    const header = { name, size: 0, left: null, right: null, up: null, down: null };
    header.left = header.right = header.up = header.down = header;
    return header;
  }

  _cover(column) {
    column.right.left = column.left;
    column.left.right = column.right;
    for (let row = column.down; row !== column; row = row.down) {
      for (let node = row.right; node !== row; node = node.right) {
        node.down.up = node.up;
        node.up.down = node.down;
        node.column.size--;
      }
    }
  }

  _uncover(column) {
    for (let row = column.up; row !== column; row = row.up) {
      for (let node = row.left; node !== row; node = node.left) {
        node.column.size++;
        node.down.up = node;
        node.up.down = node;
      }
    }
    column.right.left = column;
    column.left.right = column;
  }

  _chooseColumn() {
    let best = this.root.right;
    for (let column = best.right; column !== this.root; column = column.right) {
      if (column.size < best.size) best = column;
      if (best.size === 0) break;
    }
    return best;
  }

  solve({ limit = Infinity } = {}) {
    if (!(limit === Infinity || (Number.isInteger(limit) && limit > 0))) {
      throw new RangeError("limit must be a positive integer or Infinity");
    }
    const solutions = [];
    const partial = [];

    const search = () => {
      if (solutions.length >= limit) return;
      if (this.root.right === this.root) {
        solutions.push(partial.slice());
        return;
      }

      const column = this._chooseColumn();
      if (column.size === 0) return;
      this._cover(column);

      for (let row = column.down; row !== column && solutions.length < limit; row = row.down) {
        partial.push(row.rowId);
        for (let node = row.right; node !== row; node = node.right) {
          this._cover(node.column);
        }

        search();

        for (let node = row.left; node !== row; node = node.left) {
          this._uncover(node.column);
        }
        partial.pop();
      }
      this._uncover(column);
    };

    search();
    return solutions;
  }
}

function runTests() {
  const assert = require("node:assert/strict");
  const rows = [
    { id: "A", columns: [0, 1] },
    { id: "B", columns: [2, 3] },
    { id: "C", columns: [0, 2] },
    { id: "D", columns: [1, 3] },
    { id: "E", columns: [0] },
    { id: "F", columns: [1, 2, 3] }
  ];
  const solver = new DancingLinks(4, rows);
  const solutions = solver.solve().map(solution => solution.slice().sort()).sort();
  assert.deepEqual(solutions, [["A", "B"], ["C", "D"], ["E", "F"]]);
  assert.equal(solver.solve({ limit: 1 }).length, 1, "solver must be reusable after search");
  assert.deepEqual(new DancingLinks(0, []).solve(), [[]]);
  assert.deepEqual(new DancingLinks(3, [
    { id: "left", columns: [0, 1] },
    { id: "right", columns: [1, 2] }
  ]).solve(), []);
  assert.throws(() => new DancingLinks(2, [{ id: "x", columns: [0, 0] }]), /duplicate/);
  assert.throws(() => new DancingLinks(2, [{ id: "x", columns: [2] }]), /invalid/);
  console.log("DancingLinks: all tests passed");
}

if (require.main === module) runTests();
module.exports = { DancingLinks };
