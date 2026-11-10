'use strict';

/**
 * Exercise: implement a Link-Cut Tree for a dynamic forest.
 *
 * The data structure supports link/cut, connectivity, path-sum queries and
 * path-add updates in amortized O(log n) time using splay trees and lazy tags.
 *
 * Run: node link-cut-tree.js
 */

const assert = require('node:assert/strict');

class LinkCutTree {
  constructor(values) {
    if (!Array.isArray(values) || values.some(value => !Number.isFinite(value))) {
      throw new TypeError('values must be an array of finite numbers');
    }
    this.nodes = values.map((value, id) => ({
      id, value, sum: value, size: 1,
      left: null, right: null, parent: null,
      reverse: false, add: 0
    }));
  }

  _node(vertex) {
    if (!Number.isInteger(vertex) || vertex < 0 || vertex >= this.nodes.length) {
      throw new RangeError('invalid vertex: ' + vertex);
    }
    return this.nodes[vertex];
  }

  _isAuxRoot(node) {
    const parent = node.parent;
    return !parent || (parent.left !== node && parent.right !== node);
  }

  _applyReverse(node) {
    if (!node) return;
    [node.left, node.right] = [node.right, node.left];
    node.reverse = !node.reverse;
  }

  _applyAdd(node, delta) {
    if (!node) return;
    node.value += delta;
    node.sum += delta * node.size;
    node.add += delta;
  }

  _push(node) {
    if (node.reverse) {
      this._applyReverse(node.left);
      this._applyReverse(node.right);
      node.reverse = false;
    }
    if (node.add !== 0) {
      this._applyAdd(node.left, node.add);
      this._applyAdd(node.right, node.add);
      node.add = 0;
    }
  }

  _pull(node) {
    node.size = 1;
    node.sum = node.value;
    if (node.left) {
      node.size += node.left.size;
      node.sum += node.left.sum;
    }
    if (node.right) {
      node.size += node.right.size;
      node.sum += node.right.sum;
    }
  }

  _rotate(node) {
    const parent = node.parent;
    const grand = parent.parent;
    if (!this._isAuxRoot(parent)) {
      if (grand.left === parent) grand.left = node;
      else grand.right = node;
    }
    node.parent = grand;

    if (parent.left === node) {
      parent.left = node.right;
      if (node.right) node.right.parent = parent;
      node.right = parent;
    } else {
      parent.right = node.left;
      if (node.left) node.left.parent = parent;
      node.left = parent;
    }
    parent.parent = node;
    this._pull(parent);
    this._pull(node);
  }

  _splay(node) {
    const ancestors = [node];
    for (let current = node; !this._isAuxRoot(current);) {
      current = current.parent;
      ancestors.push(current);
    }
    for (let i = ancestors.length - 1; i >= 0; i -= 1) this._push(ancestors[i]);

    while (!this._isAuxRoot(node)) {
      const parent = node.parent;
      const grand = parent.parent;
      if (!this._isAuxRoot(parent)) {
        const zigZig = (parent.left === node) === (grand.left === parent);
        this._rotate(zigZig ? parent : node);
      }
      this._rotate(node);
    }
  }

  _access(node) {
    let preferred = null;
    for (let current = node; current; current = current.parent) {
      this._splay(current);
      current.right = preferred;
      if (preferred) preferred.parent = current;
      this._pull(current);
      preferred = current;
    }
    this._splay(node);
  }

  _makeRoot(node) {
    this._access(node);
    this._applyReverse(node);
  }

  _findRoot(node) {
    this._access(node);
    this._push(node);
    while (node.left) {
      node = node.left;
      this._push(node);
    }
    this._splay(node);
    return node;
  }

  connected(a, b) {
    const x = this._node(a);
    const y = this._node(b);
    return x === y || this._findRoot(x) === this._findRoot(y);
  }

  link(a, b) {
    const x = this._node(a);
    const y = this._node(b);
    if (x === y) return false;
    this._makeRoot(x);
    if (this._findRoot(y) === x) return false;
    x.parent = y;
    return true;
  }

  cut(a, b) {
    const x = this._node(a);
    const y = this._node(b);
    this._makeRoot(x);
    this._access(y);
    this._push(y);
    this._push(x);

    // After exposing x..y, a direct edge has x as y's left child and
    // no right child under x. A longer path must not be cut accidentally.
    if (y.left !== x || x.right !== null) return false;
    y.left = null;
    x.parent = null;
    this._pull(y);
    return true;
  }

  pathSum(a, b) {
    const x = this._node(a);
    const y = this._node(b);
    this._makeRoot(x);
    if (this._findRoot(y) !== x) throw new Error('vertices are disconnected');
    this._access(y);
    return y.sum;
  }

  pathAdd(a, b, delta) {
    if (!Number.isFinite(delta)) throw new TypeError('delta must be finite');
    const x = this._node(a);
    const y = this._node(b);
    this._makeRoot(x);
    if (this._findRoot(y) !== x) throw new Error('vertices are disconnected');
    this._access(y);
    this._applyAdd(y, delta);
  }

  setValue(vertex, value) {
    if (!Number.isFinite(value)) throw new TypeError('value must be finite');
    const node = this._node(vertex);
    this._access(node);
    node.value = value;
    this._pull(node);
  }

  getValue(vertex) {
    const node = this._node(vertex);
    this._access(node);
    return node.value;
  }
}

function runTests() {
  const forest = new LinkCutTree([1, 2, 3, 4, 5, 6]);
  assert.equal(forest.link(0, 1), true);
  assert.equal(forest.link(1, 2), true);
  assert.equal(forest.link(1, 3), true);
  assert.equal(forest.link(3, 4), true);
  assert.equal(forest.connected(0, 4), true);
  assert.equal(forest.connected(0, 5), false);
  assert.equal(forest.pathSum(2, 4), 3 + 2 + 4 + 5);
  assert.equal(forest.cut(1, 4), false);
  forest.pathAdd(2, 4, 10);
  assert.equal(forest.pathSum(2, 4), 13 + 12 + 14 + 15);
  assert.equal(forest.getValue(0), 1);
  assert.equal(forest.getValue(3), 14);
  assert.equal(forest.cut(1, 3), true);
  assert.equal(forest.connected(0, 4), false);
  assert.throws(() => forest.pathSum(0, 4), /disconnected/);
  assert.equal(forest.link(4, 5), true);
  assert.equal(forest.link(4, 1), true);
  assert.equal(forest.pathSum(5, 2), 6 + 15 + 12 + 13);
  assert.equal(forest.link(0, 2), false, 'link must reject a cycle');
  assert.throws(() => forest.setValue(99, 1), /invalid vertex/);
  assert.throws(() => forest.pathAdd(0, 1, Infinity), /finite/);
  console.log('Link-Cut Tree tests passed');
}

if (require.main === module) runTests();

module.exports = { LinkCutTree };
