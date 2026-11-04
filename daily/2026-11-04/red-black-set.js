'use strict';

const assert = require('node:assert/strict');

const RED = 'red';
const BLACK = 'black';

/**
 * Red-black ordered set. Insert, delete and lookup are O(log n) worst-case.
 * A comparator returning zero makes two keys equivalent.
 */
class RedBlackSet {
  constructor(compare = (a, b) => a < b ? -1 : a > b ? 1 : 0) {
    if (typeof compare !== 'function') throw new TypeError('compare must be a function');
    this.compare = compare;
    this.nil = { color: BLACK, left: null, right: null, parent: null };
    this.nil.left = this.nil.right = this.nil.parent = this.nil;
    this.root = this.nil;
    this.size = 0;
  }

  _findNode(key) {
    let node = this.root;
    while (node !== this.nil) {
      const order = this.compare(key, node.key);
      if (order === 0) return node;
      node = order < 0 ? node.left : node.right;
    }
    return this.nil;
  }

  has(key) {
    return this._findNode(key) !== this.nil;
  }

  _leftRotate(x) {
    const y = x.right;
    x.right = y.left;
    if (y.left !== this.nil) y.left.parent = x;
    y.parent = x.parent;
    if (x.parent === this.nil) this.root = y;
    else if (x === x.parent.left) x.parent.left = y;
    else x.parent.right = y;
    y.left = x;
    x.parent = y;
  }

  _rightRotate(y) {
    const x = y.left;
    y.left = x.right;
    if (x.right !== this.nil) x.right.parent = y;
    x.parent = y.parent;
    if (y.parent === this.nil) this.root = x;
    else if (y === y.parent.right) y.parent.right = x;
    else y.parent.left = x;
    x.right = y;
    y.parent = x;
  }

  add(key) {
    let parent = this.nil;
    let current = this.root;
    while (current !== this.nil) {
      parent = current;
      const order = this.compare(key, current.key);
      if (order === 0) return false;
      current = order < 0 ? current.left : current.right;
    }

    const node = { key, color: RED, left: this.nil, right: this.nil, parent };
    if (parent === this.nil) this.root = node;
    else if (this.compare(key, parent.key) < 0) parent.left = node;
    else parent.right = node;

    this._insertFixup(node);
    this.size++;
    return true;
  }

  _insertFixup(node) {
    while (node.parent.color === RED) {
      if (node.parent === node.parent.parent.left) {
        const uncle = node.parent.parent.right;
        if (uncle.color === RED) {
          node.parent.color = BLACK;
          uncle.color = BLACK;
          node.parent.parent.color = RED;
          node = node.parent.parent;
        } else {
          if (node === node.parent.right) {
            node = node.parent;
            this._leftRotate(node);
          }
          node.parent.color = BLACK;
          node.parent.parent.color = RED;
          this._rightRotate(node.parent.parent);
        }
      } else {
        const uncle = node.parent.parent.left;
        if (uncle.color === RED) {
          node.parent.color = BLACK;
          uncle.color = BLACK;
          node.parent.parent.color = RED;
          node = node.parent.parent;
        } else {
          if (node === node.parent.left) {
            node = node.parent;
            this._rightRotate(node);
          }
          node.parent.color = BLACK;
          node.parent.parent.color = RED;
          this._leftRotate(node.parent.parent);
        }
      }
    }
    this.root.color = BLACK;
    this.root.parent = this.nil;
  }

  _minimum(node) {
    while (node.left !== this.nil) node = node.left;
    return node;
  }

  _transplant(oldNode, newNode) {
    if (oldNode.parent === this.nil) this.root = newNode;
    else if (oldNode === oldNode.parent.left) oldNode.parent.left = newNode;
    else oldNode.parent.right = newNode;
    newNode.parent = oldNode.parent;
  }

  delete(key) {
    const target = this._findNode(key);
    if (target === this.nil) return false;

    let moved = target;
    let removedColor = moved.color;
    let fixNode;

    if (target.left === this.nil) {
      fixNode = target.right;
      this._transplant(target, target.right);
    } else if (target.right === this.nil) {
      fixNode = target.left;
      this._transplant(target, target.left);
    } else {
      moved = this._minimum(target.right);
      removedColor = moved.color;
      fixNode = moved.right;
      if (moved.parent === target) {
        fixNode.parent = moved;
      } else {
        this._transplant(moved, moved.right);
        moved.right = target.right;
        moved.right.parent = moved;
      }
      this._transplant(target, moved);
      moved.left = target.left;
      moved.left.parent = moved;
      moved.color = target.color;
    }

    if (removedColor === BLACK) this._deleteFixup(fixNode);
    this.size--;
    if (this.root !== this.nil) this.root.parent = this.nil;
    this.nil.parent = this.nil;
    return true;
  }

  _deleteFixup(node) {
    while (node !== this.root && node.color === BLACK) {
      if (node === node.parent.left) {
        let sibling = node.parent.right;
        if (sibling === this.nil) {
          node = node.parent;
          continue;
        }
        if (sibling.color === RED) {
          sibling.color = BLACK;
          node.parent.color = RED;
          this._leftRotate(node.parent);
          sibling = node.parent.right;
        }
        if (sibling.left.color === BLACK && sibling.right.color === BLACK) {
          sibling.color = RED;
          node = node.parent;
        } else {
          if (sibling.right.color === BLACK) {
            sibling.left.color = BLACK;
            sibling.color = RED;
            this._rightRotate(sibling);
            sibling = node.parent.right;
          }
          sibling.color = node.parent.color;
          node.parent.color = BLACK;
          sibling.right.color = BLACK;
          this._leftRotate(node.parent);
          node = this.root;
        }
      } else {
        let sibling = node.parent.left;
        if (sibling === this.nil) {
          node = node.parent;
          continue;
        }
        if (sibling.color === RED) {
          sibling.color = BLACK;
          node.parent.color = RED;
          this._rightRotate(node.parent);
          sibling = node.parent.left;
        }
        if (sibling.right.color === BLACK && sibling.left.color === BLACK) {
          sibling.color = RED;
          node = node.parent;
        } else {
          if (sibling.left.color === BLACK) {
            sibling.right.color = BLACK;
            sibling.color = RED;
            this._leftRotate(sibling);
            sibling = node.parent.left;
          }
          sibling.color = node.parent.color;
          node.parent.color = BLACK;
          sibling.left.color = BLACK;
          this._rightRotate(node.parent);
          node = this.root;
        }
      }
    }
    node.color = BLACK;
  }

  min() {
    return this.root === this.nil ? undefined : this._minimum(this.root).key;
  }

  max() {
    if (this.root === this.nil) return undefined;
    let node = this.root;
    while (node.right !== this.nil) node = node.right;
    return node.key;
  }

  toArray() {
    const result = [], stack = [];
    let node = this.root;
    while (node !== this.nil || stack.length) {
      while (node !== this.nil) {
        stack.push(node);
        node = node.left;
      }
      node = stack.pop();
      result.push(node.key);
      node = node.right;
    }
    return result;
  }

  validate() {
    if (this.nil.color !== BLACK || this.nil.left !== this.nil || this.nil.right !== this.nil) {
      throw new Error('sentinel invariant violated');
    }
    if (this.root !== this.nil && (this.root.color !== BLACK || this.root.parent !== this.nil)) {
      throw new Error('root invariant violated');
    }

    const walk = (node, hasLow, low, hasHigh, high) => {
      if (node === this.nil) return { blackHeight: 1, count: 0 };
      if (hasLow && this.compare(node.key, low) <= 0) throw new Error('BST lower bound violated');
      if (hasHigh && this.compare(node.key, high) >= 0) throw new Error('BST upper bound violated');
      if (node.left !== this.nil && node.left.parent !== node) throw new Error('left parent link violated');
      if (node.right !== this.nil && node.right.parent !== node) throw new Error('right parent link violated');
      if (node.color === RED && (node.left.color === RED || node.right.color === RED)) {
        throw new Error('red node has a red child');
      }
      const left = walk(node.left, hasLow, low, true, node.key);
      const right = walk(node.right, true, node.key, hasHigh, high);
      if (left.blackHeight !== right.blackHeight) throw new Error('black heights differ');
      return {
        blackHeight: left.blackHeight + (node.color === BLACK ? 1 : 0),
        count: left.count + right.count + 1
      };
    };

    const stats = walk(this.root, false, undefined, false, undefined);
    if (stats.count !== this.size) throw new Error('stored size is incorrect');
    return true;
  }
}

const tree = new RedBlackSet();
for (const value of [41, 38, 31, 12, 19, 8, 50, 60, 55, 2, 1, 70]) {
  assert.equal(tree.add(value), true);
  assert.equal(tree.validate(), true);
}
assert.equal(tree.add(19), false);
assert.equal(tree.has(55), true);
assert.equal(tree.min(), 1);
assert.equal(tree.max(), 70);
assert.deepEqual(tree.toArray(), [1, 2, 8, 12, 19, 31, 38, 41, 50, 55, 60, 70]);

for (const value of [8, 12, 19, 31, 38, 41, 1, 2, 50, 55, 60, 70]) {
  assert.equal(tree.delete(value), true);
  assert.equal(tree.validate(), true);
}
assert.equal(tree.delete(999), false);
assert.deepEqual(tree.toArray(), []);

const randomTree = new RedBlackSet();
const reference = new Set();
let seed = 0x12345678;
const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
for (let i = 0; i < 500; i++) {
  const value = random() % 120;
  if (random() & 1) {
    assert.equal(randomTree.add(value), !reference.has(value));
    reference.add(value);
  } else {
    assert.equal(randomTree.delete(value), reference.has(value));
    reference.delete(value);
  }
  assert.equal(randomTree.validate(), true);
  assert.deepEqual(randomTree.toArray(), [...reference].sort((a, b) => a - b));
}

console.log('Red-black set tests passed');