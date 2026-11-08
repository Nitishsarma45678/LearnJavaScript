"use strict";

// Persistent 32-way vector trie.
// Every update copies only the nodes on the affected path, so old versions
// remain usable. Operations are O(log_32(n)); get is O(log_32(n)).

const assert = require("node:assert/strict");

const BITS = 5;
const WIDTH = 1 << BITS;
const MASK = WIDTH - 1;

function newPath(level, value) {
  if (level === 0) return [value];
  return [newPath(level - BITS, value)];
}

function pushTail(level, parent, value, index) {
  const subIndex = Math.floor(index / (2 ** level)) % WIDTH;
  const copy = parent.slice();

  if (level === 0) {
    copy[subIndex] = value;
  } else {
    const child = parent[subIndex];
    copy[subIndex] = child
      ? pushTail(level - BITS, child, value, index)
      : newPath(level - BITS, value);
  }

  return copy;
}

function setPath(level, node, index, value) {
  const copy = node.slice();
  const subIndex = Math.floor(index / (2 ** level)) % WIDTH;

  if (level === 0) {
    copy[subIndex] = value;
  } else {
    copy[subIndex] = setPath(level - BITS, node[subIndex], index, value);
  }

  return copy;
}

function popTail(level, node, index) {
  const subIndex = Math.floor(index / (2 ** level)) % WIDTH;

  if (level === 0) {
    const copy = node.slice();
    copy.pop();
    return copy.length === 0 ? null : copy;
  }

  const child = popTail(level - BITS, node[subIndex], index);
  if (child === null && subIndex === 0) return null;

  const copy = node.slice();
  if (child === null) copy.pop();
  else copy[subIndex] = child;

  return copy.length === 0 ? null : copy;
}

class PersistentVector {
  constructor(root = [], shift = 0, size = 0) {
    this._root = root;
    this._shift = shift;
    this.size = size;
    Object.freeze(this);
  }

  static empty() {
    return new PersistentVector();
  }

  static from(iterable) {
    let vector = PersistentVector.empty();
    for (const value of iterable) vector = vector.push(value);
    return vector;
  }

  _assertIndex(index) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.size) {
      throw new RangeError("index is outside the vector");
    }
  }

  get(index) {
    this._assertIndex(index);
    let node = this._root;

    for (let level = this._shift; level > 0; level -= BITS) {
      const subIndex = Math.floor(index / (2 ** level)) % WIDTH;
      node = node[subIndex];
    }

    return node[index % WIDTH];
  }

  set(index, value) {
    this._assertIndex(index);
    const root = setPath(this._shift, this._root, index, value);
    return new PersistentVector(root, this._shift, this.size);
  }

  push(value) {
    if (this.size >= Number.MAX_SAFE_INTEGER) {
      throw new RangeError("vector exceeds the safe integer index range");
    }

    let root;
    let shift = this._shift;

    if (this.size >= 2 ** (shift + BITS)) {
      root = [this._root, newPath(shift, value)];
      shift += BITS;
    } else {
      root = pushTail(shift, this._root, value, this.size);
    }

    return new PersistentVector(root, shift, this.size + 1);
  }

  pop() {
    if (this.size === 0) throw new RangeError("cannot pop an empty vector");
    if (this.size === 1) return PersistentVector.empty();

    let root = popTail(this._shift, this._root, this.size - 1) || [];
    let shift = this._shift;

    if (shift > 0 && root.length === 1) {
      root = root[0];
      shift -= BITS;
    }

    return new PersistentVector(root, shift, this.size - 1);
  }

  toArray() {
    const result = new Array(this.size);
    for (let index = 0; index < this.size; index++) result[index] = this.get(index);
    return result;
  }

  [Symbol.iterator]() {
    let index = 0;
    const vector = this;
    return {
      next() {
        if (index >= vector.size) return { value: undefined, done: true };
        return { value: vector.get(index++), done: false };
      }
    };
  }
}

// ------------------------------- Tests ---------------------------------

function runTests() {
  let vector = PersistentVector.empty();
  assert.equal(vector.size, 0);
  assert.throws(() => vector.pop(), RangeError);

  const versions = [vector];
  for (let index = 0; index < 5000; index++) {
    vector = vector.push(index * 3);
    if (index % 500 === 0) versions.push(vector);
  }

  assert.equal(vector.size, 5000);
  for (const index of [0, 1, 30, 31, 32, 33, 1023, 1024, 1025, 4095, 4999]) {
    assert.equal(vector.get(index), index * 3);
  }

  const changed = vector.set(1024, "changed");
  assert.equal(changed.get(1024), "changed");
  assert.equal(vector.get(1024), 1024 * 3, "set must preserve the old version");

  const shortened = vector.pop().pop();
  assert.equal(shortened.size, 4998);
  assert.equal(shortened.get(4997), 4997 * 3);
  assert.equal(vector.size, 5000, "pop must preserve the old version");

  for (const oldVersion of versions) {
    assert.equal(oldVersion.size, oldVersion.toArray().length);
  }

  const boundary = PersistentVector.from(Array.from({ length: 1025 }, (_, i) => i));
  assert.deepEqual(boundary.pop().toArray(), Array.from({ length: 1024 }, (_, i) => i));
  assert.deepEqual([...PersistentVector.from(["a", "b", "c"])], ["a", "b", "c"]);

  console.log("Persistent vector trie: all tests passed.");
}

if (require.main === module) runTests();

module.exports = { PersistentVector };
