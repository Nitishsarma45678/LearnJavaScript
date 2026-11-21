// Exercise: Find the non-empty rectangular submatrix with the maximum sum.
// Return its sum and inclusive coordinates. The algorithm compresses one dimension and
// applies Kadane's algorithm, giving O(min(rows, cols)^2 * max(rows, cols)) time.

function maximumSumSubmatrix(matrix) {
  if (!Array.isArray(matrix) || matrix.length === 0 ||
      !Array.isArray(matrix[0]) || matrix[0].length === 0) {
    throw new TypeError("matrix must be non-empty");
  }
  const rows = matrix.length;
  const columns = matrix[0].length;
  if (matrix.some(row => !Array.isArray(row) || row.length !== columns ||
      row.some(value => !Number.isFinite(value)))) {
    throw new TypeError("matrix must be rectangular and contain finite numbers");
  }

  let best = { sum: -Infinity, top: 0, left: 0, bottom: 0, right: 0 };

  if (rows <= columns) {
    for (let top = 0; top < rows; top++) {
      const compressed = Array(columns).fill(0);
      for (let bottom = top; bottom < rows; bottom++) {
        for (let c = 0; c < columns; c++) compressed[c] += matrix[bottom][c];

        let current = compressed[0];
        let start = 0;
        for (let c = 0; c < columns; c++) {
          if (c === 0 || current < 0) {
            current = compressed[c];
            start = c;
          } else {
            current += compressed[c];
          }
          if (current > best.sum) {
            best = { sum: current, top, left: start, bottom, right: c };
          }
        }
      }
    }
  } else {
    for (let left = 0; left < columns; left++) {
      const compressed = Array(rows).fill(0);
      for (let right = left; right < columns; right++) {
        for (let r = 0; r < rows; r++) compressed[r] += matrix[r][right];

        let current = compressed[0];
        let start = 0;
        for (let r = 0; r < rows; r++) {
          if (r === 0 || current < 0) {
            current = compressed[r];
            start = r;
          } else {
            current += compressed[r];
          }
          if (current > best.sum) {
            best = { sum: current, top: start, left, bottom: r, right };
          }
        }
      }
    }
  }
  return best;
}

// Tests
const assert = require("node:assert/strict");
assert.deepEqual(maximumSumSubmatrix([
  [1, 2, -1],
  [-3, 4, 5],
  [2, -1, 3]
]), { sum: 13, top: 1, left: 1, bottom: 2, right: 2 });

assert.deepEqual(maximumSumSubmatrix([[-8, -2], [-5, -9]]), {
  sum: -2, top: 0, left: 1, bottom: 0, right: 1
});
assert.deepEqual(maximumSumSubmatrix([[1, 2, 3]]), {
  sum: 6, top: 0, left: 0, bottom: 0, right: 2
});
assert.throws(() => maximumSumSubmatrix([]), TypeError);
console.log("maximum sum submatrix tests passed");
