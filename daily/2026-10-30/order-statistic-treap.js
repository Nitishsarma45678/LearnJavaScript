'use strict';

/**
 * Order-statistic treap for numeric keys (duplicates are stored as counts).
 * Supports insert/remove, rank (< key), select (zero-based), and count in
 * expected O(log n) time. A seeded xorshift generator makes tests repeatable.
 */
class Node {
  constructor(key, priority) {
    this.key = key;
    this.priority = priority;
    this.count = 1;
    this.size = 1;
    this.left = null;
    this.right = null;
  }
}

function size(node) {
  return node ? node.size : 0;
}

function refresh(node) {
  if (node) node.size = size(node.left) + node.count + size(node.right);
  return node;
}

function rotateRight(root) {
  const next = root.left;
  root.left = next.right;
  next.right = refresh(root);
  return refresh(next);
}

function rotateLeft(root) {
  const next = root.right;
  root.right = next.left;
  next.left = refresh(root);
  return refresh(next);
}

class OrderStatisticTreap {
  constructor(seed = 0x9e3779b9) {
    this.root = null;
    this.state = seed >>> 0 || 1;
  }

  get size() {
    return size(this.root);
  }

  nextPriority() {
    // xorshift32: deterministic pseudo-random priorities in [0, 1).
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0 || 1;
    return this.state / 0x100000000;
  }

  insert(key) {
    this.assertKey(key);
    this.root = this.insertNode(this.root, key);
    return this;
  }

  insertNode(root, key) {
    if (!root) return new Node(key, this.nextPriority());
    if (key === root.key) {
      root.count += 1;
    } else if (key < root.key) {
      root.left = this.insertNode(root.left, key);
      if (root.left.priority < root.priority) root = rotateRight(root);
    } else {
      root.right = this.insertNode(root.right, key);
      if (root.right.priority < root.priority) root = rotateLeft(root);
    }
    return refresh(root);
  }

  remove(key) {
    this.assertKey(key);
    const before = this.size;
    this.root = this.removeNode(this.root, key);
    return this.size !== before;
  }

  removeNode(root, key) {
    if (!root) return null;
    if (key < root.key) {
      root.left = this.removeNode(root.left, key);
    } else if (key > root.key) {
      root.right = this.removeNode(root.right, key);
    } else if (root.count > 1) {
      root.count -= 1;
    } else {
      return this.merge(root.left, root.right);
    }
    return refresh(root);
  }

  merge(left, right) {
    if (!left) return right;
    if (!right) return left;
    if (left.priority < right.priority) {
      left.right = this.merge(left.right, right);
      return refresh(left);
    }
    right.left = this.merge(left, right.left);
    return refresh(right);
  }

  count(key) {
    this.assertKey(key);
    let node = this.root;
    while (node) {
      if (key === node.key) return node.count;
      node = key < node.key ? node.left : node.right;
    }
    return 0;
  }

  // Number of stored values strictly smaller than key.
  rank(key) {
    this.assertKey(key);
    let node = this.root;
    let result = 0;
    while (node) {
      if (key <= node.key) {
        node = node.left;
      } else {
        result += size(node.left) + node.count;
        node = node.right;
      }
    }
    return result;
  }

  // Return the value at zero-based sorted position index.
  select(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.size) {
      throw new RangeError(\`index must be an integer in [0, \${this.size})\`);
    }
    let node = this.root;
    while (node) {
      const leftSize = size(node.left);
      if (index < leftSize) {
        node = node.left;
      } else if (index < leftSize + node.count) {
        return node.key;
      } else {
        index -= leftSize + node.count;
        node = node.right;
      }
    }
    throw new Error('Treap size invariant is broken');
  }

  toArray() {
    const result = [];
    const visit = node => {
      if (!node) return;
      visit(node.left);
      for (let i = 0; i < node.count; i += 1) result.push(node.key);
      visit(node.right);
    };
    visit(this.root);
    return result;
  }

  assertKey(key) {
    if (typeof key !== 'number' || !Number.isFinite(key)) {
      throw new TypeError('Keys must be finite numbers');
    }
  }
}

// Example and differential tests against a sorted-array reference model.
const assert = require('node:assert/strict');
const tree = new OrderStatisticTreap(12345);
[5, 1, 9, 5, -2, 7, 5].forEach(value => tree.insert(value));
assert.deepEqual(tree.toArray(), [-2, 1, 5, 5, 5, 7, 9]);
assert.equal(tree.size, 7);
assert.equal(tree.count(5), 3);
assert.equal(tree.rank(5), 2);
assert.equal(tree.rank(6), 5);
assert.equal(tree.select(0), -2);
assert.equal(tree.select(3), 5);
assert.equal(tree.select(6), 9);
assert.equal(tree.remove(5), true);
assert.equal(tree.count(5), 2);
assert.equal(tree.remove(42), false);
assert.throws(() => tree.select(99), RangeError);

const randomTree = new OrderStatisticTreap(7);
const reference = [];
let seed = 2026;
function randomInt(max) {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed % max;
}
for (let step = 0; step < 500; step += 1) {
  const value = randomInt(41) - 20;
  if (randomInt(3) !== 0) {
    randomTree.insert(value);
    reference.push(value);
    reference.sort((a, b) => a - b);
  } else {
    const expectedIndex = reference.indexOf(value);
    assert.equal(randomTree.remove(value), expectedIndex !== -1);
    if (expectedIndex !== -1) reference.splice(expectedIndex, 1);
  }
  assert.deepEqual(randomTree.toArray(), reference);
  assert.equal(randomTree.size, reference.length);
  const probe = randomInt(51) - 25;
  assert.equal(randomTree.rank(probe), reference.filter(x => x < probe).length);
  if (reference.length) {
    const index = randomInt(reference.length);
    assert.equal(randomTree.select(index), reference[index]);
  }
}
assert.throws(() => tree.insert(Infinity), TypeError);
console.log('order-statistic-treap: all tests passed');
