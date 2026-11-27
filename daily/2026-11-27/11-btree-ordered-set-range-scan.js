'use strict';

// Exercise: implement a B-tree set with split-on-descent insertion, membership
// lookup, in-order traversal and inclusive range scans.

class BTreeSet {
  constructor(minDegree = 3) {
    if (!Number.isInteger(minDegree) || minDegree < 2) throw new RangeError('minDegree must be >= 2');
    this.t = minDegree;
    this.root = new Node(true);
  }

  has(key) {
    let node = this.root;
    while (node) {
      const i = lowerBound(node.keys, key);
      if (node.keys[i] === key) return true;
      if (node.leaf) return false;
      node = node.children[i];
    }
    return false;
  }

  add(key) {
    if (this.has(key)) return false;
    const root = this.root;
    if (root.keys.length === 2 * this.t - 1) {
      const newRoot = new Node(false);
      newRoot.children.push(root);
      this.#splitChild(newRoot, 0);
      this.root = newRoot;
    }
    this.#insertNonFull(this.root, key);
    return true;
  }

  #splitChild(parent, index) {
    const full = parent.children[index];
    const right = new Node(full.leaf);
    const median = full.keys[this.t - 1];
    right.keys = full.keys.slice(this.t);
    full.keys = full.keys.slice(0, this.t - 1);
    if (!full.leaf) {
      right.children = full.children.slice(this.t);
      full.children = full.children.slice(0, this.t);
    }
    parent.children.splice(index + 1, 0, right);
    parent.keys.splice(index, 0, median);
  }

  #insertNonFull(node, key) {
    let index = lowerBound(node.keys, key);
    if (node.leaf) {
      node.keys.splice(index, 0, key);
      return;
    }
    if (node.children[index].keys.length === 2 * this.t - 1) {
      this.#splitChild(node, index);
      if (key > node.keys[index]) index += 1;
    }
    this.#insertNonFull(node.children[index], key);
  }

  values() {
    const result = [];
    const visit = node => {
      for (let i = 0; i < node.keys.length; i += 1) {
        if (!node.leaf) visit(node.children[i]);
        result.push(node.keys[i]);
      }
      if (!node.leaf) visit(node.children[node.keys.length]);
    };
    visit(this.root);
    return result;
  }

  range(min, max) {
    if (min > max) return [];
    const result = [];
    const visit = node => {
      for (let i = 0; i < node.keys.length; i += 1) {
        if (!node.leaf && node.keys[i] >= min) visit(node.children[i]);
        if (node.keys[i] >= min && node.keys[i] <= max) result.push(node.keys[i]);
        if (node.keys[i] > max) return;
      }
      if (!node.leaf) visit(node.children[node.keys.length]);
    };
    visit(this.root);
    return result;
  }
}

class Node {
  constructor(leaf) {
    this.leaf = leaf;
    this.keys = [];
    this.children = [];
  }
}
function lowerBound(values, target) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (values[mid] < target) low = mid + 1;
    else high = mid;
  }
  return low;
}

const assert = require('node:assert/strict');
const tree = new BTreeSet(2);
for (const value of [10, 4, 20, 1, 7, 15, 30, 3, 5, 8, 12, 18]) tree.add(value);
assert.equal(tree.has(15), true);
assert.equal(tree.has(99), false);
assert.equal(tree.add(7), false);
assert.deepEqual(tree.values(), [1, 3, 4, 5, 7, 8, 10, 12, 15, 18, 20, 30]);
assert.deepEqual(tree.range(5, 15), [5, 7, 8, 10, 12, 15]);
console.log('B-tree set tests passed');

module.exports = { BTreeSet };
