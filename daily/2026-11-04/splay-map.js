'use strict';

const assert = require('node:assert/strict');

class SplayMap {
  constructor(compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)) {
    if (typeof compare !== 'function') throw new TypeError('compare must be a function');
    this.compare = compare;
    this.root = null;
    this._size = 0;
  }

  get size() {
    return this._size;
  }

  _rotateLeft(node) {
    const pivot = node.right;
    if (!pivot) return;
    node.right = pivot.left;
    if (pivot.left) pivot.left.parent = node;
    pivot.parent = node.parent;
    if (!node.parent) this.root = pivot;
    else if (node === node.parent.left) node.parent.left = pivot;
    else node.parent.right = pivot;
    pivot.left = node;
    node.parent = pivot;
  }

  _rotateRight(node) {
    const pivot = node.left;
    if (!pivot) return;
    node.left = pivot.right;
    if (pivot.right) pivot.right.parent = node;
    pivot.parent = node.parent;
    if (!node.parent) this.root = pivot;
    else if (node === node.parent.left) node.parent.left = pivot;
    else node.parent.right = pivot;
    pivot.right = node;
    node.parent = pivot;
  }

  _splay(node) {
    while (node.parent) {
      const parent = node.parent;
      const grand = parent.parent;
      if (!grand) {
        if (node === parent.left) this._rotateRight(parent);
        else this._rotateLeft(parent);
      } else if (node === parent.left && parent === grand.left) {
        this._rotateRight(grand);
        this._rotateRight(parent);
      } else if (node === parent.right && parent === grand.right) {
        this._rotateLeft(grand);
        this._rotateLeft(parent);
      } else if (node === parent.right && parent === grand.left) {
        this._rotateLeft(parent);
        this._rotateRight(grand);
      } else {
        this._rotateRight(parent);
        this._rotateLeft(grand);
      }
    }
    this.root = node;
  }

  _find(key) {
    let node = this.root;
    let last = null;
    while (node) {
      last = node;
      const order = this.compare(key, node.key);
      if (order === 0) {
        this._splay(node);
        return node;
      }
      node = order < 0 ? node.left : node.right;
    }
    if (last) this._splay(last);
    return null;
  }

  set(key, value) {
    if (!this.root) {
      this.root = { key, value, left: null, right: null, parent: null };
      this._size = 1;
      return this;
    }

    let node = this.root;
    while (true) {
      const order = this.compare(key, node.key);
      if (order === 0) {
        node.value = value;
        this._splay(node);
        return this;
      }
      const side = order < 0 ? 'left' : 'right';
      if (!node[side]) {
        node[side] = { key, value, left: null, right: null, parent: node };
        this._size++;
        this._splay(node[side]);
        return this;
      }
      node = node[side];
    }
  }

  get(key) {
    const node = this._find(key);
    return node ? node.value : undefined;
  }

  has(key) {
    return this._find(key) !== null;
  }

  delete(key) {
    const node = this._find(key);
    if (!node) return false;

    const left = node.left;
    const right = node.right;
    if (left) left.parent = null;
    if (right) right.parent = null;

    if (!left) {
      this.root = right;
    } else {
      this.root = left;
      let maximum = left;
      while (maximum.right) maximum = maximum.right;
      this._splay(maximum);
      this.root.right = right;
      if (right) right.parent = this.root;
    }
    this._size--;
    return true;
  }

  entries() {
    const result = [];
    const stack = [];
    let node = this.root;
    while (node || stack.length) {
      while (node) {
        stack.push(node);
        node = node.left;
      }
      node = stack.pop();
      result.push([node.key, node.value]);
      node = node.right;
    }
    return result;
  }
}

if (require.main === module) {
  const map = new SplayMap();
  [8, 3, 10, 1, 6, 14, 4, 7, 13].forEach(key => map.set(key, key * 10));
  assert.equal(map.size, 9);
  assert.equal(map.get(6), 60);
  assert.equal(map.root.key, 6, 'successful lookup splays the key to the root');
  assert.equal(map.has(99), false);
  assert.deepEqual(map.entries().map(([key]) => key), [1, 3, 4, 6, 7, 8, 10, 13, 14]);
  assert.equal(map.delete(8), true);
  assert.equal(map.delete(8), false);
  assert.equal(map.size, 8);
  assert.deepEqual(map.entries().map(([key]) => key), [1, 3, 4, 6, 7, 10, 13, 14]);
  map.set(6, 999);
  assert.equal(map.get(6), 999);
  console.log('Splay map tests passed');
}

module.exports = { SplayMap };
