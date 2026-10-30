'use strict';

/**
 * Deep equality for object graphs. It preserves alias/cycle topology, compares
 * prototypes and property descriptors, and supports ordered Map/Set contents,
 * Date, RegExp, ArrayBuffer, DataView, and typed arrays. Functions, promises,
 * WeakMap, and WeakSet are opaque and compare by identity only.
 */
function deepEqual(left, right) {
  const leftToRight = new WeakMap();
  const rightToLeft = new WeakMap();

  function equal(a, b) {
    const aIsObject = typeof a === 'object' && a !== null;
    const bIsObject = typeof b === 'object' && b !== null;

    if (!aIsObject || !bIsObject) return Object.is(a, b);
    if (leftToRight.has(a) || rightToLeft.has(b)) {
      return leftToRight.get(a) === b && rightToLeft.get(b) === a;
    }
    if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
    if (a === b) {
      leftToRight.set(a, b);
      rightToLeft.set(b, a);
      return true;
    }

    // These values expose no reliable structural representation.
    if (a instanceof WeakMap || a instanceof WeakSet || a instanceof Promise ||
        (typeof WeakRef !== 'undefined' && a instanceof WeakRef)) return false;

    leftToRight.set(a, b);
    rightToLeft.set(b, a);

    if (a instanceof Date && !Object.is(a.getTime(), b.getTime())) return false;
    if (a instanceof RegExp && (a.source !== b.source || a.flags !== b.flags || a.lastIndex !== b.lastIndex)) {
      return false;
    }
    if (a instanceof ArrayBuffer && !bytesEqual(new Uint8Array(a), new Uint8Array(b))) return false;
    if (ArrayBuffer.isView(a)) {
      if (a.constructor !== b.constructor || a.byteLength !== b.byteLength) return false;
      if (a instanceof DataView) {
        const aBytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
        const bBytes = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
        if (!bytesEqual(aBytes, bBytes)) return false;
      } else {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i += 1) {
          if (!Object.is(a[i], b[i])) return false;
        }
      }
    }
    if (a instanceof Map) {
      if (a.size !== b.size) return false;
      const ai = a.entries();
      const bi = b.entries();
      while (true) {
        const av = ai.next();
        const bv = bi.next();
        if (av.done || bv.done) {
          if (av.done !== bv.done) return false;
          break;
        }
        if (!equal(av.value[0], bv.value[0]) || !equal(av.value[1], bv.value[1])) return false;
      }
    }
    if (a instanceof Set) {
      if (a.size !== b.size) return false;
      const ai = a.values();
      const bi = b.values();
      while (true) {
        const av = ai.next();
        const bv = bi.next();
        if (av.done || bv.done) {
          if (av.done !== bv.done) return false;
          break;
        }
        if (!equal(av.value, bv.value)) return false;
      }
    }

    return ownPropertiesEqual(a, b, equal);
  }

  return equal(left, right);
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function ownPropertiesEqual(a, b, equal) {
  const aKeys = Reflect.ownKeys(a);
  const bKeys = Reflect.ownKeys(b);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    const ad = Object.getOwnPropertyDescriptor(a, key);
    const bd = Object.getOwnPropertyDescriptor(b, key);
    if (ad.configurable !== bd.configurable || ad.enumerable !== bd.enumerable) return false;
    const aHasValue = Object.prototype.hasOwnProperty.call(ad, 'value');
    const bHasValue = Object.prototype.hasOwnProperty.call(bd, 'value');
    if (aHasValue !== bHasValue) return false;
    if (aHasValue) {
      if (ad.writable !== bd.writable || !equal(ad.value, bd.value)) return false;
    } else if (ad.get !== bd.get || ad.set !== bd.set) {
      return false;
    }
  }
  return true;
}

// Tests: cycles, alias topology, descriptors, symbols, and built-ins.
const assert = require('node:assert/strict');
const cycleA = { name: 'node' };
cycleA.self = cycleA;
const cycleB = { name: 'node' };
cycleB.self = cycleB;
assert.equal(deepEqual(cycleA, cycleB), true);

const shared = { value: 1 };
assert.equal(deepEqual({ a: shared, b: shared }, { a: { value: 1 }, b: { value: 1 } }), false);
assert.equal(deepEqual({ a: shared, b: shared }, { a: shared, b: shared }), true);
assert.equal(deepEqual([1, { x: 2 }], [1, { x: 2 }]), true);
assert.equal(deepEqual(new Date('2020-01-01'), new Date('2020-01-01')), true);
assert.equal(deepEqual(/ab/gi, /ab/gi), true);
assert.equal(deepEqual(new Set([{ x: 1 }, 2]), new Set([{ x: 1 }, 2])), true);
assert.equal(deepEqual(new Set([1, 2]), new Set([2, 1])), false); // insertion order is observable
assert.equal(deepEqual(new Map([['a', { n: 1 }]]), new Map([['a', { n: 1 }]])), true);
assert.equal(deepEqual(new Uint16Array([1, 500]), new Uint16Array([1, 500])), true);
assert.equal(deepEqual(new Uint16Array([1]), new Uint8Array([1])), false);
assert.equal(deepEqual(new DataView(Uint8Array.from([4, 5]).buffer), new DataView(Uint8Array.from([4, 5]).buffer)), true);
const symbol = Symbol('metadata');
assert.equal(deepEqual({ [symbol]: 3 }, { [symbol]: 3 }), true);
const readonlyA = {};
const readonlyB = {};
Object.defineProperty(readonlyA, 'x', { value: 1, enumerable: true });
Object.defineProperty(readonlyB, 'x', { value: 1, enumerable: true, writable: true, configurable: true });
assert.equal(deepEqual(readonlyA, readonlyB), false);
assert.equal(deepEqual(Object.create(null), {}), false);
const promise = Promise.resolve(1);
assert.equal(deepEqual(promise, Promise.resolve(1)), false);
assert.equal(deepEqual(promise, promise), true);
console.log('deep-equal-graphs: all tests passed');
