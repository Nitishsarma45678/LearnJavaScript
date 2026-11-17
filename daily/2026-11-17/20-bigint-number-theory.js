'use strict';

/**
 * BigInt Number Theory Toolkit
 * ----------------------------
 * Exact BigInt gcd / modular exponentiation, deterministic Miller-Rabin
 * primality testing for unsigned 64-bit integers, and Pollard-Brent rho
 * factorization. No floating-point arithmetic is used for number theory.
 *
 * isPrime() is deterministic for 0 <= n < 2^64 and rejects larger inputs so
 * callers do not mistake a probable-prime result for a proof. factorize()
 * returns sorted [prime, exponent] pairs and accepts positive 64-bit values.
 */

const UINT64_LIMIT = 1n << 64n;
const MILLER_RABIN_BASES_64 = [2n, 325n, 9375n, 28178n, 450775n, 9780504n, 1795265022n];

function assertBigInt(value, name) {
  if (typeof value !== 'bigint') throw new TypeError(`${name} must be a BigInt`);
}

function gcd(a, b) {
  assertBigInt(a, 'a');
  assertBigInt(b, 'b');
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function modPow(base, exponent, modulus) {
  assertBigInt(base, 'base');
  assertBigInt(exponent, 'exponent');
  assertBigInt(modulus, 'modulus');
  if (modulus <= 0n) throw new RangeError('modulus must be positive');
  if (exponent < 0n) throw new RangeError('exponent must be non-negative');
  let result = 1n % modulus;
  base = ((base % modulus) + modulus) % modulus;
  while (exponent > 0n) {
    if (exponent & 1n) result = (result * base) % modulus;
    base = (base * base) % modulus;
    exponent >>= 1n;
  }
  return result;
}

function isPrime(value) {
  assertBigInt(value, 'value');
  if (value < 0n) return false;
  if (value >= UINT64_LIMIT) throw new RangeError('deterministic primality is limited to unsigned 64-bit integers');
  if (value < 2n) return false;
  for (const prime of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) {
    if (value === prime) return true;
    if (value % prime === 0n) return false;
  }
  let oddPart = value - 1n;
  let powersOfTwo = 0;
  while ((oddPart & 1n) === 0n) { oddPart >>= 1n; powersOfTwo += 1; }
  for (const rawBase of MILLER_RABIN_BASES_64) {
    const base = rawBase % value;
    if (base === 0n) continue;
    let witness = modPow(base, oddPart, value);
    if (witness === 1n || witness === value - 1n) continue;
    let probablyComposite = true;
    for (let round = 1; round < powersOfTwo; round += 1) {
      witness = (witness * witness) % value;
      if (witness === value - 1n) { probablyComposite = false; break; }
    }
    if (probablyComposite) return false;
  }
  return true;
}

function pollardBrent(value, attempt, iterationLimit = 2_000_000) {
  if (value % 2n === 0n) return 2n;
  if (value % 3n === 0n) return 3n;
  const c = BigInt(attempt * 2 + 1) % (value - 1n) + 1n;
  let y = (BigInt(attempt * 3 + 2) % (value - 2n)) + 2n;
  const batchSize = 128;
  let g = 1n;
  let r = 1;
  let q = 1n;
  let x = 0n;
  let savedY = 0n;
  let iterations = 0;
  const step = (number) => (number * number + c) % value;

  while (g === 1n && iterations < iterationLimit) {
    x = y;
    for (let index = 0; index < r; index += 1) {
      y = step(y);
      iterations += 1;
      if (iterations >= iterationLimit) return null;
    }
    let offset = 0;
    while (offset < r && g === 1n) {
      savedY = y;
      const count = Math.min(batchSize, r - offset);
      q = 1n;
      for (let index = 0; index < count; index += 1) {
        y = step(y);
        q = (q * (x >= y ? x - y : y - x)) % value;
        iterations += 1;
      }
      g = gcd(q, value);
      offset += count;
    }
    r *= 2;
  }
  if (g === value) {
    do {
      savedY = step(savedY);
      g = gcd(x >= savedY ? x - savedY : savedY - x, value);
      iterations += 1;
    } while (g === 1n && iterations < iterationLimit);
  }
  return g > 1n && g < value ? g : null;
}

function factorize(value) {
  assertBigInt(value, 'value');
  if (value <= 0n) throw new RangeError('value must be a positive integer');
  if (value >= UINT64_LIMIT) throw new RangeError('factorization is limited to unsigned 64-bit integers');
  if (value === 1n) return [];
  const factors = [];
  const pending = [value];
  let attempt = 0;
  while (pending.length) {
    const current = pending.pop();
    if (current === 1n) continue;
    if (isPrime(current)) {
      factors.push(current);
      continue;
    }
    let divisor = null;
    for (let retry = 0; retry < 24 && divisor === null; retry += 1) {
      divisor = pollardBrent(current, attempt++);
    }
    if (divisor === null) throw new Error(`Pollard-Brent failed to split ${current}`);
    pending.push(divisor, current / divisor);
  }
  factors.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const grouped = [];
  for (const prime of factors) {
    const last = grouped[grouped.length - 1];
    if (last && last[0] === prime) last[1] += 1;
    else grouped.push([prime, 1]);
  }
  return grouped;
}

function runTests() {
  const assert = require('node:assert/strict');
  assert.equal(gcd(-84n, 30n), 6n);
  assert.equal(gcd(0n, 0n), 0n);
  assert.equal(modPow(2n, 100n, 1000000007n), 976371285n);
  assert.equal(isPrime(2n), true);
  assert.equal(isPrime(18446744073709551557n), true);
  assert.equal(isPrime(1n), false);
  assert.equal(isPrime(341550071728321n), false);
  assert.equal(isPrime(3825123056546413051n), false);
  assert.throws(() => isPrime(1n << 64n), /64-bit/);
  assert.deepEqual(factorize(1n), []);
  assert.deepEqual(factorize(600851475143n), [[71n, 1], [839n, 1], [1471n, 1], [6857n, 1]]);
  assert.deepEqual(factorize(360n), [[2n, 3], [3n, 2], [5n, 1]]);
  assert.deepEqual(factorize(1000000007n * 1000000009n), [[1000000007n, 1], [1000000009n, 1]]);
  assert.throws(() => factorize(0n), /positive/);
  assert.throws(() => modPow(2n, -1n, 7n), /non-negative/);

  for (let number = 2n; number < 500n; number += 1n) {
    let expectedPrime = true;
    for (let divisor = 2n; divisor * divisor <= number; divisor += 1n) {
      if (number % divisor === 0n) { expectedPrime = false; break; }
    }
    assert.equal(isPrime(number), expectedPrime, `primality mismatch at ${number}`);
    const factors = factorize(number);
    const reconstructed = factors.reduce((product, [prime, exponent]) => product * (prime ** BigInt(exponent)), 1n);
    assert.equal(reconstructed, number, `factorization mismatch at ${number}`);
    assert.ok(factors.every(([prime]) => isPrime(prime)));
  }
}

if (require.main === module) {
  runTests();
  console.log('BigInt Number Theory Toolkit: all tests passed');
}

module.exports = { gcd, modPow, isPrime, factorize, UINT64_LIMIT };
