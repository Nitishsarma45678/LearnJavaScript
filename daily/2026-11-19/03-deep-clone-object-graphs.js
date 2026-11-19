'use strict';

/**
 * Exercise: Deep-clone an object graph while preserving cycles, shared
 * references, prototypes, symbols, property descriptors, and common built-ins.
 *
 * Functions are intentionally retained by reference. WeakMap, WeakSet, and
 * host objects are also retained because their internal slots cannot be
 * reconstructed generically and safely.
 */

function deepClone(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);

  if (value instanceof Date) {
    const clone = new Date(value.getTime());
    seen.set(value, clone);
    return clone;
  }
  if (value instanceof RegExp) {
    const clone = new RegExp(value.source, value.flags);
    clone.lastIndex = value.lastIndex;
    seen.set(value, clone);
    return clone;
  }
  if (value instanceof WeakMap || value instanceof WeakSet) return value;

  if (value instanceof Map) {
    const clone = new Map();
    seen.set(value, clone);
    for (const [key, entryValue] of value) {
      clone.set(deepClone(key, seen), deepClone(entryValue, seen));
    }
    return clone;
  }
  if (value instanceof Set) {
    const clone = new Set();
    seen.set(value, clone);
    for (const entry of value) clone.add(deepClone(entry, seen));
    return clone;
  }
  if (value instanceof ArrayBuffer) {
    const clone = value.slice(0);
    seen.set(value, clone);
    return clone;
  }
  if (ArrayBuffer.isView(value)) {
    const clonedBuffer = deepClone(value.buffer, seen);
    const clone = value instanceof DataView
      ? new DataView(clonedBuffer, value.byteOffset, value.byteLength)
      : new value.constructor(clonedBuffer, value.byteOffset, value.length);
    seen.set(value, clone);
    return clone;
  }

  const clone = Array.isArray(value)
    ? new Array(value.length)
    : Object.create(Object.getPrototypeOf(value));
  seen.set(value, clone);

  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      descriptor.value = deepClone(descriptor.value, seen);
    }
    Object.defineProperty(clone, key, descriptor);
  }
  return clone;
}

function runTests() {
  const assert = require('node:assert/strict');
  const symbolKey = Symbol('metadata');
  const original = Object.create({ inherited: 'prototype value' });
  original.name = 'graph';
  original.self = original;
  original.sharedA = { score: 7 };
  original.sharedB = original.sharedA;
  original[symbolKey] = { hidden: true };
  Object.defineProperty(original, 'locked', {
    value: { safe: true },
    enumerable: false,
    writable: false,
    configurable: false
  });

  const clone = deepClone(original);
  assert.notEqual(clone, original);
  assert.equal(clone.self, clone, 'cycles must point into the cloned graph');
  assert.equal(clone.sharedA, clone.sharedB, 'shared references must stay shared');
  assert.notEqual(clone.sharedA, original.sharedA);
  assert.equal(Object.getPrototypeOf(clone), Object.getPrototypeOf(original));
  assert.equal(clone.inherited, 'prototype value');
  assert.equal(clone[symbolKey].hidden, true);
  assert.equal(Object.getOwnPropertyDescriptor(clone, 'locked').writable, false);

  const map = new Map();
  const mapKey = { id: 1 };
  map.set(mapKey, { owner: mapKey });
  map.set('self', map);
  const mapClone = deepClone(map);
  const clonedKey = [...mapClone.keys()][0];
  assert.notEqual(clonedKey, mapKey);
  assert.equal(mapClone.get(clonedKey).owner, clonedKey);
  assert.equal(mapClone.get('self'), mapClone);

  const set = new Set();
  set.add(set);
  const setClone = deepClone(set);
  assert.notEqual(setClone, set);
  assert.equal(setClone.has(setClone), true);

  const date = new Date('2024-05-06T12:00:00.000Z');
  assert.equal(deepClone(date).getTime(), date.getTime());
  const expression = /a+b/gi;
  expression.lastIndex = 3;
  const expressionClone = deepClone(expression);
  assert.equal(expressionClone.source, expression.source);
  assert.equal(expressionClone.flags, expression.flags);
  assert.equal(expressionClone.lastIndex, 3);

  const typed = new Uint16Array([10, 20, 30]);
  const typedClone = deepClone(typed);
  assert.deepEqual([...typedClone], [10, 20, 30]);
  typedClone[0] = 99;
  assert.equal(typed[0], 10);

  const sparse = new Array(3);
  sparse[2] = 'end';
  const sparseClone = deepClone(sparse);
  assert.equal(0 in sparseClone, false);
  assert.equal(sparseClone[2], 'end');

  const callback = () => 1;
  assert.equal(deepClone(callback), callback, 'functions are preserved by reference');
}

if (require.main === module) {
  runTests();
  console.log('Graph-aware deep clone: all tests passed');
}

module.exports = { deepClone };
