'use strict';

// Exercise: implement a Fibonacci min-heap with insert, extractMin,
// decreaseKey, delete, and cascading cuts. Handles returned by insert stay valid.

const assert = require('node:assert/strict');

class FibonacciNode {
  constructor(key, value) {
    this.key = key;
    this.value = value;
    this.degree = 0;
    this.mark = false;
    this.parent = null;
    this.child = null;
    this.left = this;
    this.right = this;
  }
}

class FibonacciHeap {
  constructor(compare = (a, b) => a - b) {
    if (typeof compare !== 'function') throw new TypeError('compare must be a function');
    this.compare = compare;
    this.min = null;
    this.size = 0;
  }

  _iterate(start) {
    if (!start) return [];
    const result = [];
    let node = start;
    do {
      result.push(node);
      node = node.right;
    } while (node !== start);
    return result;
  }

  _insertBefore(anchor, node) {
    node.left = anchor.left;
    node.right = anchor;
    anchor.left.right = node;
    anchor.left = node;
  }

  _detach(node) {
    node.left.right = node.right;
    node.right.left = node.left;
    node.left = node;
    node.right = node;
  }

  _addRoot(node) {
    node.parent = null;
    node.mark = false;
    if (!this.min) {
      node.left = node.right = node;
      this.min = node;
    } else {
      this._insertBefore(this.min, node);
      if (this.compare(node.key, this.min.key) < 0) this.min = node;
    }
  }

  _addChild(parent, node) {
    node.parent = parent;
    node.mark = false;
    if (!parent.child) {
      node.left = node.right = node;
      parent.child = node;
    } else {
      this._insertBefore(parent.child, node);
    }
    parent.degree += 1;
  }

  insert(key, value = key) {
    if (typeof key !== 'number' || Number.isNaN(key)) throw new TypeError('key must be a number');
    const node = new FibonacciNode(key, value);
    this._addRoot(node);
    this.size += 1;
    return node;
  }

  findMin() {
    return this.min ? { key: this.min.key, value: this.min.value } : null;
  }

  _cut(node, parent) {
    if (parent.child === node) parent.child = node.right === node ? null : node.right;
    this._detach(node);
    parent.degree -= 1;
    this._addRoot(node);
  }

  _cascadingCut(node) {
    const parent = node.parent;
    if (!parent) return;
    if (!node.mark) node.mark = true;
    else {
      this._cut(node, parent);
      this._cascadingCut(parent);
    }
  }

  decreaseKey(node, newKey) {
    if (!(node instanceof FibonacciNode)) throw new TypeError('a heap node handle is required');
    if (typeof newKey !== 'number' || Number.isNaN(newKey)) throw new TypeError('key must be a number');
    if (this.compare(newKey, node.key) > 0) throw new RangeError('new key is greater than current key');
    node.key = newKey;
    const parent = node.parent;
    if (parent && this.compare(node.key, parent.key) < 0) {
      this._cut(node, parent);
      this._cascadingCut(parent);
    }
    if (!this.min || this.compare(node.key, this.min.key) < 0) this.min = node;
  }

  _consolidate() {
    const roots = this._iterate(this.min);
    const byDegree = [];
    for (const original of roots) {
      if (original.parent) continue;
      let x = original;
      let degree = x.degree;
      while (byDegree[degree]) {
        let y = byDegree[degree];
        if (this.compare(y.key, x.key) < 0) [x, y] = [y, x];
        byDegree[degree] = null;
        this._addChild(x, y);
        degree += 1;
      }
      byDegree[degree] = x;
    }

    this.min = null;
    for (const node of byDegree) {
      if (!node) continue;
      node.left = node.right = node;
      this._addRoot(node);
    }
  }

  extractMin() {
    const z = this.min;
    if (!z) return null;
    const children = this._iterate(z.child);
    for (const child of children) {
      this._detach(child);
      this._addRoot(child);
    }
    z.child = null;
    z.degree = 0;

    if (z.right === z) this.min = null;
    else {
      const next = z.right;
      this._detach(z);
      this.min = next;
    }
    this.size -= 1;
    if (this.min) this._consolidate();
    z.parent = null;
    z.left = z.right = z;
    return { key: z.key, value: z.value };
  }

  delete(node) {
    if (!(node instanceof FibonacciNode)) throw new TypeError('a heap node handle is required');
    if (node.parent) {
      const parent = node.parent;
      this._cut(node, parent);
      this._cascadingCut(parent);
    }
    this.min = node;
    return this.extractMin();
  }
}

const heap = new FibonacciHeap();
heap.insert(7, 'seven');
heap.insert(3, 'three');
const handle = heap.insert(17, 'seventeen');
heap.insert(24, 'twenty-four');
heap.decreaseKey(handle, 2);
assert.deepEqual(heap.extractMin(), { key: 2, value: 'seventeen' });
assert.deepEqual(heap.extractMin(), { key: 3, value: 'three' });
assert.deepEqual(heap.delete(heap.insert(1, 'remove-me')), { key: 1, value: 'remove-me' });
assert.deepEqual(heap.extractMin(), { key: 7, value: 'seven' });
assert.deepEqual(heap.extractMin(), { key: 24, value: 'twenty-four' });
assert.equal(heap.extractMin(), null);
assert.throws(() => heap.decreaseKey(handle, 99), RangeError);

module.exports = { FibonacciHeap, FibonacciNode };
