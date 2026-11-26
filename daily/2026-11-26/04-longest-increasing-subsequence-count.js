'use strict';

// Exercise: compute the LIS length, count index-distinct optimal subsequences,
// and reconstruct the lexicographically earliest sequence of source indices.
// The O(n^2) implementation prioritizes clarity and exact BigInt counting.

const assert = require('node:assert/strict');

function lexicographicallyEarlier(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return a.length < b.length;
}

function analyzeLIS(values) {
  if (!Array.isArray(values) || values.some((x) => typeof x !== 'number' || !Number.isFinite(x))) {
    throw new TypeError('values must be an array of finite numbers');
  }
  const n = values.length;
  if (n === 0) return { length: 0, count: 0n, indices: [], sequence: [] };

  const lengths = Array(n).fill(1);
  const counts = Array(n).fill(1n);
  const paths = Array.from({ length: n }, (_, i) => [i]);

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (values[j] >= values[i]) continue;
      const candidateLength = lengths[j] + 1;
      const candidatePath = [...paths[j], i];
      if (candidateLength > lengths[i]) {
        lengths[i] = candidateLength;
        counts[i] = counts[j];
        paths[i] = candidatePath;
      } else if (candidateLength === lengths[i]) {
        counts[i] += counts[j];
        if (lexicographicallyEarlier(candidatePath, paths[i])) paths[i] = candidatePath;
      }
    }
  }

  const best = Math.max(...lengths);
  const endpoints = lengths.map((length, i) => length === best ? i : -1).filter((i) => i >= 0);
  const count = endpoints.reduce((sum, i) => sum + counts[i], 0n);
  const indices = endpoints.map((i) => paths[i])
    .reduce((bestPath, path) => !bestPath || lexicographicallyEarlier(path, bestPath) ? path : bestPath, null);

  return { length: best, count, indices, sequence: indices.map((i) => values[i]) };
}

assert.deepEqual(analyzeLIS([1, 3, 5, 4, 7]), {
  length: 4, count: 2n, indices: [0, 1, 2, 4], sequence: [1, 3, 5, 7]
});
assert.equal(analyzeLIS([2, 2, 2]).count, 3n);
assert.deepEqual(analyzeLIS([5, 4, 3]).indices, [0]);
assert.deepEqual(analyzeLIS([]), { length: 0, count: 0n, indices: [], sequence: [] });
assert.throws(() => analyzeLIS([1, Infinity]), TypeError);

module.exports = { analyzeLIS };
