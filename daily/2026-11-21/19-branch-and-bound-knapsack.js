// Exercise: Solve 0/1 knapsack using branch-and-bound.
// Use a fractional-knapsack upper bound to prune search branches. Return the selected
// original item indexes, total weight, and maximum value.

function solveKnapsack(items, capacity) {
  if (!Array.isArray(items)) throw new TypeError("items must be an array");
  if (!Number.isFinite(capacity) || capacity < 0) {
    throw new RangeError("capacity must be non-negative and finite");
  }

  const ordered = items.map((item, index) => {
    if (!item || !Number.isFinite(item.weight) || item.weight < 0 ||
        !Number.isFinite(item.value)) {
      throw new TypeError("each item needs a non-negative finite weight and finite value");
    }
    return { ...item, originalIndex: index };
  }).sort((a, b) => {
    const ratioA = a.weight === 0 ? Infinity : a.value / a.weight;
    const ratioB = b.weight === 0 ? Infinity : b.value / b.weight;
    return ratioB - ratioA;
  });

  let bestValue = 0;
  let bestWeight = 0;
  let bestIndexes = [];

  function upperBound(index, currentWeight, currentValue) {
    let remaining = capacity - currentWeight;
    let bound = currentValue;
    for (let i = index; i < ordered.length; i++) {
      const item = ordered[i];
      if (item.value <= 0) continue;
      if (item.weight === 0) {
        bound += item.value;
      } else if (item.weight <= remaining) {
        bound += item.value;
        remaining -= item.weight;
      } else {
        bound += item.value * (remaining / item.weight);
        break;
      }
    }
    return bound;
  }

  function search(index, weight, value, chosen) {
    if (value > bestValue || (value === bestValue && weight < bestWeight)) {
      bestValue = value;
      bestWeight = weight;
      bestIndexes = chosen.slice();
    }
    if (index === ordered.length || upperBound(index, weight, value) <= bestValue) return;

    const item = ordered[index];
    if (weight + item.weight <= capacity) {
      chosen.push(item.originalIndex);
      search(index + 1, weight + item.weight, value + item.value, chosen);
      chosen.pop();
    }
    search(index + 1, weight, value, chosen);
  }

  search(0, 0, 0, []);
  bestIndexes.sort((a, b) => a - b);
  return { value: bestValue, weight: bestWeight, indexes: bestIndexes };
}

// Tests
const assert = require("node:assert/strict");
const items = [
  { weight: 2, value: 40 },
  { weight: 3, value: 50 },
  { weight: 5, value: 100 },
  { weight: 4, value: 60 }
];
const result = solveKnapsack(items, 7);
assert.equal(result.value, 140);
assert.equal(result.weight, 7);
assert.deepEqual(result.indexes, [0, 2]);

assert.deepEqual(solveKnapsack([
  { weight: 0, value: 5 },
  { weight: 2, value: 3 },
  { weight: 1, value: -10 }
], 2), { value: 8, weight: 2, indexes: [0, 1] });

assert.deepEqual(solveKnapsack([{ weight: 1, value: 10 }], 0), {
  value: 0, weight: 0, indexes: []
});
assert.throws(() => solveKnapsack([{ weight: -1, value: 2 }], 5), TypeError);
console.log("branch-and-bound knapsack tests passed");
