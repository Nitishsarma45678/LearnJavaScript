/**
 * Polynomial convolution using the Number Theoretic Transform.
 *
 * Uses the NTT-friendly prime 998244353 and primitive root 3. Coefficients
 * are normalized modulo the prime and represented as BigInts. The maximum
 * transform length is 2^23, the largest supported power of two for this prime.
 *
 * Run: node number-theoretic-transform-convolution.js
 */
"use strict";

const MOD = 998244353n;
const PRIMITIVE_ROOT = 3n;
const MAX_TRANSFORM_SIZE = 1 << 23;

function mod(value, modulus = MOD) {
  const remainder = value % modulus;
  return remainder < 0n ? remainder + modulus : remainder;
}

function modPow(base, exponent, modulus = MOD) {
  let result = 1n;
  base = mod(base, modulus);
  while (exponent > 0n) {
    if (exponent & 1n) result = (result * base) % modulus;
    base = (base * base) % modulus;
    exponent >>= 1n;
  }
  return result;
}

function normalizeCoefficient(value) {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("Numeric coefficients must be safe integers");
    value = BigInt(value);
  } else if (typeof value !== "bigint") {
    throw new TypeError("Coefficients must be BigInts or safe integers");
  }
  return mod(value);
}

function ntt(values, inverse = false) {
  const n = values.length;
  if (n < 1 || (n & (n - 1)) !== 0) {
    throw new RangeError("Transform length must be a positive power of two");
  }
  if (n > MAX_TRANSFORM_SIZE || (MOD - 1n) % BigInt(n) !== 0n) {
    throw new RangeError("Transform length is unsupported by the selected modulus");
  }

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) [values[i], values[j]] = [values[j], values[i]];
  }

  for (let length = 2; length <= n; length <<= 1) {
    let root = modPow(PRIMITIVE_ROOT, (MOD - 1n) / BigInt(length));
    if (inverse) root = modPow(root, MOD - 2n);
    const half = length >> 1;

    for (let start = 0; start < n; start += length) {
      let factor = 1n;
      for (let offset = 0; offset < half; offset++) {
        const even = values[start + offset];
        const odd = (values[start + offset + half] * factor) % MOD;
        values[start + offset] = (even + odd) % MOD;
        values[start + offset + half] = mod(even - odd);
        factor = (factor * root) % MOD;
      }
    }
  }

  if (inverse) {
    const inverseLength = modPow(BigInt(n), MOD - 2n);
    for (let i = 0; i < n; i++) values[i] = (values[i] * inverseLength) % MOD;
  }
  return values;
}

function convolution(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) {
    throw new TypeError("Polynomial coefficients must be arrays");
  }
  if (left.length === 0 || right.length === 0) return [];
  const resultLength = left.length + right.length - 1;
  let size = 1;
  while (size < resultLength) size <<= 1;
  if (size > MAX_TRANSFORM_SIZE) {
    throw new RangeError("Polynomial product exceeds the maximum NTT length");
  }

  const a = Array(size).fill(0n);
  const b = Array(size).fill(0n);
  for (let i = 0; i < left.length; i++) a[i] = normalizeCoefficient(left[i]);
  for (let i = 0; i < right.length; i++) b[i] = normalizeCoefficient(right[i]);

  ntt(a);
  ntt(b);
  for (let i = 0; i < size; i++) a[i] = (a[i] * b[i]) % MOD;
  ntt(a, true);
  return a.slice(0, resultLength);
}

function naiveConvolution(left, right) {
  if (left.length === 0 || right.length === 0) return [];
  const output = Array(left.length + right.length - 1).fill(0n);
  for (let i = 0; i < left.length; i++) {
    for (let j = 0; j < right.length; j++) {
      output[i + j] = mod(output[i + j] +
        normalizeCoefficient(left[i]) * normalizeCoefficient(right[j]));
    }
  }
  return output;
}

function runTests() {
  const assert = require("node:assert/strict");
  assert.deepEqual(convolution([1, 2, 3], [4, 5]), [4n, 13n, 22n, 15n]);
  assert.deepEqual(convolution([-1, 2], [3, -4]), [MOD - 3n, 10n, MOD - 8n]);
  assert.deepEqual(convolution([], [1, 2]), []);
  assert.deepEqual(convolution([0, 0], [9]), [0n, 0n]);
  assert.deepEqual(convolution([MOD + 2n], [MOD - 3n]), [MOD - 6n]);
  assert.equal(modPow(3n, 0n), 1n);
  assert.equal(modPow(3n, 2n), 9n);

  for (const size of [1, 2, 4, 8, 16, 32, 64]) {
    const original = Array.from({ length: size }, (_, i) => BigInt(i * i + 7));
    const transformed = original.map(value => mod(value));
    ntt(transformed);
    ntt(transformed, true);
    assert.deepEqual(transformed, original.map(value => mod(value)));
  }

  let seed = 0x31415926;
  const random = max => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % max;
  };
  for (let trial = 0; trial < 240; trial++) {
    const left = Array.from({ length: random(35) }, () => random(2001) - 1000);
    const right = Array.from({ length: random(35) }, () => random(2001) - 1000);
    assert.deepEqual(convolution(left, right), naiveConvolution(left, right));
  }
  assert.throws(() => convolution([1.5], [2]), TypeError);
  assert.throws(() => ntt([1n, 2n, 3n]), RangeError);
  return { passed: 16 + 240, randomizedTrials: 240 };
}

if (typeof require !== "undefined" && require.main === module) {
  const result = runTests();
  console.log("NTT convolution: " + result.passed + " checks passed");
}
if (typeof module !== "undefined") {
  module.exports = {
    MOD, PRIMITIVE_ROOT, modPow, ntt, convolution, naiveConvolution, runTests
  };
}
