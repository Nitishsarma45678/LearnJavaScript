"use strict";

const assert = require("node:assert/strict");

/**
 * Matrix-chain multiplication order optimization.
 *
 * dimensions = [d0, d1, ..., dn] describes n matrices where Ai is
 * dimensions[i] by dimensions[i + 1]. Costs use BigInt to avoid overflow.
 * The algorithm optimizes scalar multiplication count; it does not multiply
 * the actual matrices.
 */
function matrixChainOrder(dimensions) {
  if (!Array.isArray(dimensions) || dimensions.length < 2) {
    throw new TypeError("dimensions must contain at least two entries");
  }
  if (dimensions.some(value => !Number.isSafeInteger(value) || value <= 0)) {
    throw new TypeError("each dimension must be a positive safe integer");
  }

  const count = dimensions.length - 1;
  const dims = dimensions.map(BigInt);
  const cost = Array.from({ length: count }, () => Array(count).fill(0n));
  const split = Array.from({ length: count }, () => Array(count).fill(-1));

  for (let length = 2; length <= count; length++) {
    for (let left = 0; left + length <= count; left++) {
      const right = left + length - 1;
      let best = null;

      for (let middle = left; middle < right; middle++) {
        const multiplicationCost =
          dims[left] * dims[middle + 1] * dims[right + 1];
        const candidate =
          cost[left][middle] + cost[middle + 1][right] + multiplicationCost;

        // Strict comparison makes ties deterministic: retain the earliest split.
        if (best === null || candidate < best) {
          best = candidate;
          split[left][right] = middle;
        }
      }
      cost[left][right] = best;
    }
  }

  function buildParenthesization(left, right) {
    if (left === right) return "A" + (left + 1);
    const middle = split[left][right];
    return "(" + buildParenthesization(left, middle) +
      buildParenthesization(middle + 1, right) + ")";
  }

  return {
    cost: cost[0][count - 1],
    parenthesization: buildParenthesization(0, count - 1),
    split
  };
}

// Classic case: multiplying A1*A2 first is much cheaper.
{
  const result = matrixChainOrder([10, 30, 5, 60]);
  assert.equal(result.cost, 4500n);
  assert.equal(result.parenthesization, "((A1A2)A3)");
}

// A known four-matrix example.
{
  const result = matrixChainOrder([40, 20, 30, 10, 30]);
  assert.equal(result.cost, 26000n);
  assert.equal(result.parenthesization, "((A1(A2A3))A4)");
}

// Equal dimensions create equal-cost alternatives; tie-breaking is stable.
{
  const result = matrixChainOrder([2, 2, 2, 2]);
  assert.equal(result.cost, 16n);
  assert.equal(result.parenthesization, "(A1(A2A3))");
}

// BigInt preserves costs beyond Number.MAX_SAFE_INTEGER.
{
  const result = matrixChainOrder([1000000, 1000000, 1000000]);
  assert.equal(result.cost, 1000000000000000000n);
  assert.equal(result.parenthesization, "(A1A2)");
}

assert.throws(() => matrixChainOrder([10]), TypeError);
assert.throws(() => matrixChainOrder([10, 0, 5]), TypeError);
assert.throws(() => matrixChainOrder([10, Number.MAX_SAFE_INTEGER + 1]), TypeError);

console.log("matrix-chain-order: all assertions passed");
