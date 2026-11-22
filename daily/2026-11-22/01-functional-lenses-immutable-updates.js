/**
 * Exercise: Functional lenses for immutable nested updates
 *
 * Implement composable lenses that focus on one part of an immutable structure.
 * A lens has a getter and a setter; setting must preserve untouched references.
 *
 * Run: node 01-functional-lenses-immutable-updates.js
 */
"use strict";
const assert = require("node:assert/strict");

const lens = (get, set) => ({ get, set });
const view = (optic, source) => optic.get(source);
const set = (optic, value, source) => optic.set(value, source);
const over = (optic, transform, source) => set(optic, transform(view(optic, source)), source);

function propLens(key) {
  return lens(
    object => object == null ? undefined : object[key],
    (value, object) => {
      if (object === null || typeof object !== "object") {
        throw new TypeError("A property lens requires an object or array");
      }
      if (Array.isArray(object)) {
        const copy = object.slice();
        copy[key] = value;
        return copy;
      }
      return Object.assign(Object.create(Object.getPrototypeOf(object)), object, { [key]: value });
    }
  );
}

function indexLens(index) {
  if (!Number.isInteger(index) || index < 0) throw new RangeError("index must be non-negative");
  return lens(
    array => array?.[index],
    (value, array) => {
      if (!Array.isArray(array)) throw new TypeError("An index lens requires an array");
      const copy = array.slice();
      copy[index] = value;
      return copy;
    }
  );
}

function compose(outer, inner) {
  return lens(
    source => inner.get(outer.get(source)),
    (value, source) => outer.set(inner.set(value, outer.get(source)), source)
  );
}

// A traversal-like helper updates every element matching a predicate.
function overWhere(array, predicate, transform) {
  let changed = false;
  const result = array.map((value, index) => {
    if (!predicate(value, index)) return value;
    changed = true;
    return transform(value, index);
  });
  return changed ? result : array;
}

const profile = propLens("profile");
const city = compose(profile, propLens("city"));
const firstScore = compose(propLens("scores"), indexLens(0));

const original = {
  id: 7,
  profile: { city: "Guwahati", active: true },
  scores: [10, 20],
};
const moved = set(city, "Shillong", original);
assert.equal(view(city, moved), "Shillong");
assert.equal(view(city, original), "Guwahati");
assert.notEqual(moved, original);
assert.notEqual(moved.profile, original.profile);
assert.equal(moved.scores, original.scores); // untouched branch is shared

const improved = over(firstScore, score => score + 5, original);
assert.deepEqual(improved.scores, [15, 20]);
assert.deepEqual(original.scores, [10, 20]);
assert.deepEqual(overWhere([1, 2, 3, 4], n => n % 2 === 0, n => n * 10), [1, 20, 3, 40]);
assert.throws(() => indexLens(-1), RangeError);
console.log("functional lens tests passed");

module.exports = { lens, view, set, over, propLens, indexLens, compose, overWhere };
