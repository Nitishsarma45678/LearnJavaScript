// Exercise: Sample one entry in proportion to its non-negative weight.
// Accept an injected random-number generator for deterministic tests.
// Entries look like { value: any, weight: number }. The input is not mutated.

"use strict";

function weightedSample(entries, rng = Math.random) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new TypeError("entries must be a non-empty array");
  }
  if (typeof rng !== "function") throw new TypeError("rng must be a function");

  let totalWeight = 0;
  let lastPositiveEntry;

  for (const entry of entries) {
    if (!entry || typeof entry.weight !== "number" ||
        !Number.isFinite(entry.weight) || entry.weight < 0) {
      throw new RangeError("each weight must be a finite non-negative number");
    }
    totalWeight += entry.weight;
    if (entry.weight > 0) lastPositiveEntry = entry;
  }

  if (!(totalWeight > 0) || !Number.isFinite(totalWeight)) {
    throw new RangeError("total weight must be finite and greater than zero");
  }

  const randomValue = rng();
  if (typeof randomValue !== "number" ||
      !Number.isFinite(randomValue) ||
      randomValue < 0 || randomValue >= 1) {
    throw new RangeError("rng must return a number in [0, 1)");
  }

  const threshold = randomValue * totalWeight;
  let cumulativeWeight = 0;
  for (const entry of entries) {
    cumulativeWeight += entry.weight;
    if (threshold < cumulativeWeight) return entry.value;
  }

  // Protect against floating-point accumulation at the upper boundary.
  return lastPositiveEntry.value;
}

module.exports = { weightedSample };

if (require.main === module) {
  const assert = require("node:assert/strict");
  const entries = [
    { value: "common", weight: 7 },
    { value: "rare", weight: 2 },
    { value: "legendary", weight: 1 }
  ];
  const original = entries.map((entry) => ({ ...entry }));

  assert.equal(weightedSample(entries, () => 0), "common");
  assert.equal(weightedSample(entries, () => 0.7), "rare");
  assert.equal(weightedSample(entries, () => 0.9), "legendary");
  assert.equal(weightedSample([{ value: "only", weight: 0 }, { value: "yes", weight: 4 }], () => 0.99), "yes");
  assert.deepEqual(entries, original, "sampling must not mutate input");
  assert.throws(() => weightedSample([], () => 0), TypeError);
  assert.throws(() => weightedSample([{ value: 1, weight: -1 }]), RangeError);
  assert.throws(() => weightedSample([{ value: 1, weight: 0 }]), RangeError);
  assert.throws(() => weightedSample(entries, () => 1), RangeError);
  console.log("weighted-random-sampler: all tests passed");
}
