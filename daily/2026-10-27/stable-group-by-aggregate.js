"use strict";
// Stable grouping and aggregation using Map, so keys can be strings, objects,
// symbols, null, or undefined without prototype-key collisions.
const assert = require("node:assert/strict");

function groupBy(items, keyFn) {
  if (!Array.isArray(items)) throw new TypeError("items must be an array");
  if (typeof keyFn !== "function") throw new TypeError("keyFn must be a function");
  const groups = new Map();
  items.forEach((item, index) => {
    const key = keyFn(item, index, items);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return groups;
}

function aggregateBy(items, keyFn, createAccumulator, reducer) {
  if (!Array.isArray(items)) throw new TypeError("items must be an array");
  if (typeof keyFn !== "function" || typeof createAccumulator !== "function" ||
      typeof reducer !== "function") {
    throw new TypeError("keyFn, createAccumulator, and reducer must be functions");
  }
  const aggregates = new Map();
  items.forEach((item, index) => {
    const key = keyFn(item, index, items);
    if (!aggregates.has(key)) aggregates.set(key, createAccumulator(key));
    const next = reducer(aggregates.get(key), item, index, key);
    aggregates.set(key, next);
  });
  return aggregates;
}

// Example tests: stable order, safe special keys, and per-group accumulators.
const records = [
  { team: "blue", points: 4 },
  { team: "red", points: 7 },
  { team: "blue", points: 3 },
  { team: "__proto__", points: 2 },
  { team: "red", points: 1 }
];
const groups = groupBy(records, (record) => record.team);
assert.deepEqual([...groups.keys()], ["blue", "red", "__proto__"]);
assert.deepEqual(groups.get("blue").map((r) => r.points), [4, 3]);
assert.equal(groups.get("red").length, 2);

const totals = aggregateBy(
  records,
  (record) => record.team,
  () => ({ count: 0, points: 0 }),
  (acc, record) => ({
    count: acc.count + 1,
    points: acc.points + record.points
  })
);
assert.deepEqual(totals.get("blue"), { count: 2, points: 7 });
assert.deepEqual(totals.get("red"), { count: 2, points: 8 });
assert.deepEqual(totals.get("__proto__"), { count: 1, points: 2 });

const sharedObjectKey = {};
const keyed = groupBy([1, 2, 3], (n) => n === 2 ? sharedObjectKey : undefined);
assert.deepEqual(keyed.get(undefined), [1, 3]);
assert.deepEqual(keyed.get(sharedObjectKey), [2]);
assert.equal(groupBy([], () => "unused").size, 0);
assert.throws(() => groupBy({}, () => 1), /items must be an array/);
assert.throws(() => aggregateBy([], () => 0, null, () => 0), /must be functions/);
console.log("Stable grouping and aggregation tests passed");
