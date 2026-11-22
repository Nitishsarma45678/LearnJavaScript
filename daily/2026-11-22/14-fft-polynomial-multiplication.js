/**
 * Exercise: Multiply two real-coefficient polynomials using iterative FFT.
 * Coefficients are stored from lowest to highest degree. The implementation
 * uses radix-2 Cooley-Tukey transforms and returns floating-point coefficients.
 * Run: node 14-fft-polynomial-multiplication.js
 */
"use strict";
const assert = require("node:assert/strict");

function nextPowerOfTwo(value) {
  let size = 1;
  while (size < value) size *= 2;
  return size;
}

function fft(real, imag, inverse = false) {
  const n = real.length;
  if (n !== imag.length || (n & (n - 1)) !== 0) throw new RangeError("FFT length must be a power of two");
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  for (let len = 2; len <= n; len *= 2) {
    const angle = (inverse ? 2 : -2) * Math.PI / len;
    const stepReal = Math.cos(angle), stepImag = Math.sin(angle);
    for (let start = 0; start < n; start += len) {
      let wr = 1, wi = 0;
      for (let j = 0; j < len / 2; j++) {
        const even = start + j, odd = even + len / 2;
        const tr = wr * real[odd] - wi * imag[odd];
        const ti = wr * imag[odd] + wi * real[odd];
        const er = real[even], ei = imag[even];
        real[even] = er + tr; imag[even] = ei + ti;
        real[odd] = er - tr; imag[odd] = ei - ti;
        const nextWr = wr * stepReal - wi * stepImag;
        wi = wr * stepImag + wi * stepReal;
        wr = nextWr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) { real[i] /= n; imag[i] /= n; }
  }
}

function multiplyPolynomials(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || !b.length ||
      [...a, ...b].some(value => !Number.isFinite(value))) {
    throw new TypeError("polynomials must be non-empty arrays of finite numbers");
  }
  const outputLength = a.length + b.length - 1;
  const size = nextPowerOfTwo(outputLength);
  const ar = Array(size).fill(0), ai = Array(size).fill(0);
  const br = Array(size).fill(0), bi = Array(size).fill(0);
  a.forEach((value, i) => { ar[i] = value; });
  b.forEach((value, i) => { br[i] = value; });
  fft(ar, ai); fft(br, bi);
  for (let i = 0; i < size; i++) {
    const real = ar[i] * br[i] - ai[i] * bi[i];
    const imag = ar[i] * bi[i] + ai[i] * br[i];
    ar[i] = real; ai[i] = imag;
  }
  fft(ar, ai, true);
  return ar.slice(0, outputLength);
}

const result = multiplyPolynomials([1, 2, 3], [4, 5]);
assert.deepEqual(result.map(Math.round), [4, 13, 22, 15]);
const identity = multiplyPolynomials([7, -2], [1]);
assert.ok(Math.abs(identity[0] - 7) < 1e-9 && Math.abs(identity[1] + 2) < 1e-9);
assert.deepEqual(multiplyPolynomials([0], [3, 4]).map(Math.round), [0, 0]);
assert.throws(() => multiplyPolynomials([], [1]), TypeError);
console.log("FFT polynomial multiplication tests passed");
module.exports = { fft, multiplyPolynomials };
