// 2D Fenwick tree supporting point additions and half-open rectangle sums.
function assert(condition, message = "Assertion failed") {
  if (!condition) throw new Error(message);
}
function assertEqual(actual, expected, message) {
  if (!Object.is(actual, expected)) throw new Error(message || `Expected ${expected}, received ${actual}`);
}

class FenwickTree2D {
  constructor(rows, columns) {
    if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(columns) || columns < 1) {
      throw new RangeError("rows and columns must be positive integers");
    }
    this.rows = rows;
    this.columns = columns;
    this.tree = Array.from({ length: rows + 1 }, () => new Float64Array(columns + 1));
  }

  _checkCell(row, column) {
    if (!Number.isInteger(row) || !Number.isInteger(column) ||
        row < 0 || row >= this.rows || column < 0 || column >= this.columns) {
      throw new RangeError("cell out of range");
    }
  }

  add(row, column, delta) {
    this._checkCell(row, column);
    if (!Number.isFinite(delta)) throw new TypeError("delta must be finite");
    for (let r = row + 1; r <= this.rows; r += r & -r) {
      for (let c = column + 1; c <= this.columns; c += c & -c) {
        this.tree[r][c] += delta;
      }
    }
  }

  // Sum of cells in [0, rowEnd) x [0, columnEnd).
  prefixSum(rowEnd, columnEnd) {
    if (!Number.isInteger(rowEnd) || !Number.isInteger(columnEnd) ||
        rowEnd < 0 || rowEnd > this.rows || columnEnd < 0 || columnEnd > this.columns) {
      throw new RangeError("prefix boundary out of range");
    }
    let sum = 0;
    for (let r = rowEnd; r > 0; r -= r & -r) {
      for (let c = columnEnd; c > 0; c -= c & -c) {
        sum += this.tree[r][c];
      }
    }
    return sum;
  }

  // Sum of cells in [rowStart, rowEnd) x [columnStart, columnEnd).
  rangeSum(rowStart, columnStart, rowEnd, columnEnd) {
    if (![rowStart, columnStart, rowEnd, columnEnd].every(Number.isInteger) ||
        rowStart < 0 || columnStart < 0 || rowEnd < rowStart ||
        columnEnd < columnStart || rowEnd > this.rows || columnEnd > this.columns) {
      throw new RangeError("invalid rectangle");
    }
    return this.prefixSum(rowEnd, columnEnd)
      - this.prefixSum(rowStart, columnEnd)
      - this.prefixSum(rowEnd, columnStart)
      + this.prefixSum(rowStart, columnStart);
  }

  static fromMatrix(matrix) {
    if (!Array.isArray(matrix) || matrix.length === 0 || !Array.isArray(matrix[0]) || matrix[0].length === 0) {
      throw new TypeError("matrix must be non-empty and rectangular");
    }
    const columns = matrix[0].length;
    if (matrix.some(row => !Array.isArray(row) || row.length !== columns)) {
      throw new TypeError("matrix must be rectangular");
    }
    const bit = new FenwickTree2D(matrix.length, columns);
    matrix.forEach((row, r) => row.forEach((value, c) => bit.add(r, c, value)));
    return bit;
  }
}

async function runTests() {
  const bit = FenwickTree2D.fromMatrix([
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9]
  ]);
  assertEqual(bit.prefixSum(2, 2), 12);
  assertEqual(bit.rangeSum(0, 0, 3, 3), 45);
  assertEqual(bit.rangeSum(1, 1, 3, 3), 28);
  bit.add(1, 1, 10);
  assertEqual(bit.rangeSum(1, 1, 2, 2), 15);
  assertEqual(bit.rangeSum(0, 0, 3, 3), 55);
  let threw = false;
  try { bit.rangeSum(2, 2, 1, 1); } catch (error) { threw = error instanceof RangeError; }
  assert(threw, "reversed rectangle must throw");
  console.log("2D Fenwick tree tests passed");
}
runTests().catch(error => { console.error(error); process.exitCode = 1; });
