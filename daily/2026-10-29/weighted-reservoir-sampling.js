/**
 * Weighted reservoir sampling without storing the whole stream.
 *
 * For each item with positive weight w, draw U in (0, 1] and assign key
 * log(U) / w. Keeping the k largest keys gives a weighted sample without
 * replacement (Efraimidis-Spirakis method).
 */
"use strict";
const assert = require("node:assert/strict");

function weightedReservoir(items, k, weightOf, random = Math.random) {
  if (!Number.isInteger(k) || k < 0) throw new RangeError("k must be a non-negative integer");
  if (typeof weightOf !== "function" || typeof random !== "function") {
    throw new TypeError("weightOf and random must be functions");
  }
  if (k === 0) return [];
  // Min-heap ordered by key; the root is the weakest selected candidate.
  const heap = [];
  const swap = (i, j) => ([heap[i], heap[j]] = [heap[j], heap[i]]);
  function push(node) {
    heap.push(node);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].key <= heap[i].key) break;
      swap(p, i); i = p;
    }
  }
  function replaceRoot(node) {
    heap[0] = node;
    let i = 0;
    while (true) {
      const l = i * 2 + 1, r = l + 1;
      let smallest = i;
      if (l < heap.length && heap[l].key < heap[smallest].key) smallest = l;
      if (r < heap.length && heap[r].key < heap[smallest].key) smallest = r;
      if (smallest === i) break;
      swap(i, smallest); i = smallest;
    }
  }

  let index = 0;
  for (const item of items) {
    const weight = weightOf(item);
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new RangeError("every item must have a finite positive weight");
    }
    const u = random();
    if (!(u > 0 && u <= 1)) throw new RangeError("random() must return a value in (0, 1]");
    const candidate = { item, key: Math.log(u) / weight, index: index++ };
    if (heap.length < k) push(candidate);
    else if (candidate.key > heap[0].key) replaceRoot(candidate);
  }
  // Return in descending key order; index provides deterministic tie-breaking.
  return heap.sort((a, b) => b.key - a.key || a.index - b.index).map(entry => entry.item);
}

// Deterministic tests use a controlled stream of random values.
const sample = weightedReservoir(
  [{ id: "A", w: 1 }, { id: "B", w: 2 }, { id: "C", w: 3 }, { id: "D", w: 4 }],
  2,
  item => item.w,
  (() => { const values = [0.2, 0.8, 0.4, 0.95]; let i = 0; return () => values[i++]; })()
);
assert.equal(sample.length, 2);
assert.equal(new Set(sample.map(item => item.id)).size, 2);
assert.deepEqual(weightedReservoir([1, 2, 3], 0, () => 1), []);
assert.equal(weightedReservoir([1, 2], 9, () => 1, () => 0.5).length, 2);
assert.throws(() => weightedReservoir([1], 1, () => 0), RangeError);
assert.throws(() => weightedReservoir([1], 1, () => 1, () => 0), RangeError);

module.exports = { weightedReservoir };
