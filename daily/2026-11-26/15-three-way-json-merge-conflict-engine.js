'use strict';

// Exercise: merge two edited JSON-like documents against a common base.
// Non-overlapping object edits merge recursively; arrays are atomic values.
// Conflicts are reported by path and default to the "ours" value.

const assert = require('node:assert/strict');
const MISSING = Symbol('missing');

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function equal(a, b) {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, i) => equal(value, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ak = Reflect.ownKeys(a), bk = Reflect.ownKeys(b);
    return ak.length === bk.length && ak.every((key) =>
      Object.prototype.hasOwnProperty.call(b, key) && equal(a[key], b[key]));
  }
  return false;
}

function clone(value) {
  if (value === MISSING) return MISSING;
  if (Array.isArray(value)) return value.map(clone);
  if (isPlainObject(value)) {
    const copy = Object.create(Object.getPrototypeOf(value));
    for (const key of Reflect.ownKeys(value)) copy[key] = clone(value[key]);
    return copy;
  }
  return value;
}

function publicValue(value) {
  return value === MISSING ? undefined : clone(value);
}

function threeWayMerge(base, ours, theirs) {
  const conflicts = [];

  function merge(b, o, t, path) {
    if (equal(o, t)) return clone(o);
    if (equal(o, b)) return clone(t);
    if (equal(t, b)) return clone(o);

    if ([b, o, t].every((value) => value === MISSING || isPlainObject(value))) {
      const prototype = b !== MISSING && isPlainObject(b) ? Object.getPrototypeOf(b) :
        o !== MISSING && isPlainObject(o) ? Object.getPrototypeOf(o) :
        t !== MISSING && isPlainObject(t) ? Object.getPrototypeOf(t) : null;
      const result = Object.create(prototype);
      const keys = new Set();
      for (const value of [b, o, t]) {
        if (value !== MISSING) for (const key of Reflect.ownKeys(value)) keys.add(key);
      }
      for (const key of keys) {
        const bv = b !== MISSING && Object.prototype.hasOwnProperty.call(b, key) ? b[key] : MISSING;
        const ov = o !== MISSING && Object.prototype.hasOwnProperty.call(o, key) ? o[key] : MISSING;
        const tv = t !== MISSING && Object.prototype.hasOwnProperty.call(t, key) ? t[key] : MISSING;
        const merged = merge(bv, ov, tv, [...path, key]);
        if (merged !== MISSING) result[key] = merged;
      }
      return result;
    }

    conflicts.push({
      path: path.map(String),
      base: publicValue(b),
      ours: publicValue(o),
      theirs: publicValue(t)
    });
    return clone(o);
  }

  const value = merge(base, ours, theirs, []);
  return { value: value === MISSING ? undefined : value, conflicts };
}

const base = { profile: { name: 'Ada', city: 'London' }, flags: ['a'] };
const ours = { profile: { name: 'Ada Lovelace', city: 'London' }, flags: ['a'] };
const theirs = { profile: { name: 'Ada', city: 'Guwahati' }, flags: ['a'] };
const merged = threeWayMerge(base, ours, theirs);
assert.deepEqual(merged.value.profile, { name: 'Ada Lovelace', city: 'Guwahati' });
assert.deepEqual(merged.conflicts, []);

const conflict = threeWayMerge({ count: 1 }, { count: 2 }, { count: 3 });
assert.equal(conflict.value.count, 2);
assert.deepEqual(conflict.conflicts[0].path, ['count']);

const deletionConflict = threeWayMerge({ title: 'draft' }, {}, { title: 'published' });
assert.equal(deletionConflict.conflicts.length, 1);
assert.equal(deletionConflict.value.title, undefined);

module.exports = { threeWayMerge };
