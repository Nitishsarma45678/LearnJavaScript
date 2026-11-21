// Exercise: Implement Knuth's Dancing Links (DLX) algorithm for exact cover.
// Each input row is identified by an arbitrary ID and contains zero-based column indexes.
// Return one exact-cover solution or null when no solution exists.

function solveExactCover(columnCount, inputRows) {
  if (!Number.isInteger(columnCount) || columnCount < 1) {
    throw new RangeError("columnCount must be positive");
  }
  if (!Array.isArray(inputRows)) throw new TypeError("inputRows must be an array");

  function makeNode(column = null, rowId = null) {
    return { L: null, R: null, U: null, D: null, C: column, rowId };
  }

  const root = makeNode();
  root.L = root.R = root.U = root.D = root;
  const columns = [];

  for (let i = 0; i < columnCount; i++) {
    const header = makeNode();
    header.name = i;
    header.size = 0;
    header.U = header.D = header;
    header.L = root.L;
    header.R = root;
    root.L.R = header;
    root.L = header;
    columns.push(header);
  }

  const seenIds = new Set();
  for (const row of inputRows) {
    if (!row || !Array.isArray(row.columns) || row.columns.length === 0) {
      throw new TypeError("each row must contain at least one column");
    }
    if (seenIds.has(row.id)) throw new TypeError("row IDs must be unique");
    seenIds.add(row.id);
    const indexes = [...new Set(row.columns)];
    if (indexes.length !== row.columns.length ||
        indexes.some(index => !Number.isInteger(index) || index < 0 || index >= columnCount)) {
      throw new RangeError("row contains an invalid or duplicate column index");
    }

    let first = null;
    for (const index of indexes) {
      const header = columns[index];
      const node = makeNode(header, row.id);
      node.U = header.U;
      node.D = header;
      header.U.D = node;
      header.U = node;
      header.size++;

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

  const solution = [];
  function search() {
    if (root.R === root) return true;

    let chosen = root.R;
    for (let column = chosen.R; column !== root; column = column.R) {
      if (column.size < chosen.size) chosen = column;
    }
    if (chosen.size === 0) return false;

    cover(chosen);
    for (let row = chosen.D; row !== chosen; row = row.D) {
      solution.push(row.rowId);
      for (let node = row.R; node !== row; node = node.R) cover(node.C);

      if (search()) return true;

      solution.pop();
      for (let node = row.L; node !== row; node = node.L) uncover(node.C);
    }
    uncover(chosen);
    return false;
  }

  return search() ? solution.slice() : null;
}

// Tests: classic seven-column exact-cover example.
const assert = require("node:assert/strict");
const rows = [
  { id: "A", columns: [0, 3, 6] },
  { id: "B", columns: [0, 3] },
  { id: "C", columns: [3, 4, 6] },
  { id: "D", columns: [2, 4, 5] },
  { id: "E", columns: [1, 2, 5, 6] },
  { id: "F", columns: [1, 6] }
];
const solution = solveExactCover(7, rows);
assert.deepEqual(new Set(solution), new Set(["B", "D", "F"]));
assert.equal(solveExactCover(3, [
  { id: "x", columns: [0, 1] },
  { id: "y", columns: [1, 2] }
]), null);
assert.throws(() => solveExactCover(2, [{ id: "bad", columns: [0, 0] }]), RangeError);
console.log("Dancing Links tests passed");
