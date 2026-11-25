'use strict';

// Exercise: multiply rectangular integer matrices using Strassen's seven
// recursive products. Pad to a power-of-two square and trim the result.

function add(A, B, sign = 1) {
  return A.map((row, i) => row.map((value, j) => value + sign * B[i][j]));
}
function split(A) {
  const n = A.length, half = n / 2;
  return [
    A.slice(0, half).map(row => row.slice(0, half)),
    A.slice(0, half).map(row => row.slice(half)),
    A.slice(half).map(row => row.slice(0, half)),
    A.slice(half).map(row => row.slice(half))
  ];
}
function join(C11, C12, C21, C22) {
  return [
    ...C11.map((row, i) => [...row, ...C12[i]]),
    ...C21.map((row, i) => [...row, ...C22[i]])
  ];
}
function multiplySquare(A, B, cutoff) {
  const n = A.length;
  if (n <= cutoff) {
    const C = Array.from({ length: n }, () => Array(n).fill(0));
    for (let i = 0; i < n; i++)
      for (let k = 0; k < n; k++)
        for (let j = 0; j < n; j++) C[i][j] += A[i][k] * B[k][j];
    return C;
  }

  const [A11, A12, A21, A22] = split(A);
  const [B11, B12, B21, B22] = split(B);
  const M1 = multiplySquare(add(A11, A22), add(B11, B22), cutoff);
  const M2 = multiplySquare(add(A21, A22), B11, cutoff);
  const M3 = multiplySquare(A11, add(B12, B22, -1), cutoff);
  const M4 = multiplySquare(A22, add(B21, B11, -1), cutoff);
  const M5 = multiplySquare(add(A11, A12), B22, cutoff);
  const M6 = multiplySquare(add(A21, A11, -1), add(B11, B12), cutoff);
  const M7 = multiplySquare(add(A12, A22, -1), add(B21, B22), cutoff);

  const C11 = add(add(add(M1, M4), M5, -1), M7);
  const C12 = add(M3, M5);
  const C21 = add(M2, M4);
  const C22 = add(add(add(M1, M2, -1), M3), M6);
  return join(C11, C12, C21, C22);
}

function strassenMultiply(A, B, { cutoff = 32 } = {}) {
  if (!Array.isArray(A) || !Array.isArray(B) || !A.length || !B.length) {
    throw new TypeError('matrices must be non-empty arrays');
  }
  const columns = A[0].length, shared = B.length, outputColumns = B[0].length;
  if (!columns || !outputColumns || A.some(row => row.length !== columns) ||
      B.some(row => row.length !== outputColumns) || columns !== shared) {
    throw new RangeError('incompatible or ragged matrices');
  }
  if (![...A, ...B].every(row => row.every(Number.isFinite))) throw new TypeError('matrix entries must be finite');
  if (!Number.isInteger(cutoff) || cutoff < 1) throw new RangeError('cutoff must be positive');

  let size = 1;
  while (size < Math.max(A.length, columns, outputColumns)) size *= 2;
  const left = Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (_, j) => A[i]?.[j] ?? 0));
  const right = Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (_, j) => B[i]?.[j] ?? 0));
  return multiplySquare(left, right, cutoff)
    .slice(0, A.length).map(row => row.slice(0, outputColumns));
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  assert.deepEqual(strassenMultiply([[1, 2], [3, 4]], [[5, 6], [7, 8]], { cutoff: 1 }),
    [[19, 22], [43, 50]]);
  assert.deepEqual(strassenMultiply([[1, 2, 3], [4, 5, 6]], [[7], [8], [9]], { cutoff: 1 }),
    [[50], [122]]);
  assert.deepEqual(strassenMultiply([[2]], [[3]], { cutoff: 1 }), [[6]]);
  assert.throws(() => strassenMultiply([[1, 2]], [[1, 2]]), RangeError);
  console.log('Strassen multiplication: all tests passed');
}

module.exports = { strassenMultiply };
