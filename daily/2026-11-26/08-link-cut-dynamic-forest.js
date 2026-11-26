'use strict';

// Exercise: maintain a forest under link/cut operations and answer dynamic
// path-sum queries with a link-cut tree (splay trees plus lazy path reversal).

const assert = require('node:assert/strict');

class LinkCutForest {
  constructor(values) {
    if (!Array.isArray(values) || values.some((v) => typeof v !== 'number')) {
      throw new TypeError('values must be numeric');
    }
    this.nodes = values.map((value, id) => ({
      id, value, sum: value, left: null, right: null, parent: null, reverse: false
    }));
  }

  _isAuxRoot(x) {
    return !x.parent || (x.parent.left !== x && x.parent.right !== x);
  }

  _pull(x) {
    x.sum = x.value + (x.left?.sum || 0) + (x.right?.sum || 0);
  }

  _push(x) {
    if (!x || !x.reverse) return;
    [x.left, x.right] = [x.right, x.left];
    if (x.left) x.left.reverse = !x.left.reverse;
    if (x.right) x.right.reverse = !x.right.reverse;
    x.reverse = false;
  }

  _rotate(x) {
    const p = x.parent;
    const g = p.parent;
    const pWasRoot = this._isAuxRoot(p);
    this._push(p);
    this._push(x);
    if (p.left === x) {
      p.left = x.right;
      if (x.right) x.right.parent = p;
      x.right = p;
    } else {
      p.right = x.left;
      if (x.left) x.left.parent = p;
      x.left = p;
    }
    p.parent = x;
    x.parent = g;
    if (!pWasRoot) {
      if (g.left === p) g.left = x;
      else g.right = x;
    }
    this._pull(p);
    this._pull(x);
  }

  _splay(x) {
    const ancestors = [x];
    for (let y = x; !this._isAuxRoot(y);) {
      y = y.parent;
      ancestors.push(y);
    }
    for (let i = ancestors.length - 1; i >= 0; i -= 1) this._push(ancestors[i]);

    while (!this._isAuxRoot(x)) {
      const p = x.parent;
      const g = p.parent;
      if (!this._isAuxRoot(p)) {
        const zigzig = (p.left === x) === (g.left === p);
        this._rotate(zigzig ? p : x);
      }
      this._rotate(x);
    }
    this._pull(x);
  }

  _access(x) {
    let last = null;
    for (let y = x; y; y = y.parent) {
      this._splay(y);
      y.right = last;
      if (last) last.parent = y;
      this._pull(y);
      last = y;
    }
    this._splay(x);
  }

  _makeRoot(x) {
    this._access(x);
    x.reverse = !x.reverse;
    this._push(x);
  }

  _findRoot(x) {
    this._access(x);
    let root = x;
    this._push(root);
    while (root.left) {
      root = root.left;
      this._push(root);
    }
    this._splay(root);
    return root;
  }

  _node(id) {
    if (!Number.isInteger(id) || id < 0 || id >= this.nodes.length) {
      throw new RangeError('unknown vertex');
    }
    return this.nodes[id];
  }

  connected(a, b) {
    return this._findRoot(this._node(a)) === this._findRoot(this._node(b));
  }

  link(a, b) {
    const x = this._node(a), y = this._node(b);
    this._makeRoot(x);
    if (this._findRoot(y) === x) return false;
    x.parent = y;
    return true;
  }

  cut(a, b) {
    const x = this._node(a), y = this._node(b);
    this._makeRoot(x);
    this._access(y);
    if (y.left !== x) return false;
    this._push(x);
    if (x.right) return false;
    y.left.parent = null;
    y.left = null;
    this._pull(y);
    return true;
  }

  setValue(id, value) {
    if (typeof value !== 'number') throw new TypeError('value must be numeric');
    const x = this._node(id);
    this._access(x);
    x.value = value;
    this._pull(x);
  }

  pathSum(a, b) {
    const x = this._node(a), y = this._node(b);
    this._makeRoot(x);
    if (this._findRoot(y) !== x) return null;
    this._access(y);
    return y.sum;
  }
}

const forest = new LinkCutForest([1, 2, 3, 4]);
assert.equal(forest.link(0, 1), true);
assert.equal(forest.link(1, 2), true);
assert.equal(forest.connected(0, 2), true);
assert.equal(forest.pathSum(0, 2), 6);
assert.equal(forest.link(0, 2), false);
forest.setValue(1, 10);
assert.equal(forest.pathSum(0, 2), 14);
assert.equal(forest.cut(1, 2), true);
assert.equal(forest.connected(0, 2), false);
assert.equal(forest.pathSum(0, 2), null);
assert.equal(forest.link(2, 3), true);
assert.equal(forest.pathSum(2, 3), 7);

module.exports = { LinkCutForest };
