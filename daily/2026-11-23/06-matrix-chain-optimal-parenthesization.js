// Exercise: Find the minimum scalar multiplication cost for a matrix chain
// and reconstruct an optimal parenthesization.
//
// dimensions = [d0, d1, ..., dn] describes matrices Ai with shape
// dimensions[i] x dimensions[i + 1].
//
// Run: node 06-matrix-chain-optimal-parenthesization.js
const assert = require("node:assert/strict");

function matrixChainOrder(dimensions) {
  if (!Array.isArray(dimensions) || dimensions.length < 2 ||
      dimensions.some((n) => !Number.isSafeInteger(n) || n <= 0)) {
    throw new TypeError("dimensions must contain at least two positive safe integers");
  }

  const n = dimensions.length - 1;
  const cost = Array.from({ length: n }, () => Array(n).fill(0));
  const split = Array.from({ length: n }, () => Array(n).fill(-1));

  for (let length = 2; length <= n; length += 1) {
    for (let left = 0; left + length <= n; left += 1) {
      const right = left + length - 1;
      cost[left][right] = Infinity;

      for (let middle = left; middle < right; middle += 1) {
        const candidate = cost[left][middle] + cost[middle + 1][right] +
          dimensions[left] * dimensions[middle + 1] * dimensions[right + 1];
        if (candidate < cost[left][right]) {
          cost[left][right] = candidate;
          split[left][right] = middle;
        }
      }
    }
  }

  function build(left, right) {
    if (left === right) return "A" + (left + 1);
    const middle = split[left][right];
    return "(" + build(left, middle) + " x " + build(middle + 1, right) + ")";
  }

  return {
    minimumCost: cost[0][n - 1],
    parenthesization: build(0, n - 1),
    costTable: cost,
    splitTable: split
  };
}

// Example tests
{
  const classic = matrixChainOrder([30, 35, 15, 5, 10, 20, 25]);
  assert.equal(classic.minimumCost, 15125);
  assert.equal(classic.parenthesization, "((A1 x (A2 x A3)) x ((A4 x A5) x A6))");

  const one = matrixChainOrder([7, 11]);
  assert.equal(one.minimumCost, 0);
  assert.equal(one.parenthesization, "A1");

  assert.throws(() => matrixChainOrder([2, 0, 3]), /positive/);
  assert.throws(() => matrixChainOrder([2]), /at least two/);
}
console.log("matrix-chain tests passed");
