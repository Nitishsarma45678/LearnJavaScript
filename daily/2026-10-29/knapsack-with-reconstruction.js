/**
 * 0/1 knapsack with reconstruction of selected item indices.
 * Tie policy: if taking an item does not strictly improve value, skip it.
 *
 * Run: node daily/2026-10-29/knapsack-with-reconstruction.js
 */
const assert = require("node:assert/strict");

function solveKnapsack(items, capacity) {
  if (!Array.isArray(items)) throw new TypeError("items must be an array");
  if (!Number.isInteger(capacity) || capacity < 0) {
    throw new RangeError("capacity must be a non-negative integer");
  }
  items.forEach((item, index) => {
    if (!item || !Number.isInteger(item.weight) || item.weight <= 0) {
      throw new TypeError("item " + index + " must have a positive integer weight");
    }
    if (!Number.isFinite(item.value)) {
      throw new TypeError("item " + index + " must have a finite value");
    }
  });

  const n = items.length;
  const best = Array.from({ length: n + 1 },
    () => Array(capacity + 1).fill(0));
  const take = Array.from({ length: n + 1 },
    () => Array(capacity + 1).fill(false));

  for (let i = 1; i <= n; i += 1) {
    const { weight, value } = items[i - 1];
    for (let remaining = 0; remaining <= capacity; remaining += 1) {
      best[i][remaining] = best[i - 1][remaining];
      if (weight <= remaining) {
        const candidate = best[i - 1][remaining - weight] + value;
        if (candidate > best[i][remaining]) {
          best[i][remaining] = candidate;
          take[i][remaining] = true;
        }
      }
    }
  }

  const selectedIndices = [];
  let remaining = capacity;
  for (let i = n; i >= 1; i -= 1) {
    if (take[i][remaining]) {
      selectedIndices.push(i - 1);
      remaining -= items[i - 1].weight;
    }
  }
  selectedIndices.reverse();

  const totalWeight = selectedIndices.reduce((sum, index) => sum + items[index].weight, 0);
  return {
    maxValue: best[n][capacity],
    totalWeight,
    selectedIndices,
    selectedItems: selectedIndices.map((index) => items[index])
  };
}

if (require.main === module) {
  const items = [
    { name: "camera", weight: 10, value: 60 },
    { name: "laptop", weight: 20, value: 100 },
    { name: "projector", weight: 30, value: 120 }
  ];
  const result = solveKnapsack(items, 50);
  assert.equal(result.maxValue, 220);
  assert.equal(result.totalWeight, 50);
  assert.deepEqual(result.selectedIndices, [1, 2]);
  assert.equal(solveKnapsack([], 8).maxValue, 0);
  assert.deepEqual(solveKnapsack([{ weight: 1, value: -5 }], 1).selectedIndices, []);
  assert.deepEqual(solveKnapsack([
    { weight: 2, value: 3 }, { weight: 2, value: 3 }
  ], 2).selectedIndices, [0], "equal-value ties prefer the earlier item");
  assert.throws(() => solveKnapsack(items, -1), RangeError);
  assert.throws(() => solveKnapsack([{ weight: 0, value: 1 }], 2), TypeError);
  console.log("knapsack-with-reconstruction: all assertions passed");
}

module.exports = { solveKnapsack };
