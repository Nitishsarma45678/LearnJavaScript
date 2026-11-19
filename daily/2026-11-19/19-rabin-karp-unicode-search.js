'use strict';

/**
 * Exercise: Implement Rabin-Karp substring search over Unicode code points.
 *
 * BigInt modular arithmetic avoids precision loss in rolling-hash products.
 * Hash matches are always verified character-by-character, so collisions
 * cannot produce false-positive results.
 */

function rabinKarp(text, pattern, options = {}) {
  if (typeof text !== 'string' || typeof pattern !== 'string') {
    throw new TypeError('text and pattern must be strings');
  }
  const base = options.base === undefined ? 257n : options.base;
  const modulus = options.modulus === undefined ? 1000000007n : options.modulus;
  if (typeof base !== 'bigint' || typeof modulus !== 'bigint' || base <= 0n || modulus <= 1n) {
    throw new RangeError('base and modulus must be positive BigInts; modulus must exceed 1');
  }

  const source = Array.from(text, (character) => BigInt(character.codePointAt(0)));
  const target = Array.from(pattern, (character) => BigInt(character.codePointAt(0)));
  const n = source.length;
  const m = target.length;

  if (m === 0) return Array.from({ length: n + 1 }, (_, index) => index);
  if (m > n) return [];

  let highestPower = 1n;
  for (let index = 1; index < m; index += 1) {
    highestPower = (highestPower * base) % modulus;
  }

  let patternHash = 0n;
  let windowHash = 0n;
  for (let index = 0; index < m; index += 1) {
    patternHash = (patternHash * base + target[index]) % modulus;
    windowHash = (windowHash * base + source[index]) % modulus;
  }

  const matches = [];
  for (let start = 0; start <= n - m; start += 1) {
    if (windowHash === patternHash) {
      let equal = true;
      for (let offset = 0; offset < m; offset += 1) {
        if (source[start + offset] !== target[offset]) {
          equal = false;
          break;
        }
      }
      if (equal) matches.push(start);
    }

    if (start < n - m) {
      const removed = (source[start] * highestPower) % modulus;
      windowHash = (windowHash - removed + modulus) % modulus;
      windowHash = (windowHash * base + source[start + m]) % modulus;
    }
  }

  return matches;
}

function runTests() {
  const assert = require('node:assert/strict');
  assert.deepEqual(rabinKarp('abracadabra', 'abra'), [0, 7]);
  assert.deepEqual(rabinKarp('aaaaa', 'aa'), [0, 1, 2, 3]);
  assert.deepEqual(rabinKarp('short', 'longer'), []);
  assert.deepEqual(rabinKarp('abc', ''), [0, 1, 2, 3]);
  assert.deepEqual(rabinKarp('🐈a🐈a', '🐈a'), [0, 2]);

  // With this tiny modulus, different two-character strings collide.
  // Verification must prevent the collision from being reported as a match.
  assert.deepEqual(rabinKarp('ab', 'ba', { base: 2n, modulus: 2n }), []);

  assert.throws(() => rabinKarp(123, '2'), /strings/);
  assert.throws(() => rabinKarp('abc', 'a', { modulus: 1n }), /modulus/);
}

if (require.main === module) {
  runTests();
  console.log('Rabin-Karp Unicode search: all tests passed');
}

module.exports = { rabinKarp };
