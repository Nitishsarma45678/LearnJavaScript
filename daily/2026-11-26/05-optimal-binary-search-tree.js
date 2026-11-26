'use strict';

// Exercise: build an optimal BST from successful key probabilities p and
// unsuccessful gap probabilities q. Return expected search cost and tree shape.

const assert = require('node:assert/strict');

function optimalBST(keys, p, q) {
  if (!Array.isArray(keys) || !Array.isArray(p) || !Array.isArray(q) ||
      p.length !== keys.length || q.length !== keys.length + 1) {
    throw new TypeError('expected n keys, n successful weights, and n+1 gap weights');
  }
  const n = keys.length;
  const weights = [...p, ...q];
  if (weights.some((x) => typeof x !== 'number' || !Number.isFinite(x) || x < 0)) {
    throw new RangeError('probabilities must be finite non-negative numbers');
  }

  const cost = Array.from({ length: n + 2 }, () => Array(n + 1).fill(0));
  const sum = Array.from({ length: n + 2 }, () => Array(n + 1).fill(0));
  const root = Array.from({ length: n + 2 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= n + 1; i += 1) {
    cost[i][i - 1] = q[i - 1];
    sum[i][i - 1] = q[i - 1];
  }

  for (let length = 1; length <= n; length += 1) {
    for (let i = 1; i <= n - length + 1; i += 1) {
      const j = i + length - 1;
      sum[i][j] = sum[i][j - 1] + p[j - 1] + q[j];
      cost[i][j] = Infinity;
      for (let r = i; r <= j; r += 1) {
        const candidate = cost[i][r - 1] + cost[r + 1][j] + sum[i][j];
        if (candidate < cost[i][j]) {
          cost[i][j] = candidate;
          root[i][j] = r;
        }
      }
    }
  }

  function build(i, j) {
    if (i > j) return { dummy: i - 1 };
    const r = root[i][j];
    return { key: keys[r - 1], left: build(i, r - 1), right: build(r + 1, j) };
  }

  return { expectedCost: cost[1][n], tree: build(1, n), rootTable: root };
}

const sample = optimalBST(
  ['A', 'B', 'C', 'D', 'E'],
  [0.15, 0.10, 0.05, 0.10, 0.20],
  [0.05, 0.10, 0.05, 0.05, 0.05, 0.10]
);
assert.equal(Number(sample.expectedCost.toFixed(2)), 2.75);
assert.equal(sample.tree.key, 'B');
assert.deepEqual(optimalBST([], [], [0.4]).tree, { dummy: 0 });
assert.throws(() => optimalBST(['x'], [0.5], [0.2]), TypeError);

module.exports = { optimalBST };
