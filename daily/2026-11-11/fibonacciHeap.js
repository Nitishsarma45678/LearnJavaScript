'use strict';

/**
 * Exercise: Fibonacci Heap with Handles and Meld
 *
 * Implement insert, find-min, extract-min, decrease-key and O(1)-root-list
 * meld using circular doubly linked lists, degree consolidation, cuts and
 * cascading cuts. Handles returned by insert remain valid after meld.
 *
 * Run: node fibonacciHeap.js
 */
const assert = require('node:assert/strict');

function iterateCircle(start) {
  const nodes = [];
  if (!start) return nodes;
  let current = start;
  do {
    nodes.push(current);
    current = current.right;
  } while (current !== start);
  return nodes;
}

function detach(node) {
  node.left.right = node.right;
  node.right.left = node.left;
  node.left = node;
  node.right = node;
}

function insertAfter(anchor, node) {
  node.left = anchor;
  node.right = anchor.right;
  anchor.right.left = node;
  anchor.right = node;
}

class FibonacciHeap {
  constructor(compare = (a, b) => a - b) {
    if (typeof compare !== 'function') throw new TypeError('compare must be a function');
    this.compare = compare;
    this.min = null;
    this.size = 0;
  }

  insert(key, value = key) {
    const node = {
      key, value, degree: 0, mark: false, parent: null, child: null,
      left: null, right: null, removed: false
    };
    node.left = node;
    node.right = node;
    this._addRoot(node);
    this.size += 1;
    return node;
  }

  findMin() {
    return this.min ? { key: this.min.key, value: this.min.value } : null;
  }

  extractMin() {
    const minimum = this.min;
    if (!minimum) return null;

    for (const child of iterateCircle(minimum.child)) {
      detach(child);
      child.parent = null;
      child.mark = false;
      this._addRoot(child);
    }
    minimum.child = null;
    minimum.degree = 0;

    const nextRoot = minimum.right;
    detach(minimum);
    if (nextRoot === minimum) {
      this.min = null;
    } else {
      this.min = nextRoot;
      this._consolidate();
    }

    minimum.removed = true;
    this.size -= 1;
    return { key: minimum.key, value: minimum.value };
  }

  decreaseKey(handle, newKey) {
    this._assertHandle(handle);
    if (this.compare(newKey, handle.key) > 0) {
      throw new RangeError('new key must not be greater than the current key');
    }
    handle.key = newKey;
    const parent = handle.parent;
    if (parent && this.compare(handle.key, parent.key) < 0) {
      this._cut(handle, parent);
      this._cascadingCut(parent);
    }
    if (!this.min || this.compare(handle.key, this.min.key) < 0) this.min = handle;
  }

  meld(other) {
    if (!(other instanceof FibonacciHeap)) throw new TypeError('meld expects another FibonacciHeap');
    if (other === this) throw new TypeError('a heap cannot be melded with itself');
    if (this.compare !== other.compare) {
      throw new TypeError('heaps must use the same comparator function');
    }
    if (!other.min) return this;
    if (!this.min) {
      this.min = other.min;
      this.size = other.size;
    } else {
      const a = this.min;
      const b = other.min;
      const aRight = a.right;
      const bLeft = b.left;
      a.right = b;
      b.left = a;
      bLeft.right = aRight;
      aRight.left = bLeft;
      if (this.compare(b.key, a.key) < 0) this.min = b;
      this.size += other.size;
    }
    other.min = null;
    other.size = 0;
    return this;
  }

  _assertHandle(handle) {
    if (!handle || typeof handle !== 'object' || handle.removed) {
      throw new TypeError('handle is invalid or has already been extracted');
    }
  }

  _addRoot(node) {
    node.parent = null;
    node.mark = false;
    if (!this.min) {
      node.left = node;
      node.right = node;
      this.min = node;
    } else {
      insertAfter(this.min, node);
      if (this.compare(node.key, this.min.key) < 0) this.min = node;
    }
  }

  _link(child, parent) {
    detach(child);
    child.parent = parent;
    child.mark = false;
    if (!parent.child) {
      child.left = child;
      child.right = child;
      parent.child = child;
    } else {
      insertAfter(parent.child, child);
    }
    parent.degree += 1;
  }

  _consolidate() {
    const roots = iterateCircle(this.min);
    const byDegree = new Map();
    for (const root of roots) {
      let x = root;
      let degree = x.degree;
      while (byDegree.has(degree)) {
        let y = byDegree.get(degree);
        if (this.compare(x.key, y.key) > 0) [x, y] = [y, x];
        byDegree.delete(degree);
        this._link(y, x);
        degree += 1;
      }
      byDegree.set(degree, x);
    }

    this.min = null;
    for (const root of byDegree.values()) {
      root.left = root;
      root.right = root;
      this._addRoot(root);
    }
  }

  _cut(node, parent) {
    if (parent.child === node) {
      parent.child = node.right === node ? null : node.right;
    }
    detach(node);
    parent.degree -= 1;
    this._addRoot(node);
  }

  _cascadingCut(node) {
    const parent = node.parent;
    if (!parent) return;
    if (!node.mark) {
      node.mark = true;
    } else {
      this._cut(node, parent);
      this._cascadingCut(parent);
    }
  }
}

function runTests() {
  const heap = new FibonacciHeap();
  const handles = [7, 3, 17, 24, 10, 1].map(value => heap.insert(value, 'v' + value));
  assert.equal(heap.size, 6);
  assert.deepEqual(heap.findMin(), { key: 1, value: 'v1' });
  heap.decreaseKey(handles[2], 0);
  assert.equal(heap.findMin().key, 0);
  const extracted = [];
  while (heap.size) extracted.push(heap.extractMin().key);
  assert.deepEqual(extracted, [0, 1, 3, 7, 10, 24]);
  assert.equal(heap.extractMin(), null);
  assert.throws(() => heap.decreaseKey(handles[0], 2), /invalid/);

  const compare = (a, b) => a - b;
  const left = new FibonacciHeap(compare);
  const right = new FibonacciHeap(compare);
  const transferredHandle = right.insert(12, 'twelve');
  right.insert(4, 'four');
  left.insert(9, 'nine');
  left.meld(right);
  assert.equal(right.size, 0);
  assert.equal(left.size, 3);
  left.decreaseKey(transferredHandle, 2);
  assert.deepEqual([left.extractMin().key, left.extractMin().key, left.extractMin().key], [2, 4, 9]);

  const duplicates = new FibonacciHeap();
  duplicates.insert(5, 'a');
  duplicates.insert(5, 'b');
  duplicates.insert(5, 'c');
  assert.deepEqual([duplicates.extractMin().key, duplicates.extractMin().key, duplicates.extractMin().key], [5, 5, 5]);
  assert.throws(() => left.meld(left), /itself/);
  console.log('fibonacciHeap: all tests passed');
}

if (require.main === module) runTests();
module.exports = { FibonacciHeap };
