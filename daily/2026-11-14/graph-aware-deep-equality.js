/**
 * Graph-Aware Deep Equality
 * -------------------------
 * Compare object graphs rather than recursively comparing tree-shaped values.
 * The algorithm preserves alias topology in both directions, handles cycles,
 * and compares property descriptors without invoking getters.
 *
 * Supported built-ins: Date, RegExp, Map, Set, ArrayBuffer, DataView, and
 * typed arrays. Map and Set iteration order is significant because it is
 * observable in JavaScript. Functions compare by identity only.
 *
 * Prototypes must be identical by reference. Weak collections, promises,
 * proxies, and host objects with opaque internal slots are intentionally not
 * guessed at: compare them only when they are the same reference.
 *
 * Complexity: O(V + E + B), where B is the total number of compared bytes.
 *
 * Run: node graph-aware-deep-equality.js
 */
'use strict';

const assert = require('node:assert/strict');

function isObjectLike(value) {
  return value !== null &&
    (typeof value === 'object' || typeof value === 'function');
}

function bytesEqual(bufferA, bufferB) {
  if (bufferA.byteLength !== bufferB.byteLength) return false;
  const a = new Uint8Array(bufferA);
  const b = new Uint8Array(bufferB);
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function ownDescriptorsEqual(a, b, equal) {
  const keysA = Reflect.ownKeys(a);
  const keysB = Reflect.ownKeys(b);
  if (keysA.length !== keysB.length) return false;

  for (let i = 0; i < keysA.length; i += 1) {
    const key = keysA[i];
    if (key !== keysB[i]) return false;

    const da = Object.getOwnPropertyDescriptor(a, key);
    const db = Object.getOwnPropertyDescriptor(b, key);
    if (!da || !db) return false;
    if (da.enumerable !== db.enumerable ||
        da.configurable !== db.configurable) return false;

    const dataA = Object.prototype.hasOwnProperty.call(da, 'value');
    const dataB = Object.prototype.hasOwnProperty.call(db, 'value');
    if (dataA !== dataB) return false;

    if (dataA) {
      if (da.writable !== db.writable || !equal(da.value, db.value)) {
        return false;
      }
    } else if (da.get !== db.get || da.set !== db.set) {
      return false;
    }
  }
  return true;
}

function deepEqualGraph(left, right) {
  const leftToRight = new WeakMap();
  const rightToLeft = new WeakMap();

  function equal(a, b) {
    const objectA = isObjectLike(a);
    const objectB = isObjectLike(b);

    if (!objectA || !objectB) return !objectA && !objectB && Object.is(a, b);
    if (typeof a !== typeof b) return false;

    if (leftToRight.has(a)) return leftToRight.get(a) === b;
    if (rightToLeft.has(b)) return false;

    // Register before descending so self-references terminate and repeated
    // references must point to the same counterpart on the other side.
    leftToRight.set(a, b);
    rightToLeft.set(b, a);

    if (a === b) return true;
    if (typeof a === 'function') return false;
    if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;

    if (a instanceof Date) {
      if (!Object.is(a.getTime(), b.getTime())) return false;
    } else if (a instanceof RegExp) {
      if (a.source !== b.source ||
          a.flags !== b.flags ||
          a.lastIndex !== b.lastIndex) return false;
    } else if (a instanceof Map) {
      if (!(b instanceof Map) || a.size !== b.size) return false;
      const ia = a.entries();
      const ib = b.entries();
      while (true) {
        const na = ia.next();
        const nb = ib.next();
        if (na.done || nb.done) {
          if (na.done !== nb.done) return false;
          break;
        }
        if (!equal(na.value[0], nb.value[0]) ||
            !equal(na.value[1], nb.value[1])) return false;
      }
    } else if (a instanceof Set) {
      if (!(b instanceof Set) || a.size !== b.size) return false;
      const ia = a.values();
      const ib = b.values();
      while (true) {
        const na = ia.next();
        const nb = ib.next();
        if (na.done || nb.done) {
          if (na.done !== nb.done) return false;
          break;
        }
        if (!equal(na.value, nb.value)) return false;
      }
    } else if (a instanceof ArrayBuffer) {
      if (!(b instanceof ArrayBuffer) || !bytesEqual(a, b)) return false;
    } else if (ArrayBuffer.isView(a)) {
      if (!ArrayBuffer.isView(b) ||
          a.constructor !== b.constructor ||
          a.byteOffset !== b.byteOffset ||
          a.byteLength !== b.byteLength) return false;
      if (a instanceof DataView) {
        if (!(b instanceof DataView) || !equal(a.buffer, b.buffer)) return false;
      } else {
        if (a.length !== b.length || !equal(a.buffer, b.buffer)) return false;
      }
    } else {
      const tag = Object.prototype.toString.call(a);
      if (tag === '[object WeakMap]' ||
          tag === '[object WeakSet]' ||
          tag === '[object Promise]' ||
          tag === '[object WeakRef]' ||
          tag === '[object SharedArrayBuffer]') {
        return false;
      }
    }

    return ownDescriptorsEqual(a, b, equal);
  }

  try {
    return equal(left, right);
  } catch {
    // Detached buffers, hostile proxies, and opaque host objects are not
    // safely introspectable by this deliberately conservative comparator.
    return false;
  }
}

// ---------------------------------------------------------------------------
// Examples and tests
// ---------------------------------------------------------------------------

const cycleA = { name: 'root' };
cycleA.self = cycleA;
cycleA.child = { parent: cycleA };
const cycleB = { name: 'root' };
cycleB.self = cycleB;
cycleB.child = { parent: cycleB };
assert.equal(deepEqualGraph(cycleA, cycleB), true);

const shared = { value: 7 };
assert.equal(
  deepEqualGraph(
    { left: shared, right: shared },
    { left: { value: 7 }, right: { value: 7 } }
  ),
  false,
  'alias topology must be preserved'
);

const symbolKey = Symbol('metadata');
const descriptorA = {};
const descriptorB = {};
Object.defineProperty(descriptorA, symbolKey, {
  value: { score: 9 }, enumerable: false, writable: false
});
Object.defineProperty(descriptorB, symbolKey, {
  value: { score: 9 }, enumerable: false, writable: false
});
assert.equal(deepEqualGraph(descriptorA, descriptorB), true);
Object.defineProperty(descriptorB, symbolKey, {
  value: { score: 9 }, enumerable: false, writable: true, configurable: true
});
assert.equal(deepEqualGraph(descriptorA, descriptorB), false);

assert.equal(deepEqualGraph(new Date(1234), new Date(1234)), true);
assert.equal(deepEqualGraph(/a+/gi, /a+/gi), true);
assert.equal(deepEqualGraph(/a+/gi, /a+/g), false);

const mapA = new Map([[{ id: 1 }, new Set(['x', 'y'])]]);
const mapB = new Map([[{ id: 1 }, new Set(['x', 'y'])]]);
assert.equal(deepEqualGraph(mapA, mapB), true);
assert.equal(
  deepEqualGraph(new Set([1, 2]), new Set([2, 1])),
  false,
  'Set iteration order is observable and therefore significant'
);

assert.equal(
  deepEqualGraph(new Uint16Array([2, 4, 8]), new Uint16Array([2, 4, 8])),
  true
);
assert.equal(
  deepEqualGraph(new Uint16Array([2, 4]), new Uint16Array([2, 5])),
  false
);

let getterCalls = 0;
const getter = () => {
  getterCalls += 1;
  return 10;
};
const getterA = Object.defineProperty({}, 'value', { get: getter });
const getterB = Object.defineProperty({}, 'value', { get: getter });
assert.equal(deepEqualGraph(getterA, getterB), true);
assert.equal(getterCalls, 0, 'comparison must not invoke accessors');

const sameFunction = () => 1;
assert.equal(deepEqualGraph({ fn: sameFunction }, { fn: sameFunction }), true);
assert.equal(deepEqualGraph({ fn: () => 1 }, { fn: () => 1 }), false);

const sharedBufferA = new ArrayBuffer(4);
const sharedBufferB = new ArrayBuffer(4);
new Uint8Array(sharedBufferA).set([1, 2, 3, 4]);
new Uint8Array(sharedBufferB).set([1, 2, 3, 4]);
assert.equal(deepEqualGraph(sharedBufferA, sharedBufferB), true);

console.log('Graph-aware deep equality tests passed.');
