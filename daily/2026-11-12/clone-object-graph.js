/**
 * Descriptor-aware object-graph clone.
 *
 * Exercise:
 * Clone cyclic JavaScript object graphs while preserving aliases, prototypes,
 * property descriptors and symbol keys. Handle Date, RegExp, Map, Set,
 * ArrayBuffer, SharedArrayBuffer, DataView and typed-array views. Accessor
 * properties are copied without invoking their getters.
 *
 * Functions are intentionally retained by reference. Weak collections,
 * promises and weak references are rejected because their internal state
 * cannot be recreated through ordinary JavaScript reflection.
 *
 * Run: node clone-object-graph.js
 */

function cloneGraph(value, seen = new WeakMap()) {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return value;
  }
  if (typeof value === "function") return value;
  if (seen.has(value)) return seen.get(value);

  if (value instanceof WeakMap || value instanceof WeakSet || value instanceof Promise ||
      (typeof WeakRef !== "undefined" && value instanceof WeakRef) ||
      (typeof FinalizationRegistry !== "undefined" && value instanceof FinalizationRegistry)) {
    throw new TypeError("cannot clone objects with weak or asynchronous internal state");
  }

  let copy;
  if (Array.isArray(value)) {
    copy = new Array(value.length);
    Object.setPrototypeOf(copy, Object.getPrototypeOf(value));
  } else if (value instanceof Date) {
    copy = new Date(value.getTime());
    Object.setPrototypeOf(copy, Object.getPrototypeOf(value));
  } else if (value instanceof RegExp) {
    copy = new RegExp(value.source, value.flags);
    copy.lastIndex = value.lastIndex;
    Object.setPrototypeOf(copy, Object.getPrototypeOf(value));
  } else if (value instanceof Map) {
    copy = new Map();
    Object.setPrototypeOf(copy, Object.getPrototypeOf(value));
  } else if (value instanceof Set) {
    copy = new Set();
    Object.setPrototypeOf(copy, Object.getPrototypeOf(value));
  } else if (value instanceof ArrayBuffer) {
    copy = value.slice(0);
    Object.setPrototypeOf(copy, Object.getPrototypeOf(value));
  } else if (typeof SharedArrayBuffer !== "undefined" && value instanceof SharedArrayBuffer) {
    copy = new SharedArrayBuffer(value.byteLength);
    new Uint8Array(copy).set(new Uint8Array(value));
    Object.setPrototypeOf(copy, Object.getPrototypeOf(value));
  } else if (value instanceof DataView) {
    const buffer = cloneGraph(value.buffer, seen);
    copy = new DataView(buffer, value.byteOffset, value.byteLength);
    Object.setPrototypeOf(copy, Object.getPrototypeOf(value));
  } else if (ArrayBuffer.isView(value)) {
    const buffer = cloneGraph(value.buffer, seen);
    copy = new value.constructor(buffer, value.byteOffset, value.length);
    Object.setPrototypeOf(copy, Object.getPrototypeOf(value));
  } else {
    copy = Object.create(Object.getPrototypeOf(value));
  }

  // Register before descending so cycles and shared references are preserved.
  seen.set(value, copy);

  if (value instanceof Map) {
    for (const [key, entryValue] of value) {
      copy.set(cloneGraph(key, seen), cloneGraph(entryValue, seen));
    }
  } else if (value instanceof Set) {
    for (const entry of value) copy.add(cloneGraph(entry, seen));
  }

  const isTypedArray = ArrayBuffer.isView(value) && !(value instanceof DataView);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === "length") continue;
    if (isTypedArray && typeof key === "string" &&
        /^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length) {
      // Indexed elements already came from the cloned backing buffer.
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (Object.prototype.hasOwnProperty.call(descriptor, "value")) {
      descriptor.value = cloneGraph(descriptor.value, seen);
    }
    Object.defineProperty(copy, key, descriptor);
  }
  return copy;
}

function runTests() {
  const assert = require("node:assert/strict");

  const shared = { score: 42 };
  const symbolKey = Symbol("metadata");
  const original = { left: shared, right: shared, [symbolKey]: { ok: true } };
  original.self = original;
  const cloned = cloneGraph(original);
  assert.notEqual(cloned, original);
  assert.equal(cloned.self, cloned);
  assert.equal(cloned.left, cloned.right, "shared aliases must remain shared");
  assert.notEqual(cloned.left, shared);
  assert.deepEqual(cloned[symbolKey], { ok: true });

  let getterCalls = 0;
  Object.defineProperty(original, "computed", {
    enumerable: false,
    configurable: true,
    get() { getterCalls++; return 99; }
  });
  const withDescriptor = cloneGraph(original);
  assert.equal(getterCalls, 0, "cloning must not invoke getters");
  const descriptor = Object.getOwnPropertyDescriptor(withDescriptor, "computed");
  assert.equal(descriptor.get, Object.getOwnPropertyDescriptor(original, "computed").get);
  assert.equal(descriptor.enumerable, false);

  class Record {
    constructor(id) { this.id = id; }
  }
  const record = cloneGraph(new Record("r-7"));
  assert.ok(record instanceof Record);
  assert.equal(record.id, "r-7");

  const map = new Map();
  const set = new Set();
  map.set(map, set);
  map.set("shared", shared);
  set.add(map);
  const collectionClone = cloneGraph({ map, set });
  assert.notEqual(collectionClone.map, map);
  assert.equal(collectionClone.map.get(collectionClone.map), collectionClone.set);
  assert.ok(collectionClone.set.has(collectionClone.map));
  assert.notEqual(collectionClone.map.get("shared"), shared);

  const buffer = new ArrayBuffer(16);
  const bytes = new Uint8Array(buffer, 4, 4);
  bytes.set([10, 20, 30, 40]);
  const view = new DataView(buffer, 0, 16);
  const viewsClone = cloneGraph({ bytes, view });
  assert.notEqual(viewsClone.bytes.buffer, buffer);
  assert.equal(viewsClone.bytes.buffer, viewsClone.view.buffer);
  assert.deepEqual(Array.from(viewsClone.bytes), [10, 20, 30, 40]);
  assert.equal(viewsClone.view.getUint8(4), 10);

  const date = new Date("2024-05-06T07:08:09.000Z");
  const expression = /ab+/gi;
  expression.lastIndex = 2;
  const builtins = cloneGraph({ date, expression });
  assert.equal(builtins.date.getTime(), date.getTime());
  assert.notEqual(builtins.date, date);
  assert.equal(builtins.expression.source, expression.source);
  assert.equal(builtins.expression.flags, expression.flags);
  assert.equal(builtins.expression.lastIndex, 2);

  const fn = () => "kept by reference";
  assert.equal(cloneGraph({ fn }).fn, fn);
  assert.throws(() => cloneGraph(new WeakMap()), /weak or asynchronous/);
  console.log("cloneGraph: all tests passed");
}

if (require.main === module) runTests();
module.exports = { cloneGraph };
