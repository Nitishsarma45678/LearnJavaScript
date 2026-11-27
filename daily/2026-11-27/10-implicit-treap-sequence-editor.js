'use strict';

// Exercise: implement an indexed sequence with expected O(log n) insertion,
// deletion, range reversal, lookup and range-sum using an implicit treap.

function createRandom(seed = 0x9e3779b9) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

class ImplicitTreap {
  constructor(values = [], seed) {
    this.random = createRandom(seed);
    this.root = null;
    for (const value of values) this.insert(this.length, value);
  }
  get length() { return size(this.root); }
  insert(index, value) {
    this.#checkIndex(index, true);
    const [left, right] = split(this.root, index);
    this.root = merge(merge(left, new Node(value, this.random())), right);
  }
  delete(index) {
    this.#checkIndex(index, false);
    const [left, tail] = split(this.root, index);
    const [middle, right] = split(tail, 1);
    this.root = merge(left, right);
    return middle.value;
  }
  reverse(start, end) {
    this.#checkRange(start, end);
    const [left, tail] = split(this.root, start);
    const [middle, right] = split(tail, end - start);
    if (middle) middle.reversed = !middle.reversed;
    this.root = merge(merge(left, middle), right);
  }
  at(index) {
    this.#checkIndex(index, false);
    let node = this.root;
    while (node) {
      push(node);
      const leftSize = size(node.left);
      if (index < leftSize) node = node.left;
      else if (index === leftSize) return node.value;
      else {
        index -= leftSize + 1;
        node = node.right;
      }
    }
  }
  rangeSum(start, end) {
    this.#checkRange(start, end);
    const [left, tail] = split(this.root, start);
    const [middle, right] = split(tail, end - start);
    const result = sum(middle);
    this.root = merge(merge(left, middle), right);
    return result;
  }
  toArray() {
    const output = [];
    const visit = node => {
      if (!node) return;
      push(node);
      visit(node.left);
      output.push(node.value);
      visit(node.right);
    };
    visit(this.root);
    return output;
  }
  #checkIndex(index, allowEnd) {
    const max = this.length;
    if (!Number.isInteger(index) || index < 0 || index > max || (!allowEnd && index === max)) {
      throw new RangeError('Index out of range');
    }
  }
  #checkRange(start, end) {
    if (!Number.isInteger(start) || !Number.isInteger(end) ||
        start < 0 || end < start || end > this.length) throw new RangeError('Invalid range');
  }
}

class Node {
  constructor(value, priority) {
    this.value = value;
    this.priority = priority;
    this.left = this.right = null;
    this.reversed = false;
    this.size = 1;
    this.sum = value;
  }
}
const size = node => node ? node.size : 0;
const sum = node => node ? node.sum : 0;
function update(node) {
  if (node) {
    node.size = 1 + size(node.left) + size(node.right);
    node.sum = node.value + sum(node.left) + sum(node.right);
  }
  return node;
}
function push(node) {
  if (node && node.reversed) {
    [node.left, node.right] = [node.right, node.left];
    if (node.left) node.left.reversed = !node.left.reversed;
    if (node.right) node.right.reversed = !node.right.reversed;
    node.reversed = false;
  }
}
function split(root, count) {
  if (!root) return [null, null];
  push(root);
  if (size(root.left) >= count) {
    const [left, middle] = split(root.left, count);
    root.left = middle;
    return [left, update(root)];
  }
  const [middle, right] = split(root.right, count - size(root.left) - 1);
  root.right = middle;
  return [update(root), right];
}
function merge(left, right) {
  if (!left) return right;
  if (!right) return left;
  if (left.priority < right.priority) {
    push(left);
    left.right = merge(left.right, right);
    return update(left);
  }
  push(right);
  right.left = merge(left, right.left);
  return update(right);
}

const assert = require('node:assert/strict');
const sequence = new ImplicitTreap([1, 2, 3, 4, 5], 42);
sequence.reverse(1, 4);
assert.deepEqual(sequence.toArray(), [1, 4, 3, 2, 5]);
assert.equal(sequence.rangeSum(1, 4), 9);
sequence.insert(2, 99);
assert.deepEqual(sequence.toArray(), [1, 4, 99, 3, 2, 5]);
assert.equal(sequence.delete(2), 99);
assert.equal(sequence.at(4), 5);
console.log('Implicit treap tests passed');

module.exports = { ImplicitTreap };
