'use strict';

/**
 * EXERCISE: Compare object graphs, not just recursively nested trees.
 *
 * Implement structural equality that preserves cycles and shared-reference
 * topology. Support unordered Map/Set contents, arrays, symbols, property
 * descriptors, prototypes, Date, RegExp, ArrayBuffer, DataView and typed arrays.
 * Map/Set matching must backtrack because structurally equal candidates can be
 * ambiguous. Functions are equal only by identity.
 *
 * Run: node 09-deep-graph-equality.js
 */

function deepGraphEqual(left, right) {
  const state = { leftToRight: new Map(), rightToLeft: new Map() };
  return equal(left, right, state);
}

function isObjectLike(value) {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}

function cloneState(state) {
  return { leftToRight: new Map(state.leftToRight), rightToLeft: new Map(state.rightToLeft) };
}

function adoptState(target, source) {
  target.leftToRight = source.leftToRight;
  target.rightToLeft = source.rightToLeft;
}

function equalBytes(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a.buffer || a, a.byteOffset || 0, a.byteLength);
  const y = new Uint8Array(b.buffer || b, b.byteOffset || 0, b.byteLength);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

function equalProperties(a, b, state, ignored = new Set()) {
  const keysA = Reflect.ownKeys(a).filter(key => !ignored.has(key));
  const keysB = Reflect.ownKeys(b).filter(key => !ignored.has(key));
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    const da = Object.getOwnPropertyDescriptor(a, key);
    const db = Object.getOwnPropertyDescriptor(b, key);
    if (da.enumerable !== db.enumerable || da.configurable !== db.configurable) return false;
    const dataA = Object.prototype.hasOwnProperty.call(da, 'value');
    const dataB = Object.prototype.hasOwnProperty.call(db, 'value');
    if (dataA !== dataB) return false;
    if (dataA) {
      if (da.writable !== db.writable || !equal(da.value, db.value, state)) return false;
    } else if (da.get !== db.get || da.set !== db.set) return false;
  }
  return true;
}

function matchUnordered(itemsA, itemsB, state, comparePair, index = 0, used = new Set()) {
  if (index === itemsA.length) return true;
  for (let candidate = 0; candidate < itemsB.length; candidate++) {
    if (used.has(candidate)) continue;
    const trial = cloneState(state);
    if (!comparePair(itemsA[index], itemsB[candidate], trial)) continue;
    const nextUsed = new Set(used);
    nextUsed.add(candidate);
    if (matchUnordered(itemsA, itemsB, trial, comparePair, index + 1, nextUsed)) {
      adoptState(state, trial);
      return true;
    }
  }
  return false;
}

function equal(a, b, state) {
  if (Object.is(a, b)) return true;
  if (!isObjectLike(a) || !isObjectLike(b)) return false;
  if (typeof a === 'function' || typeof b === 'function') return false;

  if (state.leftToRight.has(a)) return state.leftToRight.get(a) === b;
  if (state.rightToLeft.has(b)) return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;

  state.leftToRight.set(a, b);
  state.rightToLeft.set(b, a);

  if (a instanceof Date) return Object.is(a.getTime(), b.getTime()) && equalProperties(a, b, state);
  if (a instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags && a.lastIndex === b.lastIndex &&
      equalProperties(a, b, state, new Set(['lastIndex']));
  }
  if (a instanceof ArrayBuffer) return equalBytes(a, b) && equalProperties(a, b, state);
  if (ArrayBuffer.isView(a)) {
    if (!ArrayBuffer.isView(b) || a.constructor !== b.constructor || a.byteLength !== b.byteLength) return false;
    if (a instanceof DataView) return equalBytes(a, b) && equalProperties(a, b, state);
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
    return equalProperties(a, b, state, new Set(Array.from({ length: a.length }, (_, i) => String(i))));
  }
  if (a instanceof Map) {
    if (!(b instanceof Map) || a.size !== b.size) return false;
    const entriesA = [...a.entries()], entriesB = [...b.entries()];
    if (!matchUnordered(entriesA, entriesB, state, (x, y, trial) =>
      equal(x[0], y[0], trial) && equal(x[1], y[1], trial))) return false;
    return equalProperties(a, b, state);
  }
  if (a instanceof Set) {
    if (!(b instanceof Set) || a.size !== b.size) return false;
    if (!matchUnordered([...a], [...b], state, (x, y, trial) => equal(x, y, trial))) return false;
    return equalProperties(a, b, state);
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  return equalProperties(a, b, state);
}

// -------------------------------- Tests ----------------------------------
if (require.main === module) {
  const assert = require('node:assert/strict');
  const left = { name: 'root' };
  left.self = left;
  left.child = { owner: left };
  const right = { name: 'root' };
  right.self = right;
  right.child = { owner: right };
  assert.equal(deepGraphEqual(left, right), true, 'isomorphic cyclic graphs compare equal');

  const shared = {};
  assert.equal(deepGraphEqual({ a: shared, b: shared }, { a: {}, b: {} }), false,
    'alias topology is significant');
  const sym = Symbol('field');
  assert.equal(deepGraphEqual({ [sym]: { n: 1 } }, { [sym]: { n: 1 } }), true);
  assert.equal(deepGraphEqual(Object.create(null), {}), false, 'prototypes must match');

  const mapA = new Map([[{ id: 1 }, { value: 'a' }], [{ id: 2 }, { value: 'b' }]]);
  const mapB = new Map([[{ id: 2 }, { value: 'b' }], [{ id: 1 }, { value: 'a' }]]);
  assert.equal(deepGraphEqual(mapA, mapB), true, 'Map insertion order is ignored');
  assert.equal(deepGraphEqual(new Set([{ x: 1 }, { x: 2 }]), new Set([{ x: 2 }, { x: 1 }])), true);

  const date = new Date('2020-01-02T00:00:00Z');
  assert.equal(deepGraphEqual(date, new Date(date)), true);
  assert.equal(deepGraphEqual(/ab/gi, /ab/gi), true);
  assert.equal(deepGraphEqual(new Uint16Array([1, 500]), new Uint16Array([1, 500])), true);
  assert.equal(deepGraphEqual(new Uint8Array([1, 2]).buffer, new Uint8Array([1, 2]).buffer), true);
  assert.equal(deepGraphEqual(new DataView(Uint8Array.from([4, 5]).buffer),
    new DataView(Uint8Array.from([4, 5]).buffer)), true);

  const nonWritableA = {};
  const nonWritableB = {};
  Object.defineProperty(nonWritableA, 'x', { value: 1, enumerable: true, writable: false });
  Object.defineProperty(nonWritableB, 'x', { value: 1, enumerable: true, writable: true });
  assert.equal(deepGraphEqual(nonWritableA, nonWritableB), false, 'descriptors are compared');
  assert.equal(deepGraphEqual({ x: NaN }, { x: NaN }), true);
  assert.equal(deepGraphEqual({ x: -0 }, { x: 0 }), false);
  const fn = () => {};
  assert.equal(deepGraphEqual({ fn }, { fn }), true);
  assert.equal(deepGraphEqual({ fn }, { fn: () => {} }), false);

  // Ambiguous unordered matching must backtrack instead of relying on iteration order.
  const key1 = { tag: 'same' }, key2 = { tag: 'same' };
  const set1 = new Set([key1, key2]);
  const set2 = new Set([{ tag: 'same' }, { tag: 'same' }]);
  assert.equal(deepGraphEqual(set1, set2), true);
  console.log('Deep graph equality: all tests passed');
}

module.exports = { deepGraphEqual };
