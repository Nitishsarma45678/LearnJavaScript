/**
 * BigInt primality testing and Pollard-Rho factorization.
 *
 * Miller-Rabin is deterministic for inputs below 2^64 (the published
 * seven-base set) and probable-prime testing for larger BigInts.
 * Pollard-Rho uses deterministic retries so examples are reproducible.
 *
 * Run: node bigint-pollard-rho-factorization.js
 */
"use strict";

const TWO_64 = 1n << 64n;
const SMALL_PRIMES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];
const BASES_64 = [2n, 325n, 9375n, 28178n, 450775n, 9780504n, 1795265022n];
const BASES_LARGE = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n];

function toBigInt(value, label = "value") {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value);
  throw new TypeError(label + " must be a BigInt, integer string, or safe integer");
}

function abs(value) {
  return value < 0n ? -value : value;
}

function gcd(a, b) {
  a = abs(a);
  b = abs(b);
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function modPow(base, exponent, modulus) {
  if (modulus <= 0n) throw new RangeError("Modulus must be positive");
  if (exponent < 0n) throw new RangeError("Exponent must be non-negative");
  let result = 1n;
  base = ((base % modulus) + modulus) % modulus;
  while (exponent > 0n) {
    if (exponent & 1n) result = (result * base) % modulus;
    base = (base * base) % modulus;
    exponent >>= 1n;
  }
  return result;
}

function isProbablePrime(input) {
  const n = toBigInt(input);
  if (n < 2n) return false;
  for (const prime of SMALL_PRIMES) {
    if (n === prime) return true;
    if (n % prime === 0n) return false;
  }

  let d = n - 1n;
  let powersOfTwo = 0;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    powersOfTwo++;
  }

  const bases = n < TWO_64 ? BASES_64 : BASES_LARGE;
  for (const rawBase of bases) {
    const base = rawBase % n;
    if (base === 0n) continue;
    let witness = modPow(base, d, n);
    if (witness === 1n || witness === n - 1n) continue;

    let probablyComposite = true;
    for (let round = 1; round < powersOfTwo; round++) {
      witness = (witness * witness) % n;
      if (witness === n - 1n) {
        probablyComposite = false;
        break;
      }
    }
    if (probablyComposite) return false;
  }
  return true;
}

function pollardRho(input, options = {}) {
  const n = toBigInt(input);
  if (n < 2n) throw new RangeError("Pollard-Rho requires n >= 2");
  if (n % 2n === 0n) return 2n;
  for (const prime of SMALL_PRIMES.slice(1)) {
    if (n % prime === 0n) return prime;
  }
  if (isProbablePrime(n)) return n;

  const maxIterations = options.maxIterations ?? 400000;
  const maxAttempts = options.maxAttempts ?? 40;
  if (!Number.isSafeInteger(maxIterations) || maxIterations < 1 ||
      !Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError("Iteration and attempt limits must be positive safe integers");
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const constant = BigInt(attempt);
    let x = BigInt(attempt + 1) % n;
    let y = x;
    let divisor = 1n;
    let iterations = 0;
    const step = value => (value * value + constant) % n;

    while (divisor === 1n && iterations < maxIterations) {
      x = step(x);
      y = step(step(y));
      divisor = gcd(abs(x - y), n);
      iterations++;
    }
    if (divisor > 1n && divisor < n) return divisor;
  }
  throw new Error("Pollard-Rho did not find a factor within the configured budget");
}

function factorize(input, options = {}) {
  const value = toBigInt(input, "integer");
  if (value < 1n) throw new RangeError("factorize expects a positive integer");
  if (value === 1n) return [];

  const factors = [];
  function split(n) {
    if (n === 1n) return;
    if (isProbablePrime(n)) {
      factors.push(n);
      return;
    }
    const divisor = pollardRho(n, options);
    split(divisor);
    split(n / divisor);
  }
  split(value);
  factors.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  return factors;
}

function runTests() {
  const assert = require("node:assert/strict");
  assert.equal(isProbablePrime(2n), true);
  assert.equal(isProbablePrime(97n), true);
  assert.equal(isProbablePrime(1n), false);
  assert.equal(isProbablePrime(561n), false);
  assert.equal(isProbablePrime(18446744073709551557n), true);
  assert.equal(modPow(7n, 128n, 13n), 3n);
  assert.equal(gcd(1234567890n, 9876543210n), 90n);
  assert.deepEqual(factorize(1n), []);
  assert.deepEqual(factorize(360n), [2n, 2n, 2n, 3n, 3n, 5n]);
  assert.deepEqual(factorize(600851475143n), [71n, 839n, 1471n, 6857n]);
  assert.deepEqual(factorize(3n ** 12n), Array(12).fill(3n));
  const semiprime = 1000000007n * 1000000009n;
  assert.deepEqual(factorize(semiprime), [1000000007n, 1000000009n]);
  for (const value of [2n, 97n, 360n, 600851475143n, semiprime]) {
    const product = factorize(value).reduce((acc, factor) => acc * factor, 1n);
    assert.equal(product, value);
  }
  assert.throws(() => factorize(0n), RangeError);
  assert.throws(() => factorize(-12n), RangeError);
  assert.throws(() => modPow(2n, -1n, 7n), RangeError);
  return { passed: 19 };
}

if (typeof require !== "undefined" && require.main === module) {
  console.log("Pollard-Rho factorization: " + runTests().passed + " checks passed");
}
if (typeof module !== "undefined") {
  module.exports = { gcd, modPow, isProbablePrime, pollardRho, factorize, runTests };
}
