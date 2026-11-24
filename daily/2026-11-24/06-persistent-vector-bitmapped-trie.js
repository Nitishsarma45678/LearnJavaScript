'use strict';

const assert = require('node:assert/strict');

const BITS = 5;
const WIDTH = 1 << BITS;
const LEVELS = 6; // 32^6 addressable positions.

function setNode(node, level, index, value) {
  const copy = node.slice();
  const slot = Math.floor(index / (WIDTH ** level)) % WIDTH;
  if (level === 0) copy[slot] = value;
  else copy[slot] = setNode(copy[slot] || [], level - 1, index, value);
  return copy;
}

function getNode(node, level, index) {
  const slot = Math.floor(index / (WIDTH ** level)) % WIDTH;
  if (level === 0) return node[slot];
  return node[slot] ? getNode(node[slot], level - 1, index) : undefined;
}

class PersistentVector {
  constructor(root = [], length = 0) {
    this.root = root;
    this.length = length;
  }

  get(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.length) throw new RangeError('Index out of bounds');
    return getNode(this.root, LEVELS - 1, index);
  }

  set(index, value) {
    if (!Number.isInteger(index) || index < 0 || index >= this.length) throw new RangeError('Index out of bounds');
    return new PersistentVector(setNode(this.root, LEVELS - 1, index, value), this.length);
  }

  push(value) {
    if (this.length >= WIDTH ** LEVELS) throw new RangeError('Vector capacity exceeded');
    return new PersistentVector(setNode(this.root, LEVELS - 1, this.length, value), this.length + 1);
  }

  toArray() {
    return Array.from({ length: this.length }, (_, index) => this.get(index));
  }

  static from(iterable) {
    let vector = new PersistentVector();
    for (const value of iterable) vector = vector.push(value);
    return vector;
  }
}

const base = PersistentVector.from([10, 20, 30, 40]);
const changed = base.set(1, 99).push(50);
assert.deepEqual(base.toArray(), [10, 20, 30, 40]);
assert.deepEqual(changed.toArray(), [10, 99, 30, 40, 50]);
assert.equal(changed.get(4), 50);
assert.throws(() => base.get(4), RangeError);
assert.throws(() => base.set(-1, 0), RangeError);
console.log('Persistent-vector examples passed.');

module.exports = { PersistentVector };
