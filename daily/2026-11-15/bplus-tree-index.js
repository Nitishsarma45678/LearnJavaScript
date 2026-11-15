'use strict';

/**
 * In-memory B+ tree index for finite numeric keys.
 *
 * Leaves contain key/value pairs and are linked for efficient range scans.
 * Internal keys are separators: key[i] is the first key in child[i + 1].
 * Insertions split overflowing nodes; deletions borrow from siblings or merge
 * underfull nodes. The implementation is intentionally explicit so students
 * can inspect and validate every balancing invariant.
 */

const assert = require('node:assert/strict');

function lowerBound(array, value) {
  let low = 0, high = array.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (array[mid] < value) low = mid + 1;
    else high = mid;
  }
  return low;
}
function upperBound(array, value) {
  let low = 0, high = array.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (array[mid] <= value) low = mid + 1;
    else high = mid;
  }
  return low;
}
function leafNode() { return { leaf: true, keys: [], values: [], next: null }; }
function internalNode(children = []) { return { leaf: false, keys: [], children }; }

class BPlusTree {
  constructor(maxKeys = 4) {
    if (!Number.isInteger(maxKeys) || maxKeys < 3) throw new RangeError('maxKeys must be an integer >= 3');
    this.maxKeys = maxKeys;
    this.minLeafKeys = Math.ceil(maxKeys / 2);
    this.minChildren = Math.ceil((maxKeys + 1) / 2);
    this.root = leafNode();
    this.size = 0;
  }

  _key(key) {
    if (typeof key !== 'number' || !Number.isFinite(key)) throw new TypeError('B+ tree keys must be finite numbers');
    return key;
  }

  _firstKey(node) {
    let current = node;
    while (!current.leaf) current = current.children[0];
    if (current.keys.length === 0) throw new Error('Invariant violation: empty subtree has no first key');
    return current.keys[0];
  }

  _refresh(node) {
    if (!node.leaf) node.keys = node.children.slice(1).map(child => this._firstKey(child));
  }

  _findLeaf(key) {
    let node = this.root;
    while (!node.leaf) node = node.children[upperBound(node.keys, key)];
    return node;
  }

  has(key) {
    key = this._key(key);
    const leaf = this._findLeaf(key);
    const index = lowerBound(leaf.keys, key);
    return index < leaf.keys.length && leaf.keys[index] === key;
  }

  get(key, fallback = undefined) {
    key = this._key(key);
    const leaf = this._findLeaf(key);
    const index = lowerBound(leaf.keys, key);
    return index < leaf.keys.length && leaf.keys[index] === key ? leaf.values[index] : fallback;
  }

  set(key, value) {
    key = this._key(key);
    const split = this._insert(this.root, key, value);
    if (split) {
      this.root = internalNode([this.root, split]);
      this._refresh(this.root);
    }
    return this;
  }

  _insert(node, key, value) {
    if (node.leaf) {
      const index = lowerBound(node.keys, key);
      if (node.keys[index] === key) {
        node.values[index] = value;
        return null;
      }
      node.keys.splice(index, 0, key);
      node.values.splice(index, 0, value);
      this.size++;
      if (node.keys.length <= this.maxKeys) return null;
      const splitAt = Math.ceil(node.keys.length / 2);
      const right = leafNode();
      right.keys = node.keys.splice(splitAt);
      right.values = node.values.splice(splitAt);
      right.next = node.next;
      node.next = right;
      return right;
    }

    const childIndex = upperBound(node.keys, key);
    const split = this._insert(node.children[childIndex], key, value);
    if (split) node.children.splice(childIndex + 1, 0, split);
    this._refresh(node);
    if (node.children.length <= this.maxKeys + 1) return null;
    const splitAt = Math.ceil(node.children.length / 2);
    const right = internalNode(node.children.splice(splitAt));
    this._refresh(node);
    this._refresh(right);
    return right;
  }

  delete(key) {
    key = this._key(key);
    const removed = this._delete(this.root, key, true);
    if (!removed) return false;
    this.size--;
    if (!this.root.leaf && this.root.children.length === 1) this.root = this.root.children[0];
    this._refresh(this.root);
    return true;
  }

  _occupancy(node) { return node.leaf ? node.keys.length : node.children.length; }
  _minimum(node) { return node.leaf ? this.minLeafKeys : this.minChildren; }

  _delete(node, key, isRoot) {
    if (node.leaf) {
      const index = lowerBound(node.keys, key);
      if (index >= node.keys.length || node.keys[index] !== key) return false;
      node.keys.splice(index, 1);
      node.values.splice(index, 1);
      return true;
    }

    const childIndex = upperBound(node.keys, key);
    const child = node.children[childIndex];
    if (!this._delete(child, key, false)) return false;
    if (this._occupancy(child) < this._minimum(child)) this._rebalance(node, childIndex);
    this._refresh(node);
    return true;
  }

  _rebalance(parent, index) {
    const child = parent.children[index];
    const left = index > 0 ? parent.children[index - 1] : null;
    const right = index + 1 < parent.children.length ? parent.children[index + 1] : null;
    const minimum = this._minimum(child);

    if (left && this._occupancy(left) > minimum) {
      if (child.leaf) {
        child.keys.unshift(left.keys.pop());
        child.values.unshift(left.values.pop());
      } else {
        child.children.unshift(left.children.pop());
        this._refresh(left);
        this._refresh(child);
      }
      this._refresh(parent);
      return;
    }
    if (right && this._occupancy(right) > minimum) {
      if (child.leaf) {
        child.keys.push(right.keys.shift());
        child.values.push(right.values.shift());
      } else {
        child.children.push(right.children.shift());
        this._refresh(right);
        this._refresh(child);
      }
      this._refresh(parent);
      return;
    }

    if (left) {
      if (child.leaf) {
        left.keys.push(...child.keys);
        left.values.push(...child.values);
        left.next = child.next;
      } else {
        left.children.push(...child.children);
        this._refresh(left);
      }
      parent.children.splice(index, 1);
      this._refresh(parent);
      return;
    }

    if (!right) throw new Error('Invariant violation: underfull node has no sibling');
    if (child.leaf) {
      child.keys.push(...right.keys);
      child.values.push(...right.values);
      child.next = right.next;
    } else {
      child.children.push(...right.children);
      this._refresh(child);
    }
    parent.children.splice(index + 1, 1);
    this._refresh(parent);
  }

  *range(options = {}) {
    const hasMin = Object.prototype.hasOwnProperty.call(options, 'min');
    const hasMax = Object.prototype.hasOwnProperty.call(options, 'max');
    const min = hasMin ? this._key(options.min) : -Infinity;
    const max = hasMax ? this._key(options.max) : Infinity;
    const includeMin = options.includeMin !== false;
    const includeMax = options.includeMax !== false;
    if (min > max) return;
    let leaf = hasMin ? this._findLeaf(min) : this._leftmostLeaf();
    let index = hasMin
      ? (includeMin ? lowerBound(leaf.keys, min) : upperBound(leaf.keys, min))
      : 0;
    while (leaf) {
      for (; index < leaf.keys.length; index++) {
        const key = leaf.keys[index];
        if (key > max || (key === max && !includeMax)) return;
        if (key > min || (includeMin && key === min)) yield [key, leaf.values[index]];
      }
      leaf = leaf.next;
      index = 0;
    }
  }

  _leftmostLeaf() {
    let node = this.root;
    while (!node.leaf) node = node.children[0];
    return node;
  }

  *entries() { yield* this.range(); }
  [Symbol.iterator]() { return this.entries(); }

  validate() {
    const leaves = [];
    let counted = 0;
    let leafDepth = null;
    const visit = (node, depth, isRoot) => {
      for (let i = 1; i < node.keys.length; i++) {
        if (!(node.keys[i - 1] < node.keys[i])) throw new Error('Keys are not strictly sorted');
      }
      if (node.leaf) {
        if (node.keys.length !== node.values.length) throw new Error('Leaf key/value length mismatch');
        if (!isRoot && node.keys.length < this.minLeafKeys) throw new Error('Leaf underflow');
        if (node.keys.length > this.maxKeys) throw new Error('Leaf overflow');
        if (leafDepth === null) leafDepth = depth;
        else if (leafDepth !== depth) throw new Error('Leaves have different depths');
        leaves.push(node);
        counted += node.keys.length;
        return { min: node.keys[0], max: node.keys.at(-1) };
      }
      if (node.keys.length !== node.children.length - 1) throw new Error('Separator/child count mismatch');
      if (node.children.length > this.maxKeys + 1) throw new Error('Internal overflow');
      if (isRoot ? node.children.length < 2 : node.children.length < this.minChildren) {
        throw new Error('Internal underflow');
      }
      const ranges = node.children.map(child => visit(child, depth + 1, false));
      for (let i = 1; i < ranges.length; i++) {
        if (ranges[i - 1].max >= ranges[i].min) throw new Error('Child key ranges overlap');
        if (node.keys[i - 1] !== ranges[i].min) throw new Error('Incorrect separator key');
      }
      return { min: ranges[0].min, max: ranges.at(-1).max };
    };
    visit(this.root, 0, true);
    if (counted !== this.size) throw new Error(`Size mismatch: ${counted} != ${this.size}`);
    for (let i = 0; i < leaves.length; i++) {
      if (leaves[i].next !== (leaves[i + 1] || null)) throw new Error('Broken leaf linked list');
    }
    return true;
  }
}

function runTests() {
  const tree = new BPlusTree(3);
  for (const key of [8, 1, 5, 3, 9, 2, 7, 4, 6]) tree.set(key, `v${key}`);
  assert.equal(tree.size, 9);
  assert.equal(tree.get(5), 'v5');
  assert.equal(tree.has(10), false);
  assert.deepEqual([...tree.range({ min: 3, max: 7 })].map(([key]) => key), [3, 4, 5, 6, 7]);
  assert.deepEqual([...tree.range({ min: 3, max: 7, includeMin: false, includeMax: false })].map(([key]) => key), [4, 5, 6]);
  tree.set(5, 'updated');
  assert.equal(tree.size, 9, 'updating a key must not change size');
  assert.equal(tree.get(5), 'updated');
  for (const key of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    assert.equal(tree.delete(key), true);
    tree.validate();
  }
  assert.equal(tree.size, 0);
  assert.deepEqual([...tree], []);
  assert.equal(tree.delete(99), false);

  let seed = 0x0badc0de;
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 0x100000000);
  const randomized = new BPlusTree(4);
  const reference = new Map();
  for (let step = 0; step < 1800; step++) {
    const key = Math.floor(random() * 240) - 120;
    if (random() < 0.59) {
      const value = `value-${step}`;
      randomized.set(key, value);
      reference.set(key, value);
    } else {
      assert.equal(randomized.delete(key), reference.delete(key));
    }
    randomized.validate();
    assert.equal(randomized.size, reference.size);
    for (const [candidate, value] of reference) assert.equal(randomized.get(candidate), value);
    if (step % 30 === 0) {
      const sorted = [...reference].sort((a, b) => a[0] - b[0]);
      assert.deepEqual([...randomized], sorted);
    }
  }
  assert.throws(() => randomized.set(NaN, 'bad'), /finite/);
  console.log('B+ Tree Index: all tests passed');
}

if (require.main === module) runTests();
module.exports = { BPlusTree, lowerBound, upperBound, runTests };
