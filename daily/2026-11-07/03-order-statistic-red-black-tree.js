'use strict';

/**
 * Exercise: Implement an order-statistic red-black tree (set semantics).
 *
 * Required operations: insert, delete, has, rank (count of keys smaller than
 * a key), select (zero-based kth key), inclusive range scan, and invariant
 * validation. Updates must remain O(log n); subtree sizes are maintained by
 * rotations and ancestor repair rather than recomputed across the whole tree.
 */

const RED = 0;
const BLACK = 1;

class Node {
  constructor(key, color, nil) {
    this.key = key;
    this.color = color;
    this.left = nil;
    this.right = nil;
    this.parent = nil;
    this.size = 1;
  }
}

class OrderStatisticRedBlackTree {
  constructor(compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)) {
    if (typeof compare !== 'function') throw new TypeError('compare must be a function');
    this.compare = compare;
    this.nil = new Node(undefined, BLACK, null);
    this.nil.left = this.nil.right = this.nil.parent = this.nil;
    this.nil.size = 0;
    this.root = this.nil;
    this._size = 0;
  }

  get size() { return this._size; }
  _update(node) {
    if (node !== this.nil) node.size = node.left.size + node.right.size + 1;
  }
  _repairUp(node) {
    while (node !== this.nil) {
      this._update(node);
      node = node.parent;
    }
  }
  _find(key) {
    let node = this.root;
    while (node !== this.nil) {
      const order = this.compare(key, node.key);
      if (order === 0) return node;
      node = order < 0 ? node.left : node.right;
    }
    return this.nil;
  }
  has(key) { return this._find(key) !== this.nil; }

  _rotateLeft(x) {
    const y = x.right;
    x.right = y.left;
    if (y.left !== this.nil) y.left.parent = x;
    y.parent = x.parent;
    if (x.parent === this.nil) this.root = y;
    else if (x === x.parent.left) x.parent.left = y;
    else x.parent.right = y;
    y.left = x;
    x.parent = y;
    this._update(x);
    this._update(y);
  }

  _rotateRight(y) {
    const x = y.left;
    y.left = x.right;
    if (x.right !== this.nil) x.right.parent = y;
    x.parent = y.parent;
    if (y.parent === this.nil) this.root = x;
    else if (y === y.parent.right) y.parent.right = x;
    else y.parent.left = x;
    x.right = y;
    y.parent = x;
    this._update(y);
    this._update(x);
  }

  insert(key) {
    let parent = this.nil;
    let cursor = this.root;
    while (cursor !== this.nil) {
      parent = cursor;
      const order = this.compare(key, cursor.key);
      if (order === 0) return false;
      cursor = order < 0 ? cursor.left : cursor.right;
    }

    const node = new Node(key, RED, this.nil);
    node.parent = parent;
    if (parent === this.nil) this.root = node;
    else if (this.compare(key, parent.key) < 0) parent.left = node;
    else parent.right = node;
    this._size++;
    this._repairUp(parent);
    this._insertFixup(node);
    this.root.parent = this.nil;
    return true;
  }

  _insertFixup(z) {
    while (z.parent.color === RED) {
      if (z.parent === z.parent.parent.left) {
        let uncle = z.parent.parent.right;
        if (uncle.color === RED) {
          z.parent.color = BLACK;
          uncle.color = BLACK;
          z.parent.parent.color = RED;
          z = z.parent.parent;
        } else {
          if (z === z.parent.right) {
            z = z.parent;
            this._rotateLeft(z);
          }
          z.parent.color = BLACK;
          z.parent.parent.color = RED;
          this._rotateRight(z.parent.parent);
        }
      } else {
        let uncle = z.parent.parent.left;
        if (uncle.color === RED) {
          z.parent.color = BLACK;
          uncle.color = BLACK;
          z.parent.parent.color = RED;
          z = z.parent.parent;
        } else {
          if (z === z.parent.left) {
            z = z.parent;
            this._rotateRight(z);
          }
          z.parent.color = BLACK;
          z.parent.parent.color = RED;
          this._rotateLeft(z.parent.parent);
        }
      }
    }
    this.root.color = BLACK;
  }

  _minimum(node) {
    while (node.left !== this.nil) node = node.left;
    return node;
  }
  _transplant(u, v) {
    if (u.parent === this.nil) this.root = v;
    else if (u === u.parent.left) u.parent.left = v;
    else u.parent.right = v;
    v.parent = u.parent;
  }

  delete(key) {
    const z = this._find(key);
    if (z === this.nil) return false;
    let y = z;
    let originalColor = y.color;
    let x;

    if (z.left === this.nil) {
      x = z.right;
      const oldParent = z.parent;
      this._transplant(z, z.right);
      this._repairUp(oldParent);
    } else if (z.right === this.nil) {
      x = z.left;
      const oldParent = z.parent;
      this._transplant(z, z.left);
      this._repairUp(oldParent);
    } else {
      y = this._minimum(z.right);
      originalColor = y.color;
      x = y.right;
      if (y.parent === z) {
        x.parent = y;
      } else {
        const oldParent = y.parent;
        this._transplant(y, y.right);
        this._repairUp(oldParent);
        y.right = z.right;
        y.right.parent = y;
      }
      this._transplant(z, y);
      y.left = z.left;
      y.left.parent = y;
      y.color = z.color;
      this._update(y);
      this._repairUp(y.parent);
    }

    this._size--;
    if (originalColor === BLACK) this._deleteFixup(x);
    if (this.root !== this.nil) this.root.parent = this.nil;
    this.nil.color = BLACK;
    return true;
  }

  _deleteFixup(x) {
    while (x !== this.root && x.color === BLACK) {
      if (x === x.parent.left) {
        let sibling = x.parent.right;
        if (sibling.color === RED) {
          sibling.color = BLACK;
          x.parent.color = RED;
          this._rotateLeft(x.parent);
          sibling = x.parent.right;
        }
        if (sibling.left.color === BLACK && sibling.right.color === BLACK) {
          sibling.color = RED;
          x = x.parent;
        } else {
          if (sibling.right.color === BLACK) {
            sibling.left.color = BLACK;
            sibling.color = RED;
            this._rotateRight(sibling);
            sibling = x.parent.right;
          }
          sibling.color = x.parent.color;
          x.parent.color = BLACK;
          sibling.right.color = BLACK;
          this._rotateLeft(x.parent);
          x = this.root;
        }
      } else {
        let sibling = x.parent.left;
        if (sibling.color === RED) {
          sibling.color = BLACK;
          x.parent.color = RED;
          this._rotateRight(x.parent);
          sibling = x.parent.left;
        }
        if (sibling.right.color === BLACK && sibling.left.color === BLACK) {
          sibling.color = RED;
          x = x.parent;
        } else {
          if (sibling.left.color === BLACK) {
            sibling.right.color = BLACK;
            sibling.color = RED;
            this._rotateLeft(sibling);
            sibling = x.parent.left;
          }
          sibling.color = x.parent.color;
          x.parent.color = BLACK;
          sibling.left.color = BLACK;
          this._rotateRight(x.parent);
          x = this.root;
        }
      }
    }
    x.color = BLACK;
  }

  rank(key) {
    let result = 0;
    let node = this.root;
    while (node !== this.nil) {
      if (this.compare(key, node.key) <= 0) node = node.left;
      else {
        result += node.left.size + 1;
        node = node.right;
      }
    }
    return result;
  }

  select(index) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this._size) {
      throw new RangeError('index is outside the tree');
    }
    let node = this.root;
    while (node !== this.nil) {
      const leftSize = node.left.size;
      if (index === leftSize) return node.key;
      if (index < leftSize) node = node.left;
      else {
        index -= leftSize + 1;
        node = node.right;
      }
    }
    throw new Error('corrupt subtree sizes');
  }

  range(low, high) {
    if (this.compare(low, high) > 0) return [];
    const result = [];
    const stack = [];
    let node = this.root;
    while (stack.length || node !== this.nil) {
      while (node !== this.nil) {
        stack.push(node);
        node = node.left;
      }
      node = stack.pop();
      if (this.compare(node.key, low) >= 0 && this.compare(node.key, high) <= 0) result.push(node.key);
      if (this.compare(node.key, high) > 0) break;
      node = node.right;
    }
    return result;
  }

  toArray() { return this.range(this._minimumKey(), this._maximumKey()); }
  _minimumKey() { return this._size ? this._minimum(this.root).key : undefined; }
  _maximumKey() {
    if (!this._size) return undefined;
    let node = this.root;
    while (node.right !== this.nil) node = node.right;
    return node.key;
  }

  validate() {
    if (this.nil.color !== BLACK || this.nil.size !== 0) throw new Error('sentinel invariant failed');
    if (this.root === this.nil) {
      if (this._size !== 0) throw new Error('empty root has non-zero size');
      return true;
    }
    if (this.root.color !== BLACK || this.root.parent !== this.nil) throw new Error('root invariant failed');
    const visit = (node, lower, upper) => {
      if (node === this.nil) return { blackHeight: 1, size: 0 };
      if (lower !== undefined && this.compare(node.key, lower) <= 0) throw new Error('BST lower-bound invariant failed');
      if (upper !== undefined && this.compare(node.key, upper) >= 0) throw new Error('BST upper-bound invariant failed');
      if (node.left !== this.nil && node.left.parent !== node) throw new Error('left parent pointer failed');
      if (node.right !== this.nil && node.right.parent !== node) throw new Error('right parent pointer failed');
      if (node.color === RED && (node.left.color === RED || node.right.color === RED)) throw new Error('red node has red child');
      const left = visit(node.left, lower, node.key);
      const right = visit(node.right, node.key, upper);
      if (left.blackHeight !== right.blackHeight) throw new Error('black-height invariant failed');
      const expectedSize = left.size + right.size + 1;
      if (node.size !== expectedSize) throw new Error(`subtree size invariant failed at ${node.key}`);
      return { blackHeight: left.blackHeight + (node.color === BLACK ? 1 : 0), size: expectedSize };
    };
    const result = visit(this.root, undefined, undefined);
    if (result.size !== this._size) throw new Error('tree size invariant failed');
    return true;
  }
}

// ------------------------------ Tests ------------------------------------
if (require.main === module) {
  const assert = require('node:assert/strict');
  const tree = new OrderStatisticRedBlackTree();
  for (const value of [8, 3, 10, 1, 6, 14, 4, 7, 13, 2, 5, 9, 12, 11]) assert.equal(tree.insert(value), true);
  assert.equal(tree.insert(8), false);
  assert.equal(tree.validate(), true);
  assert.deepEqual(tree.toArray(), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  assert.equal(tree.rank(8), 7);
  assert.equal(tree.rank(8.5), 8);
  assert.equal(tree.select(0), 1);
  assert.equal(tree.select(13), 14);
  assert.deepEqual(tree.range(4, 10), [4, 5, 6, 7, 8, 9, 10]);
  assert.throws(() => tree.select(14), /outside/);
  for (const value of [8, 1, 14, 6, 3, 10, 4, 2, 5, 7, 9, 11, 12, 13]) {
    assert.equal(tree.delete(value), true);
    assert.equal(tree.validate(), true);
  }
  assert.equal(tree.size, 0);
  assert.equal(tree.delete(99), false);

  // Differential stress test: validate every mutation against a sorted Set.
  let seed = 0x51A7;
  const random = (max) => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % max; };
  const stress = new OrderStatisticRedBlackTree();
  const reference = new Set();
  for (let step = 0; step < 2500; step++) {
    const value = random(300);
    if (random(2) === 0) {
      assert.equal(stress.insert(value), !reference.has(value));
      reference.add(value);
    } else {
      assert.equal(stress.delete(value), reference.has(value));
      reference.delete(value);
    }
    const sorted = [...reference].sort((a, b) => a - b);
    assert.equal(stress.validate(), true);
    assert.deepEqual(stress.toArray(), sorted);
    if (sorted.length) {
      const index = random(sorted.length);
      assert.equal(stress.select(index), sorted[index]);
      const probe = random(320);
      assert.equal(stress.rank(probe), sorted.filter((n) => n < probe).length);
    }
  }
  console.log('order-statistic-red-black-tree: all tests passed');
}

module.exports = { OrderStatisticRedBlackTree };
