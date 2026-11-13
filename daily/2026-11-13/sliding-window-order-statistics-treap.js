'use strict';

/*
 * Exercise: Maintain order statistics in a multiset using a randomized treap.
 *
 * Duplicate keys are stored as multiplicities. Subtree sizes support rank
 * (number of values strictly smaller than a key) and zero-based select in
 * expected O(log n). SlidingWindowOrderStatistics adds bounded-window
 * insertion/eviction and interpolated quantiles.
 */

const assert = require('node:assert/strict');

class TreapNode {
  constructor(key, priority) {
    this.key = key;
    this.priority = priority;
    this.count = 1;
    this.size = 1;
    this.left = null;
    this.right = null;
  }
}

class OrderStatisticTreap {
  constructor(seed = 0x9e3779b9) {
    this.root = null;
    this.randomState = seed >>> 0 || 1;
  }

  _random() {
    let x = this.randomState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.randomState = x >>> 0;
    return this.randomState;
  }

  _size(node) {
    return node ? node.size : 0;
  }

  _update(node) {
    if (node) {
      node.size = node.count + this._size(node.left) + this._size(node.right);
    }
    return node;
  }

  _rotateRight(root) {
    const next = root.left;
    root.left = next.right;
    next.right = this._update(root);
    return this._update(next);
  }

  _rotateLeft(root) {
    const next = root.right;
    root.right = next.left;
    next.left = this._update(root);
    return this._update(next);
  }

  _insert(node, key) {
    if (!node) return new TreapNode(key, this._random());
    if (key === node.key) {
      node.count++;
      return this._update(node);
    }
    if (key < node.key) {
      node.left = this._insert(node.left, key);
      if (node.left.priority < node.priority) node = this._rotateRight(node);
    } else {
      node.right = this._insert(node.right, key);
      if (node.right.priority < node.priority) node = this._rotateLeft(node);
    }
    return this._update(node);
  }

  _merge(left, right) {
    if (!left) return right;
    if (!right) return left;
    if (left.priority <= right.priority) {
      left.right = this._merge(left.right, right);
      return this._update(left);
    }
    right.left = this._merge(left, right.left);
    return this._update(right);
  }

  _erase(node, key) {
    if (!node) return { node: null, removed: false };
    if (key < node.key) {
      const result = this._erase(node.left, key);
      node.left = result.node;
      return { node: this._update(node), removed: result.removed };
    }
    if (key > node.key) {
      const result = this._erase(node.right, key);
      node.right = result.node;
      return { node: this._update(node), removed: result.removed };
    }
    if (node.count > 1) {
      node.count--;
      return { node: this._update(node), removed: true };
    }
    return { node: this._merge(node.left, node.right), removed: true };
  }

  _assertKey(key) {
    if (typeof key !== 'number' || !Number.isFinite(key)) {
      throw new TypeError('treap keys must be finite numbers');
    }
  }

  insert(key) {
    this._assertKey(key);
    this.root = this._insert(this.root, key);
    return this;
  }

  erase(key) {
    this._assertKey(key);
    const result = this._erase(this.root, key);
    this.root = result.node;
    return result.removed;
  }

  count(key) {
    this._assertKey(key);
    let node = this.root;
    while (node) {
      if (key === node.key) return node.count;
      node = key < node.key ? node.left : node.right;
    }
    return 0;
  }

  rank(key) {
    this._assertKey(key);
    let node = this.root;
    let result = 0;
    while (node) {
      if (key <= node.key) {
        node = node.left;
      } else {
        result += this._size(node.left) + node.count;
        node = node.right;
      }
    }
    return result;
  }

  select(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.size) return undefined;
    let node = this.root;
    let remaining = index;
    while (node) {
      const leftSize = this._size(node.left);
      if (remaining < leftSize) {
        node = node.left;
      } else if (remaining < leftSize + node.count) {
        return node.key;
      } else {
        remaining -= leftSize + node.count;
        node = node.right;
      }
    }
    return undefined;
  }

  rangeCount(low, high) {
    this._assertKey(low);
    this._assertKey(high);
    if (low > high) return 0;
    return this.rank(high) + this.count(high) - this.rank(low);
  }

  get size() {
    return this._size(this.root);
  }

  min() {
    let node = this.root;
    if (!node) return undefined;
    while (node.left) node = node.left;
    return node.key;
  }

  max() {
    let node = this.root;
    if (!node) return undefined;
    while (node.right) node = node.right;
    return node.key;
  }

  toArray() {
    const result = [];
    const visit = node => {
      if (!node) return;
      visit(node.left);
      for (let i = 0; i < node.count; i++) result.push(node.key);
      visit(node.right);
    };
    visit(this.root);
    return result;
  }

  validate() {
    const inspect = (node, lower, upper, parentPriority) => {
      if (!node) return 0;
      if (!(node.key > lower && node.key < upper)) {
        throw new Error('BST ordering invariant violated');
      }
      if (node.priority < parentPriority) {
        throw new Error('treap heap invariant violated');
      }
      if (!Number.isInteger(node.count) || node.count < 1) {
        throw new Error('invalid multiplicity');
      }
      const leftSize = inspect(node.left, lower, node.key, node.priority);
      const rightSize = inspect(node.right, node.key, upper, node.priority);
      const expected = leftSize + rightSize + node.count;
      if (node.size !== expected) throw new Error('subtree size invariant violated');
      return expected;
    };
    return inspect(this.root, -Infinity, Infinity, -Infinity) === this.size;
  }
}

class SlidingWindowOrderStatistics {
  constructor(windowSize, seed) {
    if (!Number.isInteger(windowSize) || windowSize < 1) {
      throw new RangeError('windowSize must be a positive integer');
    }
    this.windowSize = windowSize;
    this.tree = new OrderStatisticTreap(seed);
    this.queue = [];
    this.head = 0;
  }

  push(value) {
    this.tree.insert(value);
    this.queue.push(value);
    if (this.queue.length - this.head > this.windowSize) {
      const expired = this.queue[this.head++];
      if (!this.tree.erase(expired)) throw new Error('window/tree state diverged');
    }
    if (this.head > 1024 && this.head * 2 > this.queue.length) {
      this.queue = this.queue.slice(this.head);
      this.head = 0;
    }
    return this;
  }

  get size() {
    return this.tree.size;
  }

  values() {
    return this.tree.toArray();
  }

  quantile(q) {
    if (typeof q !== 'number' || !Number.isFinite(q) || q < 0 || q > 1) {
      throw new RangeError('q must be between 0 and 1');
    }
    if (this.size === 0) return undefined;
    const position = q * (this.size - 1);
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.ceil(position);
    const lower = this.tree.select(lowerIndex);
    if (lowerIndex === upperIndex) return lower;
    const upper = this.tree.select(upperIndex);
    return lower + (upper - lower) * (position - lowerIndex);
  }

  median() {
    return this.quantile(0.5);
  }
}

function runTests() {
  const tree = new OrderStatisticTreap(12345);
  [5, 1, 5, 3, 9, 3, 3].forEach(value => tree.insert(value));
  assert.deepEqual(tree.toArray(), [1, 3, 3, 3, 5, 5, 9]);
  assert.equal(tree.size, 7);
  assert.equal(tree.count(3), 3);
  assert.equal(tree.rank(5), 4);
  assert.equal(tree.select(0), 1);
  assert.equal(tree.select(3), 3);
  assert.equal(tree.select(6), 9);
  assert.equal(tree.select(7), undefined);
  assert.equal(tree.rangeCount(3, 5), 5);
  assert.equal(tree.min(), 1);
  assert.equal(tree.max(), 9);
  assert.equal(tree.erase(3), true);
  assert.equal(tree.count(3), 2);
  assert.equal(tree.erase(100), false);
  assert.equal(tree.validate(), true);

  // Differential test: randomized inserts/deletes against a sorted array.
  let seed = 0xdecafbad;
  const random = max => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) % max;
  };
  const randomized = new OrderStatisticTreap(9876);
  const reference = [];
  for (let step = 0; step < 1800; step++) {
    const value = random(61) - 30;
    if (random(3) !== 0) {
      randomized.insert(value);
      reference.push(value);
      reference.sort((a, b) => a - b);
    } else {
      const index = reference.indexOf(value);
      const expected = index !== -1;
      if (expected) reference.splice(index, 1);
      assert.equal(randomized.erase(value), expected);
    }

    assert.equal(randomized.size, reference.length);
    assert.equal(randomized.validate(), true);
    if (reference.length > 0) {
      const probe = random(71) - 35;
      assert.equal(
        randomized.rank(probe),
        reference.filter(item => item < probe).length
      );
      const selected = random(reference.length);
      assert.equal(randomized.select(selected), reference[selected]);
    }
  }
  assert.deepEqual(randomized.toArray(), reference);

  const window = new SlidingWindowOrderStatistics(4, 42);
  [1, 2, 3, 4, 5, 6].forEach(value => window.push(value));
  assert.deepEqual(window.values(), [3, 4, 5, 6]);
  assert.equal(window.median(), 4.5);
  assert.equal(window.quantile(0), 3);
  assert.equal(window.quantile(1), 6);
  assert.equal(window.quantile(0.25), 3.75);
  assert.equal(window.quantile(0.75), 5.25);
  window.push(6).push(6);
  assert.deepEqual(window.values(), [6, 6, 6, 6]);
  assert.equal(window.median(), 6);
  assert.throws(() => window.quantile(1.1), RangeError);
  assert.throws(() => new SlidingWindowOrderStatistics(0), RangeError);
  assert.throws(() => tree.insert(Infinity), TypeError);

  console.log('OrderStatisticTreap: all tests passed');
}

if (require.main === module) runTests();

module.exports = {
  OrderStatisticTreap,
  SlidingWindowOrderStatistics
};
