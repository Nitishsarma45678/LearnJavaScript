'use strict';

const assert = require('node:assert/strict');

/**
 * Deep clone for common built-ins and ordinary/custom objects.
 * Preserves cycles, prototypes, symbols, property descriptors, and integrity
 * level. Functions are intentionally retained by reference. Weak collections
 * and Promises are rejected because their internal state is not inspectable.
 */
function deepClone(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);

  if (value instanceof WeakMap || value instanceof WeakSet || value instanceof Promise) {
    throw new TypeError('Weak collections and Promises cannot be deep-cloned');
  }

  if (value instanceof Date) {
    const copy = new Date(value.getTime());
    seen.set(value, copy);
    return copy;
  }

  if (value instanceof RegExp) {
    const copy = new RegExp(value.source, value.flags);
    copy.lastIndex = value.lastIndex;
    seen.set(value, copy);
    return copy;
  }

  if (value instanceof Map) {
    const copy = new Map();
    seen.set(value, copy);
    for (const [key, entry] of value) {
      copy.set(deepClone(key, seen), deepClone(entry, seen));
    }
    return copy;
  }

  if (value instanceof Set) {
    const copy = new Set();
    seen.set(value, copy);
    for (const entry of value) copy.add(deepClone(entry, seen));
    return copy;
  }

  if (value instanceof ArrayBuffer) {
    const copy = value.slice(0);
    seen.set(value, copy);
    return copy;
  }

  if (ArrayBuffer.isView(value)) {
    const buffer = deepClone(value.buffer, seen);
    const copy = value instanceof DataView
      ? new DataView(buffer, value.byteOffset, value.byteLength)
      : new value.constructor(buffer, value.byteOffset, value.length);
    seen.set(value, copy);
    return copy;
  }

  const copy = Array.isArray(value)
    ? []
    : Object.create(Object.getPrototypeOf(value));
  seen.set(value, copy);

  const keys = Reflect.ownKeys(value);
  for (const key of keys) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (Object.hasOwn(descriptor, 'value')) {
      descriptor.value = deepClone(descriptor.value, seen);
    }
    Object.defineProperty(copy, key, descriptor);
  }

  if (Array.isArray(value)) {
    Object.defineProperty(copy, 'length', Object.getOwnPropertyDescriptor(value, 'length'));
  }

  if (Object.isFrozen(value)) Object.freeze(copy);
  else if (Object.isSealed(value)) Object.seal(copy);
  else if (!Object.isExtensible(value)) Object.preventExtensions(copy);

  return copy;
}

const marker = Symbol('marker');
const prototype = { kind: 'custom' };
const source = Object.create(prototype);
source.self = source;
source[marker] = { nested: true };
Object.defineProperty(source, 'hidden', {
  value: { count: 7 }, enumerable: false, writable: false, configurable: false
});
let getterCalls = 0;
Object.defineProperty(source, 'computed', {
  get() { getterCalls++; return 99; },
  enumerable: true,
  configurable: true
});
Object.freeze(source);

const cloned = deepClone(source);
assert.notEqual(cloned, source);
assert.equal(Object.getPrototypeOf(cloned), prototype);
assert.equal(cloned.self, cloned);
assert.notEqual(cloned[marker], source[marker]);
assert.deepEqual(cloned[marker], { nested: true });
assert.equal(Object.getOwnPropertyDescriptor(cloned, 'hidden').writable, false);
assert.equal(cloned.hidden.count, 7);
assert.equal(getterCalls, 0);
assert.equal(Object.isFrozen(cloned), true);

const map = new Map();
map.set(map, { owner: map });
const mapCopy = deepClone(map);
assert.notEqual(mapCopy, map);
assert.equal(mapCopy.get(mapCopy).owner, mapCopy);

const typed = new Uint16Array([4, 9, 16]);
const typedCopy = deepClone(typed);
assert.deepEqual([...typedCopy], [4, 9, 16]);
assert.notEqual(typedCopy.buffer, typed.buffer);

const regexp = /a+/gi;
regexp.lastIndex = 3;
assert.equal(deepClone(regexp).lastIndex, 3);
assert.throws(() => deepClone(new WeakMap()), TypeError);

console.log('Descriptor-preserving deep clone tests passed');
