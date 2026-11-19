'use strict';

/**
 * Exercise: Build a binary search tree that supports duplicates and order
 * statistics. Each node stores the number of values in its subtree.
 *
 * Operations:
 * - insert(value), remove(value)
 * - kthSmallest(k), using 1-based k
 * - rank(value), number of stored values strictly less than value
 * - inOrder(), returning a sorted array including duplicates
 */

class Node {
  constructor(value) {
    this.value = value;
    this.count = 1;
    this.size = 1;
    this.left = null;
    this.right = null;
  }
}

function subtreeSize(node) {
  return node ? node.size : 0;
}

function refresh(node) {
  if (node) node.size = node.count + subtreeSize(node.left) + subtreeSize(node.right);
  return node;
}

class OrderStatisticBST {
  constructor() {
    this.root = null;
  }

  get size() { return subtreeSize(this.root); }

  _assertValue(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError('values must be finite numbers');
    }
  }

  insert(value) {
    this._assertValue(value);
    const add = (node) => {
      if (!node) return new Node(value);
      if (value < node.value) node.left = add(node.left);
      else if (value > node.value) node.right = add(node.right);
      else node.count += 1;
      return refresh(node);
    };
    this.root = add(this.root);
    return this;
  }

  remove(value) {
    this._assertValue(value);
    let removed = false;

    const removeWholeNode = (node, target) => {
      if (!node) return null;
      if (target < node.value) node.left = removeWholeNode(node.left, target);
      else if (target > node.value) node.right = removeWholeNode(node.right, target);
      else {
        if (!node.left) return node.right;
        if (!node.right) return node.left;
        let successor = node.right;
        while (successor.left) successor = successor.left;
        node.value = successor.value;
        node.count = successor.count;
        node.right = removeWholeNode(node.right, successor.value);
      }
      return refresh(node);
    };

    const removeOne = (node) => {
      if (!node) return null;
      if (value < node.value) node.left = removeOne(node.left);
      else if (value > node.value) node.right = removeOne(node.right);
      else {
        removed = true;
        if (node.count > 1) {
          node.count -= 1;
          return refresh(node);
        }
        if (!node.left) return node.right;
        if (!node.right) return node.left;
        let successor = node.right;
        while (successor.left) successor = successor.left;
        node.value = successor.value;
        node.count = successor.count;
        node.right = removeWholeNode(node.right, successor.value);
      }
      return refresh(node);
    };

    this.root = removeOne(this.root);
    return removed;
  }

  kthSmallest(k) {
    if (!Number.isInteger(k) || k < 1 || k > this.size) return undefined;
    let node = this.root;
    while (node) {
      const leftSize = subtreeSize(node.left);
      if (k <= leftSize) node = node.left;
      else if (k <= leftSize + node.count) return node.value;
      else {
        k -= leftSize + node.count;
        node = node.right;
      }
    }
    return undefined;
  }

  rank(value) {
    this._assertValue(value);
    let node = this.root;
    let count = 0;
    while (node) {
      if (value <= node.value) {
        node = node.left;
      } else {
        count += subtreeSize(node.left) + node.count;
        node = node.right;
      }
    }
    return count;
  }

  inOrder() {
    const values = [];
    const visit = (node) => {
      if (!node) return;
      visit(node.left);
      for (let count = 0; count < node.count; count += 1) values.push(node.value);
      visit(node.right);
    };
    visit(this.root);
    return values;
  }
}

function runTests() {
  const assert = require('node:assert/strict');
  const tree = new OrderStatisticBST();
  [5, 3, 7, 2, 4, 6, 8, 4].forEach((value) => tree.insert(value));
  assert.equal(tree.size, 8);
  assert.deepEqual(tree.inOrder(), [2, 3, 4, 4, 5, 6, 7, 8]);
  assert.equal(tree.kthSmallest(1), 2);
  assert.equal(tree.kthSmallest(4), 4);
  assert.equal(tree.kthSmallest(8), 8);
  assert.equal(tree.kthSmallest(9), undefined);
  assert.equal(tree.rank(5), 4);
  assert.equal(tree.rank(4), 2);

  assert.equal(tree.remove(4), true);
  assert.equal(tree.rank(5), 3);
  assert.equal(tree.remove(5), true, 'deleting a two-child root must preserve successor duplicates');
  assert.deepEqual(tree.inOrder(), [2, 3, 4, 6, 7, 8]);
  assert.equal(tree.size, 6);
  assert.equal(tree.remove(99), false);
  assert.throws(() => tree.insert(Infinity), /finite/);
}

if (require.main === module) {
  runTests();
  console.log('Order-statistic BST: all tests passed');
}

module.exports = { OrderStatisticBST };
