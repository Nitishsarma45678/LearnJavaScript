'use strict';

const assert = require('node:assert/strict');

/**
 * Clone a supported JavaScript object graph while preserving cycles, aliases,
 * prototypes, symbols and property descriptors. Functions are intentionally
 * shared because their lexical environments cannot be copied safely.
 * Weak collections, promises and host objects with opaque internal slots are
 * rejected rather than silently producing broken clones.
 */
function cloneGraph(value, seen = new WeakMap()) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return value;
  if (typeof value === 'function') return value;
  if (seen.has(value)) return seen.get(value);

  if (value instanceof WeakMap || value instanceof WeakSet || value instanceof Promise ||
      (typeof WeakRef !== 'undefined' && value instanceof WeakRef) ||
      (typeof FinalizationRegistry !== 'undefined' && value instanceof FinalizationRegistry)) {
    throw new TypeError(`Cannot clone ${value.constructor.name} with opaque internal state`);
  }

  let result;
  if (value instanceof Date) {
    result = new Date(value.getTime());
    seen.set(value, result);
    return copyOwnProperties(value, result, seen);
  }
  if (value instanceof RegExp) {
    result = new RegExp(value.source, value.flags);
    seen.set(value, result);
    return copyOwnProperties(value, result, seen);
  }
  if (value instanceof Map) {
    result = new Map();
    seen.set(value, result);
    for (const [key, entryValue] of value) {
      result.set(cloneGraph(key, seen), cloneGraph(entryValue, seen));
    }
    return copyOwnProperties(value, result, seen);
  }
  if (value instanceof Set) {
    result = new Set();
    seen.set(value, result);
    for (const entry of value) result.add(cloneGraph(entry, seen));
    return copyOwnProperties(value, result, seen);
  }
  if (value instanceof ArrayBuffer) {
    result = value.slice(0);
    seen.set(value, result);
    return copyOwnProperties(value, result, seen);
  }
  if (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer) {
    throw new TypeError('SharedArrayBuffer cloning is intentionally unsupported');
  }
  if (ArrayBuffer.isView(value)) {
    const clonedBuffer = cloneGraph(value.buffer, seen);
    if (value instanceof DataView) {
      result = new DataView(clonedBuffer, value.byteOffset, value.byteLength);
      seen.set(value, result);
      return copyOwnProperties(value, result, seen);
    }
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
      result = Buffer.from(clonedBuffer, value.byteOffset, value.length);
    } else {
      result = new value.constructor(clonedBuffer, value.byteOffset, value.length);
    }
    seen.set(value, result);
    return copyOwnProperties(value, result, seen, (key) => isArrayIndex(key));
  }

  const tag = Object.prototype.toString.call(value);
  if (/\[object (Number|String|Boolean|BigInt|Symbol)\]/.test(tag)) {
    throw new TypeError(`Boxed primitive cloning is unsupported: ${tag}`);
  }

  if (Array.isArray(value)) {
    result = new Array(value.length);
    Object.setPrototypeOf(result, Object.getPrototypeOf(value));
  } else {
    result = Object.create(Object.getPrototypeOf(value));
  }
  seen.set(value, result);
  return copyOwnProperties(value, result, seen);
}

function isArrayIndex(key) {
  if (typeof key !== 'string' || key === '') return false;
  const number = Number(key);
  return Number.isInteger(number) && number >= 0 && number < 0xffffffff && String(number) === key;
}

function copyOwnProperties(source, target, seen, skip = () => false) {
  for (const key of Reflect.ownKeys(source)) {
    if (skip(key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      descriptor.value = cloneGraph(descriptor.value, seen);
    }
    Object.defineProperty(target, key, descriptor);
  }
  return target;
}

function runTests() {
  const symbolKey = Symbol('private-metadata');
  const prototype = { describe() { return `item:${this.label}`; } };
  const source = Object.create(prototype);
  source.label = 'root';
  source.self = source;
  source.shared = { score: 9 };
  source.alias = source.shared;
  source.map = new Map();
  source.set = new Set();
  source.map.set(source, source.shared);
  source.map.set('self', source.map);
  source.set.add(source.shared);
  source.set.add(source);
  source.date = new Date('2024-02-29T12:00:00.000Z');
  source.regex = /ab+/gi;
  source.regex.lastIndex = 3;
  source.array = [];
  source.array.length = 3;
  source.array[1] = source.shared; // preserve the holes at indexes 0 and 2
  source[symbolKey] = { enabled: true };
  Object.defineProperty(source, 'locked', {
    value: { token: 17 }, enumerable: false, writable: false, configurable: false
  });
  let getterCalls = 0;
  Object.defineProperty(source, 'computed', {
    enumerable: true,
    get() { getterCalls++; return this.label.toUpperCase(); }
  });

  const buffer = new ArrayBuffer(16);
  const bytes = new Uint8Array(buffer);
  bytes.set([3, 1, 4, 1, 5]);
  source.bytes = bytes;
  source.view = new DataView(buffer, 4, 4);
  source.error = new TypeError('sample failure');
  source.callback = () => 'same function reference';

  const copy = cloneGraph(source);
  assert.notEqual(copy, source);
  assert.equal(Object.getPrototypeOf(copy), prototype);
  assert.equal(copy.describe(), 'item:root');
  assert.equal(copy.self, copy);
  assert.notEqual(copy.shared, source.shared);
  assert.equal(copy.shared, copy.alias);
  assert.equal(copy.map.get(copy), copy.shared);
  assert.equal(copy.map.get('self'), copy.map);
  assert.equal(copy.set.has(copy.shared), true);
  assert.equal(copy.set.has(copy), true);
  assert.equal(copy.date.getTime(), source.date.getTime());
  assert.notEqual(copy.date, source.date);
  assert.equal(copy.regex.source, source.regex.source);
  assert.equal(copy.regex.flags, source.regex.flags);
  assert.equal(copy.regex.lastIndex, 3);
  assert.equal(0 in copy.array, false);
  assert.equal(1 in copy.array, true);
  assert.equal(2 in copy.array, false);
  assert.equal(copy.array[1], copy.shared);
  assert.deepEqual(copy[symbolKey], { enabled: true });
  const locked = Object.getOwnPropertyDescriptor(copy, 'locked');
  assert.equal(locked.enumerable, false);
  assert.equal(locked.writable, false);
  assert.equal(locked.configurable, false);
  assert.notEqual(locked.value, source.locked);
  assert.equal(getterCalls, 0, 'cloning must not invoke accessors');
  assert.equal(copy.computed, 'ROOT');
  assert.equal(getterCalls, 1);
  assert.equal(copy.bytes.buffer, copy.view.buffer, 'shared backing-buffer identity must survive');
  assert.deepEqual([...copy.bytes.slice(0, 5)], [3, 1, 4, 1, 5]);
  assert.equal(copy.error.message, source.error.message);
  assert.equal(Object.getPrototypeOf(copy.error), Object.getPrototypeOf(source.error));
  assert.equal(copy.callback, source.callback);
  assert.throws(() => cloneGraph(new WeakMap()), /opaque internal state/);
  assert.throws(() => cloneGraph(Promise.resolve(1)), /opaque internal state/);
  console.log('Object graph cloner: all tests passed');
}

if (require.main === module) runTests();
module.exports = { cloneGraph };
