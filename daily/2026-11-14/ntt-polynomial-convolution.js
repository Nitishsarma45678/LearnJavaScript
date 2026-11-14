/**
 * Number Theoretic Transform (NTT) Polynomial Toolkit
 * --------------------------------------------------
 * Multiplies polynomials modulo 998244353 using an iterative radix-2 NTT.
 * Coefficients are BigInts so every modular multiplication is exact in JS.
 *
 * Includes binary polynomial exponentiation and Horner evaluation.
 * Supported transform length: at most 2^23.
 *
 * Run: node ntt-polynomial-convolution.js
 */

'use strict';

const assert = require('node:assert/strict');

const MOD = 998244353n;
const PRIMITIVE_ROOT = 3n;
const MAX_TRANSFORM_SIZE = 1 << 23;

function mod(value, modulus = MOD) {
  const result = value % modulus;
  return result < 0n ? result + modulus : result;
}

function modPow(base, exponent, modulus = MOD) {
  if (exponent < 0n) throw new RangeError('exponent must be non-negative');
  let factor = mod(base, modulus);
  let power = exponent;
  let result = 1n;

  while (power > 0n) {
    if (power & 1n) result = (result * factor) % modulus;
    factor = (factor * factor) % modulus;
    power >>= 1n;
  }
  return result;
}

function asBigIntCoefficient(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return BigInt(value);
  }
  throw new TypeError('coefficients must be BigInts or safe integer Numbers');
}

function transform(values, inverse = false) {
  const n = values.length;
  if (n === 0 || (n & (n - 1)) !== 0) {
    throw new RangeError('NTT length must be a positive power of two');
  }
  if (n > MAX_TRANSFORM_SIZE) {
    throw new RangeError('transform exceeds the modulus-supported length');
  }
  if ((Number(MOD - 1n) % n) !== 0) {
    throw new RangeError('transform length does not divide MOD - 1');
  }

  const a = values.map((value) => mod(value));
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    while ((j & bit) !== 0) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) [a[i], a[j]] = [a[j], a[i]];
  }

  for (let length = 2; length <= n; length *= 2) {
    let root = modPow(PRIMITIVE_ROOT, (MOD - 1n) / BigInt(length));
    if (inverse) root = modPow(root, MOD - 2n);

    const half = length >> 1;
    for (let start = 0; start < n; start += length) {
      let factor = 1n;
      for (let offset = 0; offset < half; offset += 1) {
        const even = a[start + offset];
        const odd = (a[start + offset + half] * factor) % MOD;
        a[start + offset] = (even + odd) % MOD;
        a[start + offset + half] = mod(even - odd);
        factor = (factor * root) % MOD;
      }
    }
  }

  if (inverse) {
    const inverseLength = modPow(BigInt(n), MOD - 2n);
    for (let i = 0; i < n; i += 1) {
      a[i] = (a[i] * inverseLength) % MOD;
    }
  }
  return a;
}

function convolveMod(first, second) {
  if (!Array.isArray(first) || !Array.isArray(second)) {
    throw new TypeError('polynomials must be arrays');
  }
  if (first.length === 0 || second.length === 0) return [];

  const resultLength = first.length + second.length - 1;
  let size = 1;
  while (size < resultLength) size *= 2;
  if (size > MAX_TRANSFORM_SIZE) {
    throw new RangeError('polynomial product exceeds supported transform size');
  }

  const left = new Array(size).fill(0n);
  const right = new Array(size).fill(0n);
  for (let i = 0; i < first.length; i += 1) {
    left[i] = mod(asBigIntCoefficient(first[i]));
  }
  for (let i = 0; i < second.length; i += 1) {
    right[i] = mod(asBigIntCoefficient(second[i]));
  }

  const transformedLeft = transform(left);
  const transformedRight = transform(right);
  const product = transformedLeft.map(
    (value, index) => (value * transformedRight[index]) % MOD
  );
  return transform(product, true).slice(0, resultLength);
}

function polynomialPower(polynomial, exponent) {
  if (!Array.isArray(polynomial)) throw new TypeError('polynomial must be an array');
  if (!Number.isSafeInteger(exponent) || exponent < 0) {
    throw new RangeError('exponent must be a non-negative safe integer');
  }
  if (polynomial.length === 0 && exponent > 0) return [];

  let power = exponent;
  let base = polynomial.map((value) => mod(asBigIntCoefficient(value)));
  let result = [1n];

  while (power > 0) {
    if (power % 2 === 1) result = convolveMod(result, base);
    power = Math.floor(power / 2);
    if (power > 0) base = convolveMod(base, base);
  }
  return result;
}

function evaluatePolynomial(polynomial, x) {
  if (!Array.isArray(polynomial)) throw new TypeError('polynomial must be an array');
  const point = mod(asBigIntCoefficient(x));
  let result = 0n;
  for (let i = polynomial.length - 1; i >= 0; i -= 1) {
    result = (result * point + mod(asBigIntCoefficient(polynomial[i]))) % MOD;
  }
  return result;
}

function trimPolynomial(polynomial) {
  const result = polynomial.map((value) => mod(asBigIntCoefficient(value)));
  while (result.length > 0 && result[result.length - 1] === 0n) result.pop();
  return result;
}

// ------------------------------ Example tests ------------------------------

function naiveConvolution(a, b) {
  if (a.length === 0 || b.length === 0) return [];
  const result = new Array(a.length + b.length - 1).fill(0n);
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      result[i + j] = mod(result[i + j] + mod(a[i]) * mod(b[j]));
    }
  }
  return result;
}

function runTests() {
  assert.deepEqual(convolveMod([1, 2, 3], [4, 5]), [4n, 13n, 22n, 15n]);
  assert.deepEqual(convolveMod([], [1, 2]), []);
  assert.deepEqual(convolveMod([7], [9]), [63n]);
  assert.deepEqual(convolveMod([-1, 2], [3, -4]), [MOD - 3n, 10n, MOD - 8n]);
  assert.deepEqual(polynomialPower([1, 1], 3), [1n, 3n, 3n, 1n]);
  assert.equal(evaluatePolynomial([1, 3, 3, 1], 2), 27n);
  assert.deepEqual(trimPolynomial([0, 4, 0, 0]), [0n, 4n]);
  assert.deepEqual(polynomialPower([12345678901234567890n], 2), [
    mod(12345678901234567890n ** 2n)
  ]);

  let seed = 0x4e771;
  const random = (limit) => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return seed % limit;
  };
  for (let trial = 0; trial < 180; trial += 1) {
    const a = Array.from({ length: random(25) }, () => BigInt(random(2001) - 1000));
    const b = Array.from({ length: random(25) }, () => BigInt(random(2001) - 1000));
    assert.deepEqual(convolveMod(a, b), naiveConvolution(a, b));
  }

  assert.throws(() => transform([1n, 2n, 3n]), RangeError);
  assert.throws(() => convolveMod([1.5], [2]), TypeError);
  console.log('NTT polynomial toolkit: all tests passed');
}

if (require.main === module) runTests();

module.exports = {
  MOD,
  mod,
  modPow,
  transform,
  convolveMod,
  polynomialPower,
  evaluatePolynomial,
  trimPolynomial
};
