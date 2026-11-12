'use strict';

const assert = require('node:assert/strict');

function cloneContainer(value) {
  if (Array.isArray(value)) return value.slice();
  if (value && typeof value === 'object') return Object.assign(Object.create(Object.getPrototypeOf(value)), value);
  throw new TypeError('Cannot immutably update a non-object focus');
}

function lens(get, set) {
  if (typeof get !== 'function' || typeof set !== 'function') throw new TypeError('lens needs get and set functions');
  return Object.freeze({ get, set });
}

function prop(key) {
  return lens(
    source => source == null ? undefined : source[key],
    (source, value) => {
      if (source == null || typeof source !== 'object') throw new TypeError('Cannot set property ' + String(key) + ' on non-object');
      const copy = cloneContainer(source);
      copy[key] = value;
      return copy;
    }
  );
}

function index(position) {
  if (!Number.isInteger(position) || position < 0) throw new RangeError('index must be a non-negative integer');
  return lens(
    source => Array.isArray(source) ? source[position] : undefined,
    (source, value) => {
      if (!Array.isArray(source)) throw new TypeError('index lens requires an array');
      if (position >= source.length) throw new RangeError('index is outside the array');
      const copy = source.slice();
      copy[position] = value;
      return copy;
    }
  );
}

function compose(...lenses) {
  if (lenses.length === 0) return lens(x => x, (_source, value) => value);
  for (const item of lenses) if (!item || typeof item.get !== 'function' || typeof item.set !== 'function') throw new TypeError('compose expects lenses');
  return lens(
    source => lenses.reduce((value, item) => item.get(value), source),
    (source, value) => {
      function replace(depth, current) {
        if (depth === lenses.length) return value;
        const currentLens = lenses[depth];
        const focused = currentLens.get(current);
        const updated = replace(depth + 1, focused);
        return currentLens.set(current, updated);
      }
      return replace(0, source);
    }
  );
}

function view(optic, source) { return optic.get(source); }
function set(optic, value, source) { return optic.set(source, value); }
function over(optic, transform, source) {
  if (typeof transform !== 'function') throw new TypeError('transform must be a function');
  return optic.set(source, transform(optic.get(source)));
}

function traversal(collect, modify) {
  return Object.freeze({ collect, modify });
}

function eachArray() {
  return traversal(
    source => Array.isArray(source) ? source.slice() : [],
    (source, transform) => {
      if (!Array.isArray(source)) throw new TypeError('eachArray requires an array');
      return source.map((value, i) => transform(value, i));
    }
  );
}

function where(predicate) {
  if (typeof predicate !== 'function') throw new TypeError('predicate must be a function');
  return traversal(
    source => Array.isArray(source) ? source.filter(predicate) : [],
    (source, transform) => {
      if (!Array.isArray(source)) throw new TypeError('where requires an array');
      return source.map((value, i) => predicate(value, i) ? transform(value, i) : value);
    }
  );
}

function composeTraversal(...optics) {
  return traversal(
    source => optics.reduce((values, optic) => values.flatMap(value => optic.collect(value)), [source]),
    (source, transform) => {
      // A composed traversal is implemented as a recursive walk so each optic
      // can update its own container while preserving untouched branches.
      function walk(depth, current, path) {
        if (depth === optics.length) return transform(current, path);
        const optic = optics[depth];
        let indexInFocus = 0;
        return optic.modify(current, (value, childIndex) => {
          const nextPath = path.concat(childIndex ?? indexInFocus++);
          return walk(depth + 1, value, nextPath);
        });
      }
      return walk(0, source, []);
    }
  );
}

function overTraversal(optic, transform, source) {
  if (typeof transform !== 'function') throw new TypeError('transform must be a function');
  return optic.modify(source, transform);
}

function runTests() {
  const user = { profile: { name: 'Ada', scores: [2, 4, 6] }, active: true };
  const nameLens = compose(prop('profile'), prop('name'));
  const renamed = set(nameLens, 'Grace', user);
  assert.equal(view(nameLens, user), 'Ada');
  assert.equal(view(nameLens, renamed), 'Grace');
  assert.notEqual(renamed, user);
  assert.notEqual(renamed.profile, user.profile);
  assert.equal(renamed.active, user.active);

  const thirdScore = compose(prop('profile'), prop('scores'), index(2));
  const updated = over(thirdScore, value => value * 10, user);
  assert.deepEqual(updated.profile.scores, [2, 4, 60]);
  assert.deepEqual(user.profile.scores, [2, 4, 6]);

  const positive = where(value => value > 0);
  assert.deepEqual(positive.collect([-1, 2, 0, 4]), [2, 4]);
  assert.deepEqual(overTraversal(positive, value => value * 3, [-1, 2, 0, 4]), [-1, 6, 0, 12]);
  const nested = composeTraversal(eachArray(), where(x => x % 2 === 0));
  assert.deepEqual(nested.collect([[1, 2, 3], [4, 5, 6]]), [2, 4, 6]);
  assert.deepEqual(overTraversal(nested, x => x + 1, [[1, 2, 3], [4, 5, 6]]), [[1, 3, 3], [5, 5, 7]]);
  assert.throws(() => set(index(9), 1, [1, 2]), /outside/);
  assert.throws(() => prop('x').set(null, 1), /non-object/);
  console.log('Immutable Lenses and Traversals: all tests passed');
}

if (require.main === module) runTests();
module.exports = { lens, prop, index, compose, view, set, over, traversal, eachArray, where, composeTraversal, overTraversal };
