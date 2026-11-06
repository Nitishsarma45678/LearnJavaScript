'use strict';

const assert = require('node:assert/strict');

function abs(value) { return value < 0n ? -value : value; }

function gcd(a, b) {
  a = abs(a); b = abs(b);
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function extendedGcd(a, b) {
  let oldR = a, r = b;
  let oldS = 1n, s = 0n;
  let oldT = 0n, t = 1n;
  while (r !== 0n) {
    const quotient = oldR / r;
    [oldR, r] = [r, oldR - quotient * r];
    [oldS, s] = [s, oldS - quotient * s];
    [oldT, t] = [t, oldT - quotient * t];
  }
  if (oldR < 0n) return { gcd: -oldR, x: -oldS, y: -oldT };
  return { gcd: oldR, x: oldS, y: oldT };
}

function mod(value, modulus) {
  const remainder = value % modulus;
  return remainder < 0n ? remainder + modulus : remainder;
}

function modInverse(value, modulus) {
  if (modulus <= 0n) throw new RangeError('modulus must be positive');
  if (modulus === 1n) return 0n;
  const result = extendedGcd(mod(value, modulus), modulus);
  if (result.gcd !== 1n) throw new RangeError('modular inverse does not exist');
  return mod(result.x, modulus);
}

/**
 * Combine x = a (mod m) and x = b (mod n), including non-coprime moduli.
 * Returns null when the congruenses are inconsistent; otherwise returns the
 * canonical residue in [0, lcm(m,n)) and the combined modulus.
 */
function combineCongruences(a, m, b, n) {
  for (const [name, value] of [['a', a], ['m', m], ['b', b], ['n', n]]) {
    if (typeof value !== 'bigint') throw new TypeError(`${name} must be BigInt`);
  }
  if (m <= 0n || n <= 0n) throw new RangeError('moduli must be positive');

  const common = gcd(m, n);
  const difference = b - a;
  if (difference % common !== 0n) return null;

  const reducedM = m / common;
  const reducedN = n / common;
  const multiplier = reducedN === 1n
    ? 0n
    : mod((difference / common) * modInverse(reducedM, reducedN), reducedN);
  const combinedModulus = reducedM * n;
  const residue = mod(a + m * multiplier, combinedModulus);
  return { residue, modulus: combinedModulus };
}

function solveCongruences(congruences) {
  if (!Array.isArray(congruences)) throw new TypeError('congruences must be an array');
  let solution = { residue: 0n, modulus: 1n };
  for (const pair of congruences) {
    if (!Array.isArray(pair) || pair.length !== 2) {
      throw new TypeError('each congruence must be [residue, modulus]');
    }
    solution = combineCongruences(solution.residue, solution.modulus, pair[0], pair[1]);
    if (solution === null) return null;
  }
  return solution;
}

function ceilDiv(numerator, positiveDenominator) {
  if (positiveDenominator <= 0n) throw new RangeError('denominator must be positive');
  const quotient = numerator / positiveDenominator;
  const remainder = numerator % positiveDenominator;
  return remainder > 0n ? quotient + 1n : quotient;
}

function firstSolutionAtOrAfter(solution, lowerBound) {
  if (typeof lowerBound !== 'bigint') throw new TypeError('lowerBound must be BigInt');
  if (!solution || solution.modulus <= 0n) throw new TypeError('a valid solution is required');
  const steps = ceilDiv(lowerBound - solution.residue, solution.modulus);
  return solution.residue + steps * solution.modulus;
}

function runTests() {
  assert.deepEqual(combineCongruences(2n, 3n, 3n, 5n), {
    residue: 8n, modulus: 15n
  });
  assert.deepEqual(combineCongruences(4n, 6n, 10n, 14n), {
    residue: 10n, modulus: 42n
  });
  assert.equal(combineCongruences(1n, 2n, 0n, 4n), null);
  assert.deepEqual(combineCongruences(-1n, 5n, 4n, 5n), {
    residue: 4n, modulus: 5n
  });
  assert.deepEqual(solveCongruences([[2n, 3n], [3n, 5n], [2n, 7n]]), {
    residue: 23n, modulus: 105n
  });
  assert.equal(solveCongruences([[0n, 2n], [1n, 4n]]), null);
  assert.deepEqual(solveCongruences([]), { residue: 0n, modulus: 1n });
  assert.equal(firstSolutionAtOrAfter({ residue: 8n, modulus: 15n }, 100n), 113n);
  assert.equal(firstSolutionAtOrAfter({ residue: 8n, modulus: 15n }, -20n), -7n);
  assert.equal(modInverse(3n, 11n), 4n);
  assert.throws(() => modInverse(6n, 9n), /does not exist/);
  assert.throws(() => combineCongruences(1, 3n, 2n, 5n), /must be BigInt/);

  // Exhaustive differential check for small positive moduli and signed residues.
  for (let m = 1n; m <= 12n; m++) {
    for (let n = 1n; n <= 12n; n++) {
      const period = m / gcd(m, n) * n;
      for (let a = -2n; a <= m + 1n; a++) {
        for (let b = -2n; b <= n + 1n; b++) {
          const actual = combineCongruences(a, m, b, n);
          let first = null;
          for (let x = 0n; x < period; x++) {
            if (mod(x - a, m) === 0n && mod(x - b, n) === 0n) {
              first = x;
              break;
            }
          }
          if (first === null) assert.equal(actual, null);
          else {
            assert.deepEqual(actual, { residue: first, modulus: period });
          }
        }
      }
    }
  }

  const huge = solveCongruences([
    [123456789012345678901234567890n, 100000000000000000039n],
    [987654321098765432109876543210n, 100000000000000000061n]
  ]);
  assert.ok(huge && huge.residue >= 0n && huge.residue < huge.modulus);
  console.log('Generalized Chinese Remainder Theorem: all tests passed');
}

if (require.main === module) runTests();
module.exports = {
  gcd, extendedGcd, mod, modInverse, combineCongruences,
  solveCongruences, firstSolutionAtOrAfter
};
