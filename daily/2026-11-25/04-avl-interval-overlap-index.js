'use strict';

// Exercise: maintain half-open intervals in an AVL tree augmented with maxEnd.
// Query all intervals intersecting [start, end) without scanning the full index.

class Node {
  constructor(interval) {
    Object.assign(this, interval);
    this.left = null;
    this.right = null;
    this.height = 1;
    this.maxEnd = interval.end;
  }
}

function height(node) { return node ? node.height : 0; }
function refresh(node) {
  node.height = 1 + Math.max(height(node.left), height(node.right));
  node.maxEnd = Math.max(node.end,
    node.left ? node.left.maxEnd : -Infinity,
    node.right ? node.right.maxEnd : -Infinity);
  return node;
}
function rotateRight(y) {
  const x = y.left, middle = x.right;
  x.right = y; y.left = middle;
  refresh(y); return refresh(x);
}
function rotateLeft(x) {
  const y = x.right, middle = y.left;
  y.left = x; x.right = middle;
  refresh(x); return refresh(y);
}
function compare(a, b) {
  return a.start - b.start || String(a.id).localeCompare(String(b.id));
}
function balance(node) {
  refresh(node);
  const factor = height(node.left) - height(node.right);
  if (factor > 1) {
    if (height(node.left.left) < height(node.left.right)) node.left = rotateLeft(node.left);
    return rotateRight(node);
  }
  if (factor < -1) {
    if (height(node.right.right) < height(node.right.left)) node.right = rotateRight(node.right);
    return rotateLeft(node);
  }
  return node;
}

class IntervalIndex {
  constructor() { this.root = null; this.ids = new Set(); }

  insert(start, end, id) {
    if (!(Number.isFinite(start) && Number.isFinite(end) && start < end)) {
      throw new RangeError('interval must be finite and non-empty');
    }
    if (id === undefined || this.ids.has(id)) throw new Error('interval id must be unique');
    const item = { start, end, id };
    const add = node => {
      if (!node) return new Node(item);
      if (compare(item, node) < 0) node.left = add(node.left);
      else node.right = add(node.right);
      return balance(node);
    };
    this.root = add(this.root);
    this.ids.add(id);
    return this;
  }

  search(start, end) {
    if (!(start < end)) throw new RangeError('query must be non-empty');
    const found = [];
    const visit = node => {
      if (!node || node.maxEnd <= start) return;
      if (node.left && node.left.maxEnd > start) visit(node.left);
      if (node.start < end && node.end > start) found.push({ start: node.start, end: node.end, id: node.id });
      if (node.start < end) visit(node.right);
    };
    visit(this.root);
    return found.sort(compare);
  }
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  const index = new IntervalIndex();
  [[15, 20, 'a'], [10, 30, 'b'], [17, 19, 'c'], [5, 20, 'd'],
    [12, 15, 'e'], [30, 40, 'f'], [1, 4, 'g']].forEach(x => index.insert(...x));

  assert.deepEqual(index.search(14, 16).map(x => x.id), ['d', 'b', 'e', 'a']);
  assert.deepEqual(index.search(20, 30).map(x => x.id), ['b']);
  assert.deepEqual(index.search(40, 50), []);
  assert.throws(() => index.insert(1, 1, 'bad'), RangeError);
  assert.throws(() => index.insert(2, 3, 'a'), /unique/);
  console.log('AVL interval index: all tests passed');
}

module.exports = { IntervalIndex };
