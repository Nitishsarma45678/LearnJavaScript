'use strict';

const assert = require('node:assert/strict');

function factorial(n) {
  let result = 1n;
  for (let i = 2; i <= n; i++) result *= BigInt(i);
  return result;
}

function multinomial(counts) {
  const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
  let result = factorial(total);
  for (const count of counts.values()) result /= factorial(count);
  return result;
}

function frequencies(items) {
  const counts = new Map();
  for (const item of items) counts.set(item, (counts.get(item) || 0) + 1);
  return counts;
}

function sortedKeys(counts, compare) {
  return Array.from(counts.keys()).sort(compare);
}

function rankMultisetPermutation(items, compare = (a, b) => String(a).localeCompare(String(b))) {
  const counts = frequencies(items);
  const keys = sortedKeys(counts, compare);
  let rank = 0n;

  for (const actual of items) {
    if (!counts.has(actual) || counts.get(actual) === 0) throw new TypeError('Permutation does not match multiset');
    for (const candidate of keys) {
      if (compare(candidate, actual) >= 0) break;
      const available = counts.get(candidate);
      if (!available) continue;
      counts.set(candidate, available - 1);
      rank += multinomial(counts);
      counts.set(candidate, available);
    }
    counts.set(actual, counts.get(actual) - 1);
  }
  return rank;
}

function unrankMultisetPermutation(multiset, rank, compare = (a, b) => String(a).localeCompare(String(b))) {
  const counts = frequencies(multiset);
  const total = multinomial(counts);
  if (typeof rank !== 'bigint' || rank < 0n || rank >= total) throw new RangeError('Rank outside permutation range');
  const keys = sortedKeys(counts, compare);
  const result = [];

  while (result.length < multiset.length) {
    let selected = false;
    for (const candidate of keys) {
      const available = counts.get(candidate);
      if (!available) continue;
      counts.set(candidate, available - 1);
      const block = multinomial(counts);
      if (rank < block) {
        result.push(candidate);
        selected = true;
        break;
      }
      rank -= block;
      counts.set(candidate, available);
    }
    if (!selected) throw new Error('Unranking invariant failed');
  }
  return result;
}

const multiset = ['a', 'a', 'b', 'c'];
const permutations = [];
for (let rank = 0n; rank < 12n; rank++) {
  const permutation = unrankMultisetPermutation(multiset, rank);
  assert.equal(rankMultisetPermutation(permutation), rank);
  permutations.push(permutation.join(''));
}
assert.equal(new Set(permutations).size, 12);
assert.deepEqual(unrankMultisetPermutation(['x', 'x', 'y'], 0n), ['x', 'x', 'y']);
assert.deepEqual(unrankMultisetPermutation(['x', 'x', 'y'], 2n), ['y', 'x', 'x']);
assert.throws(() => unrankMultisetPermutation(multiset, 12n), RangeError);
console.log('Multiset rank/unrank examples passed.');

module.exports = { rankMultisetPermutation, unrankMultisetPermutation, multinomial };
