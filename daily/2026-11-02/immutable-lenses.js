const assert = require('node:assert/strict');

function readPath(root, path) {
  let value = root;
  for (const key of path) {
    if (value == null) return undefined;
    value = value[key];
  }
  return value;
}

function writePath(root, path, replacement) {
  function copyAt(current, depth) {
    if (depth === path.length) return replacement;
    const key = path[depth];
    let copy;
    if (current == null) copy = typeof key === 'number' ? [] : {};
    else if (Array.isArray(current)) copy = current.slice();
    else if (Object.getPrototypeOf(current) === Object.prototype || Object.getPrototypeOf(current) === null)
      copy = Object.assign(Object.create(Object.getPrototypeOf(current)), current);
    else throw new TypeError('Lenses support arrays and plain objects only');

    copy[key] = copyAt(current == null ? undefined : current[key], depth + 1);
    return copy;
  }
  if (!Array.isArray(path) || path.length === 0) throw new RangeError('Lens path must be non-empty');
  return copyAt(root, 0);
}

function lens(path) {
  if (!Array.isArray(path) || path.length === 0) throw new RangeError('Lens path must be non-empty');
  const keys = path.slice();
  return Object.freeze({
    get: root => readPath(root, keys),
    set: (root, value) => writePath(root, keys, value),
    modify: (root, fn) => {
      if (typeof fn !== 'function') throw new TypeError('modify expects a function');
      return writePath(root, keys, fn(readPath(root, keys)));
    },
    compose: other => {
      if (!other || !Array.isArray(other.path)) throw new TypeError('Expected another lens');
      return lens(keys.concat(other.path));
    },
    path: keys
  });
}

// Expose a read-only path descriptor so lenses can be composed safely.
const originalLens = lens;
function propertyLens(...keys) {
  const result = originalLens(keys);
  return Object.freeze({
    ...result,
    compose: other => originalLens(keys.concat(other.path)),
    path: keys.slice()
  });
}

const state = {
  account: { profile: { name: 'Ada', tags: ['math'] }, active: true },
  untouched: { stable: true }
};
const nameLens = propertyLens('account', 'profile', 'name');
const tagLens = propertyLens('account', 'profile', 'tags', 1);
assert.equal(nameLens.get(state), 'Ada');
const renamed = nameLens.modify(state, name => name.toUpperCase());
assert.equal(nameLens.get(renamed), 'ADA');
assert.equal(nameLens.get(state), 'Ada');
assert.notEqual(renamed.account, state.account);
assert.equal(renamed.untouched, state.untouched);
const withTag = tagLens.set(state, 'logic');
assert.deepEqual(withTag.account.profile.tags, ['math', 'logic']);
const nested = propertyLens('settings', 'display', 'density').set({}, 2);
assert.equal(nested.settings.display.density, 2);
assert.throws(() => propertyLens().get(state), RangeError);
console.log('Immutable lens tests passed');