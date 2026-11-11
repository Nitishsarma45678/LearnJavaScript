'use strict';

/**
 * Exercise: implement an in-memory B+ tree index for numeric keys.
 *
 * Internal nodes store separator keys; records live only in linked leaves.
 * Insertion splits overflowing nodes. Deletion borrows from siblings or
 * merges underfull nodes. range() walks the leaf chain rather than revisiting
 * internal nodes. validate() checks occupancy, separators, ordering, depth,
 * record count, and leaf-link integrity.
 *
 * Run: node daily/2026-11-11/bPlusTreeIndex.js
 */

const assert = require('node:assert/strict');

class BPlusNode {
  constructor(leaf) {
    this.leaf = leaf;
    this.keys = [];
    if (leaf) {
      this.values = [];
      this.next = null;
    } else {
      this.children = [];
    }
  }
}

class BPlusTree {
  constructor({ maxKeys = 4 } = {}) {
    if (!Number.isInteger(maxKeys) || maxKeys < 3) {
      throw new RangeError('maxKeys must be an integer of at least 3');
    }
    this.maxKeys = maxKeys;
    this.minLeafKeys = Math.ceil(maxKeys / 2);
    this.minChildren = Math.ceil((maxKeys + 1) / 2);
    this.root = new BPlusNode(true);
    this.size = 0;
  }

  _checkKey(key) {
    if (typeof key !== 'number' || !Number.isFinite(key)) {
      throw new TypeError('B+ tree keys must be finite numbers');
    }
  }

  _lowerBound(keys, key) {
    let low = 0;
    let high = keys.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (keys[middle] < key) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  _upperBound(keys, key) {
    let low = 0;
    let high = keys.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (keys[middle] <= key) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  _minimumKey(node) {
    while (!node.leaf) node = node.children[0];
    if (node.keys.length === 0) throw new Error('internal subtree has no minimum key');
    return node.keys[0];
  }

  _refresh(node) {
    if (!node.leaf) {
      node.keys = node.children.slice(1).map(child => this._minimumKey(child));
    }
  }

  _findLeaf(key) {
    let node = this.root;
    while (!node.leaf) {
      node = node.children[this._upperBound(node.keys, key)];
    }
    return node;
  }

  has(key) {
    this._checkKey(key);
    const leaf = this._findLeaf(key);
    const index = this._lowerBound(leaf.keys, key);
    return index < leaf.keys.length && leaf.keys[index] === key;
  }

  get(key) {
    this._checkKey(key);
    const leaf = this._findLeaf(key);
    const index = this._lowerBound(leaf.keys, key);
    return index < leaf.keys.length && leaf.keys[index] === key
      ? leaf.values[index]
      : undefined;
  }

  set(key, value) {
    this._checkKey(key);
    const existingLeaf = this._findLeaf(key);
    const existingIndex = this._lowerBound(existingLeaf.keys, key);
    if (existingIndex < existingLeaf.keys.length && existingLeaf.keys[existingIndex] === key) {
      existingLeaf.values[existingIndex] = value;
      return this;
    }

    const right = this._insert(this.root, key, value);
    this.size += 1;
    if (right) {
      const newRoot = new BPlusNode(false);
      newRoot.children = [this.root, right];
      this._refresh(newRoot);
      this.root = newRoot;
    }
    return this;
  }

  _insert(node, key, value) {
    if (node.leaf) {
      const index = this._lowerBound(node.keys, key);
      node.keys.splice(index, 0, key);
      node.values.splice(index, 0, value);
      if (node.keys.length <= this.maxKeys) return null;

      const right = new BPlusNode(true);
      const splitAt = Math.ceil(node.keys.length / 2);
      right.keys = node.keys.splice(splitAt);
      right.values = node.values.splice(splitAt);
      right.next = node.next;
      node.next = right;
      return right;
    }

    const childIndex = this._upperBound(node.keys, key);
    const rightChild = this._insert(node.children[childIndex], key, value);
    if (rightChild) node.children.splice(childIndex + 1, 0, rightChild);
    this._refresh(node);

    if (node.children.length <= this.maxKeys + 1) return null;
    const right = new BPlusNode(false);
    const splitAt = Math.ceil(node.children.length / 2);
    right.children = node.children.splice(splitAt);
    this._refresh(node);
    this._refresh(right);
    return right;
  }

  delete(key) {
    this._checkKey(key);
    const removed = this._delete(this.root, key);
    if (!removed) return false;
    this.size -= 1;

    while (!this.root.leaf && this.root.children.length === 1) {
      this.root = this.root.children[0];
    }
    return true;
  }

  _delete(node, key) {
    if (node.leaf) {
      const index = this._lowerBound(node.keys, key);
      if (index >= node.keys.length || node.keys[index] !== key) return false;
      node.keys.splice(index, 1);
      node.values.splice(index, 1);
      return true;
    }

    const childIndex = this._upperBound(node.keys, key);
    const child = node.children[childIndex];
    if (!this._delete(child, key)) return false;

    if (this._underflows(child)) this._rebalance(node, childIndex);
    this._refresh(node);
    return true;
  }

  _underflows(node) {
    return node.leaf
      ? node.keys.length < this.minLeafKeys
      : node.children.length < this.minChildren;
  }

  _rebalance(parent, index) {
    const child = parent.children[index];
    const left = index > 0 ? parent.children[index - 1] : null;
    const right = index + 1 < parent.children.length ? parent.children[index + 1] : null;

    if (child.leaf) {
      if (left && left.keys.length > this.minLeafKeys) {
        child.keys.unshift(left.keys.pop());
        child.values.unshift(left.values.pop());
        return;
      }
      if (right && right.keys.length > this.minLeafKeys) {
        child.keys.push(right.keys.shift());
        child.values.push(right.values.shift());
        return;
      }
      if (left) {
        left.keys.push(...child.keys);
        left.values.push(...child.values);
        left.next = child.next;
        parent.children.splice(index, 1);
      } else if (right) {
        child.keys.push(...right.keys);
        child.values.push(...right.values);
        child.next = right.next;
        parent.children.splice(index + 1, 1);
      }
      return;
    }

    if (left && left.children.length > this.minChildren) {
      child.children.unshift(left.children.pop());
      this._refresh(left);
      this._refresh(child);
      return;
    }
    if (right && right.children.length > this.minChildren) {
      child.children.push(right.children.shift());
      this._refresh(child);
      this._refresh(right);
      return;
    }
    if (left) {
      left.children.push(...child.children);
      this._refresh(left);
      parent.children.splice(index, 1);
    } else if (right) {
      child.children.push(...right.children);
      this._refresh(child);
      parent.children.splice(index + 1, 1);
    }
  }

  _leftmostLeaf() {
    let node = this.root;
    while (!node.leaf) node = node.children[0];
    return node;
  }

  range(from, to) {
    if (from !== undefined) this._checkKey(from);
    if (to !== undefined) this._checkKey(to);
    if (from !== undefined && to !== undefined && from > to) return [];

    let leaf;
    let index;
    if (from === undefined) {
      leaf = this._leftmostLeaf();
      index = 0;
    } else {
      leaf = this._findLeaf(from);
      index = this._lowerBound(leaf.keys, from);
    }

    const result = [];
    while (leaf) {
      for (let i = index; i < leaf.keys.length; i += 1) {
        const key = leaf.keys[i];
        if (to !== undefined && key > to) return result;
        result.push([key, leaf.values[i]]);
      }
      leaf = leaf.next;
      index = 0;
    }
    return result;
  }

  entries() {
    return this.range();
  }

  validate() {
    const leaves = [];
    let counted = 0;
    let expectedLeafDepth = null;

    const visit = (node, depth, isRoot) => {
      if (node.keys.length > this.maxKeys) throw new Error('node exceeds maxKeys');

      for (let i = 1; i < node.keys.length; i += 1) {
        if (node.keys[i - 1] >= node.keys[i]) throw new Error('node keys are not strictly sorted');
      }

      if (node.leaf) {
        if (node.values.length !== node.keys.length) throw new Error('leaf key/value lengths differ');
        if (!isRoot && node.keys.length < this.minLeafKeys) throw new Error('leaf is underfull');
        if (expectedLeafDepth === null) expectedLeafDepth = depth;
        if (expectedLeafDepth !== depth) throw new Error('leaves have different depths');
        leaves.push(node);
        counted += node.keys.length;
        return {
          min: node.keys.length ? node.keys[0] : null,
          max: node.keys.length ? node.keys[node.keys.length - 1] : null
        };
      }

      if (node.children.length !== node.keys.length + 1) {
        throw new Error('internal separator/child count mismatch');
      }
      if (isRoot && node.children.length < 2) throw new Error('internal root must have at least two children');
      if (!isRoot && node.children.length < this.minChildren) throw new Error('internal node is underfull');

      const childRanges = node.children.map(child => visit(child, depth + 1, false));
      for (let i = 1; i < childRanges.length; i += 1) {
        const previous = childRanges[i - 1];
        const current = childRanges[i];
        if (previous.max === null || current.min === null || previous.max >= current.min) {
          throw new Error('child key ranges overlap');
        }
        if (node.keys[i - 1] !== current.min) {
          throw new Error('separator is not the minimum key of its right child');
        }
      }
      return { min: childRanges[0].min, max: childRanges[childRanges.length - 1].max };
    };

    visit(this.root, 0, true);
    for (let i = 0; i < leaves.length; i += 1) {
      if (leaves[i].next !== (leaves[i + 1] || null)) {
        throw new Error('leaf next pointers do not match tree order');
      }
    }
    if (counted !== this.size) throw new Error('record count does not match tree size');
    return true;
  }
}

function runTests() {
  const tree = new BPlusTree({ maxKeys: 3 });
  [9, 1, 7, 3, 5, 2, 8, 6, 4].forEach(key => tree.set(key, 'v' + key));
  assert.equal(tree.validate(), true);
  assert.deepEqual(tree.range(3, 7).map(([key]) => key), [3, 4, 5, 6, 7]);
  assert.equal(tree.get(5), 'v5');
  tree.set(5, 'updated');
  assert.equal(tree.size, 9);
  assert.equal(tree.get(5), 'updated');

  for (const key of [1, 9, 4, 6, 2, 8, 3, 7, 5]) {
    assert.equal(tree.delete(key), true);
    assert.equal(tree.validate(), true);
  }
  assert.equal(tree.size, 0);
  assert.deepEqual(tree.entries(), []);
  assert.equal(tree.delete(123), false);

  let seed = 0x7a11ce;
  const random = limit => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % limit;
  };
  let operations = 0;

  for (let trial = 0; trial < 35; trial += 1) {
    const candidate = new BPlusTree({ maxKeys: 3 + random(5) });
    const reference = new Map();

    for (let step = 0; step < 260; step += 1) {
      const key = random(90);
      if (random(100) < 58) {
        const value = 'value-' + trial + '-' + step;
        candidate.set(key, value);
        reference.set(key, value);
      } else {
        assert.equal(candidate.delete(key), reference.delete(key));
      }

      assert.equal(candidate.validate(), true);
      const expected = Array.from(reference.entries()).sort((a, b) => a[0] - b[0]);
      assert.deepEqual(candidate.entries(), expected);
      assert.equal(candidate.has(key), reference.has(key));
      assert.equal(candidate.get(key), reference.get(key));

      const low = random(90);
      const high = low + random(91 - low);
      assert.deepEqual(
        candidate.range(low, high),
        expected.filter(([entryKey]) => entryKey >= low && entryKey <= high)
      );
      operations += 1;
    }
  }

  assert.throws(() => new BPlusTree({ maxKeys: 2 }), /at least 3/);
  assert.throws(() => tree.set(NaN, 'bad'), /finite numbers/);
  return { randomizedTrials: 35, randomizedOperations: operations };
}

if (require.main === module) {
  console.log('B+ tree index:', runTests());
}

module.exports = { BPlusTree, runTests };
