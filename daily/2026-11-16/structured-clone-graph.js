'use strict';

/**
 * EXERCISE: Build a safe, graph-preserving structured clone for a useful
 * JavaScript subset.
 *
 * Requirements:
 * - Preserve cycles and repeated references (object identity), not just values.
 * - Support arrays, plain/null-prototype objects, Date, RegExp, Map, Set,
 *   ArrayBuffer, DataView, and typed arrays.
 * - Preserve shared backing buffers between views.
 * - Do not invoke getters or silently copy unsupported class instances,
 *   functions, symbols, WeakMaps, or accessors.
 * - Ignore non-enumerable and symbol-keyed properties, matching the documented
 *   subset rather than pretending to implement the full platform algorithm.
 *
 * Run: node structured-clone-graph.js
 */

function cloneGraph(input) {
  const seen = new WeakMap();

  function copyProperties(source, target, skip = () => false) {
    for (const key of Object.keys(source)) {
      if (skip(key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(source, key);
      if (!descriptor || !('value' in descriptor)) {
        throw new TypeError(`Accessor property is not supported: ${String(key)}`);
      }
      Object.defineProperty(target, key, {
        value: clone(descriptor.value),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return target;
  }

  function clone(value) {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
      if (typeof value === 'symbol' || typeof value === 'function') {
        throw new TypeError(`Unsupported value type: ${typeof value}`);
      }
      return value;
    }
    if (typeof value === 'function') throw new TypeError('Functions cannot be cloned');
    if (seen.has(value)) return seen.get(value);

    if (value instanceof Date) {
      const result = new Date(value.getTime());
      seen.set(value, result);
      return copyProperties(value, result);
    }

    if (value instanceof RegExp) {
      const result = new RegExp(value.source, value.flags);
      result.lastIndex = value.lastIndex;
      seen.set(value, result);
      return copyProperties(value, result, key => key === 'lastIndex');
    }

    if (value instanceof Map) {
      if (Object.getPrototypeOf(value) !== Map.prototype) {
        throw new TypeError('Map subclasses are not supported');
      }
      const result = new Map();
      seen.set(value, result);
      for (const [key, entry] of value) result.set(clone(key), clone(entry));
      return copyProperties(value, result);
    }

    if (value instanceof Set) {
      if (Object.getPrototypeOf(value) !== Set.prototype) {
        throw new TypeError('Set subclasses are not supported');
      }
      const result = new Set();
      seen.set(value, result);
      for (const entry of value) result.add(clone(entry));
      return copyProperties(value, result);
    }

    if (value instanceof ArrayBuffer) {
      const result = value.slice(0);
      seen.set(value, result);
      return result;
    }

    if (ArrayBuffer.isView(value)) {
      const buffer = clone(value.buffer);
      let result;
      if (value instanceof DataView) {
        result = new DataView(buffer, value.byteOffset, value.byteLength);
      } else {
        const Constructor = value.constructor;
        if (typeof Constructor !== 'function' || !Constructor.BYTES_PER_ELEMENT) {
          throw new TypeError('Unsupported typed-array constructor');
        }
        result = new Constructor(buffer, value.byteOffset, value.length);
      }
      seen.set(value, result);
      return copyProperties(value, result, key => /^(0|[1-9]\d*)$/.test(key));
    }

    if (Array.isArray(value)) {
      const result = new Array(value.length);
      seen.set(value, result);
      return copyProperties(value, result);
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Only plain objects and null-prototype objects are supported');
    }
    const result = Object.create(prototype);
    seen.set(value, result);
    return copyProperties(value, result);
  }

  return clone(input);
}

function runTests() {
  const assert = require('node:assert/strict');

  const shared = { score: 7 };
  const source = { left: shared, right: shared };
  source.self = source;
  const copy = cloneGraph(source);
  assert.notEqual(copy, source);
  assert.equal(copy.self, copy);
  assert.equal(copy.left, copy.right);
  assert.notEqual(copy.left, shared);

  const key = { id: 1 };
  const map = new Map([[key, new Set([key])]]);
  const mapCopy = cloneGraph(map);
  const copiedKey = [...mapCopy.keys()][0];
  assert.notEqual(copiedKey, key);
  assert.equal([...mapCopy.values()][0].has(copiedKey), true);

  const sparse = new Array(4);
  sparse[2] = 'present';
  const sparseCopy = cloneGraph(sparse);
  assert.equal(0 in sparseCopy, false);
  assert.equal(2 in sparseCopy, true);
  assert.equal(sparseCopy.length, 4);

  const buffer = new ArrayBuffer(16);
  const bytes = new Uint8Array(buffer);
  bytes[3] = 91;
  const view = new DataView(buffer, 2, 8);
  const graph = cloneGraph({ buffer, bytes, view });
  assert.equal(graph.bytes.buffer, graph.buffer);
  assert.equal(graph.view.buffer, graph.buffer);
  assert.equal(graph.bytes[3], 91);
  graph.view.setUint8(1, 44);
  assert.equal(graph.bytes[3], 44);
  assert.equal(bytes[3], 91, 'clone must not mutate original buffer');

  const date = new Date('2024-03-04T05:06:07.000Z');
  const regexp = /ab+/gi;
  regexp.lastIndex = 3;
  const builtins = cloneGraph({ date, regexp, nil: Object.assign(Object.create(null), { x: 1 }) });
  assert.equal(builtins.date.getTime(), date.getTime());
  assert.equal(builtins.regexp.source, regexp.source);
  assert.equal(builtins.regexp.flags, regexp.flags);
  assert.equal(builtins.regexp.lastIndex, 3);
  assert.equal(Object.getPrototypeOf(builtins.nil), null);

  const accessor = {};
  Object.defineProperty(accessor, 'secret', { enumerable: true, get() { throw new Error('must not run'); } });
  assert.throws(() => cloneGraph(accessor), /Accessor property/);
  assert.throws(() => cloneGraph(() => 1), /Functions cannot be cloned/);
  assert.throws(() => cloneGraph(Symbol('x')), /Unsupported value type/);
  class Custom { constructor() { this.x = 1; } }
  assert.throws(() => cloneGraph(new Custom()), /plain objects/);

  console.log('structured-clone-graph: all tests passed');
}

if (require.main === module) runTests();
module.exports = { cloneGraph, runTests };
