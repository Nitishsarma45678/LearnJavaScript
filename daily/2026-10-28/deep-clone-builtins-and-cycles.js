/**
 * Exercise: deep-clone common built-ins while preserving cycles, prototypes,
 * symbol keys, and property descriptors.
 *
 * Functions are intentionally retained by reference. Weak collections,
 * promises, and weak references are rejected because their hidden state
 * cannot be meaningfully duplicated by a general-purpose clone.
 */
function deepClone(value, seen = new WeakMap()) {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return value;
  }
  if (typeof value === "function") return value;
  if (seen.has(value)) return seen.get(value);

  const unsupported =
    value instanceof WeakMap ||
    value instanceof WeakSet ||
    (typeof Promise !== "undefined" && value instanceof Promise) ||
    (typeof WeakRef !== "undefined" && value instanceof WeakRef) ||
    (typeof FinalizationRegistry !== "undefined" && value instanceof FinalizationRegistry);

  if (unsupported) {
    throw new TypeError("Cannot deep-clone weak collections, promises, or weak references");
  }

  const prototype = Object.getPrototypeOf(value);

  function copyOwnProperties(source, target, shouldSkip = () => false) {
    for (const key of Reflect.ownKeys(source)) {
      if (shouldSkip(key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(source, key);
      if (Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        descriptor.value = deepClone(descriptor.value, seen);
      }
      Object.defineProperty(target, key, descriptor);
    }
    return target;
  }

  if (value instanceof Date) {
    const copy = new Date(value.getTime());
    Object.setPrototypeOf(copy, prototype);
    seen.set(value, copy);
    return copyOwnProperties(value, copy);
  }

  if (value instanceof RegExp) {
    const copy = new RegExp(value.source, value.flags);
    copy.lastIndex = value.lastIndex;
    Object.setPrototypeOf(copy, prototype);
    seen.set(value, copy);
    return copyOwnProperties(value, copy, key => key === "lastIndex");
  }

  if (value instanceof Map) {
    const copy = new Map();
    Object.setPrototypeOf(copy, prototype);
    seen.set(value, copy);
    for (const [key, entryValue] of value) {
      copy.set(deepClone(key, seen), deepClone(entryValue, seen));
    }
    return copyOwnProperties(value, copy);
  }

  if (value instanceof Set) {
    const copy = new Set();
    Object.setPrototypeOf(copy, prototype);
    seen.set(value, copy);
    for (const entry of value) copy.add(deepClone(entry, seen));
    return copyOwnProperties(value, copy);
  }

  if (typeof SharedArrayBuffer !== "undefined" && value instanceof SharedArrayBuffer) {
    const copy = new SharedArrayBuffer(value.byteLength);
    new Uint8Array(copy).set(new Uint8Array(value));
    Object.setPrototypeOf(copy, prototype);
    seen.set(value, copy);
    return copyOwnProperties(value, copy);
  }

  if (value instanceof ArrayBuffer) {
    const copy = value.slice(0);
    Object.setPrototypeOf(copy, prototype);
    seen.set(value, copy);
    return copyOwnProperties(value, copy);
  }

  if (ArrayBuffer.isView(value)) {
    let copy;
    if (value instanceof DataView) {
      const clonedBuffer = deepClone(value.buffer, seen);
      copy = new DataView(clonedBuffer, value.byteOffset, value.byteLength);
      Object.setPrototypeOf(copy, prototype);
      seen.set(value, copy);
      return copyOwnProperties(value, copy);
    }

    const clonedBuffer = deepClone(value.buffer, seen);
    copy = new value.constructor(clonedBuffer, value.byteOffset, value.length);
    Object.setPrototypeOf(copy, prototype);
    seen.set(value, copy);
    return copyOwnProperties(value, copy, key => {
      if (typeof key !== "string") return false;
      const index = Number(key);
      return Number.isInteger(index) && index >= 0 && String(index) === key;
    });
  }

  if (Array.isArray(value)) {
    const copy = new Array(value.length);
    Object.setPrototypeOf(copy, prototype);
    seen.set(value, copy);
    copyOwnProperties(value, copy, key => key === "length");
    Object.defineProperty(copy, "length", Object.getOwnPropertyDescriptor(value, "length"));
    return copy;
  }

  const copy = Object.create(prototype);
  seen.set(value, copy);
  return copyOwnProperties(value, copy);
}

if (require.main === module) {
  const assert = require("node:assert/strict");
  const marker = Symbol("marker");
  const source = {
    date: new Date("2020-01-02T00:00:00.000Z"),
    pattern: /foo/gi,
    map: new Map(),
    set: new Set(),
    bytes: new Uint16Array([3, 7, 11]),
    [marker]: { label: "symbol value" }
  };
  source.pattern.lastIndex = 2;
  source.self = source;
  source.map.set(source, source.set);
  source.set.add(source);
  source.bytes.owner = source;
  Object.defineProperty(source, "locked", {
    value: { nested: true }, enumerable: false, writable: false, configurable: false
  });

  const cloned = deepClone(source);
  assert.notStrictEqual(cloned, source);
  assert.strictEqual(cloned.self, cloned);
  assert.notStrictEqual(cloned.date, source.date);
  assert.equal(cloned.date.getTime(), source.date.getTime());
  assert.notStrictEqual(cloned.pattern, source.pattern);
  assert.equal(cloned.pattern.lastIndex, 2);
  assert.strictEqual(cloned.map.get(cloned), cloned.set);
  assert.equal(cloned.set.has(cloned), true);
  assert.notStrictEqual(cloned.bytes, source.bytes);
  assert.deepEqual(Array.from(cloned.bytes), [3, 7, 11]);
  assert.strictEqual(cloned.bytes.owner, cloned);
  assert.notStrictEqual(cloned[marker], source[marker]);
  assert.equal(Object.getOwnPropertyDescriptor(cloned, "locked").writable, false);
  assert.notStrictEqual(cloned.locked, source.locked);
  assert.throws(() => deepClone(new WeakMap()), TypeError);

  console.log("Deep-clone tests passed");
}

module.exports = { deepClone };
