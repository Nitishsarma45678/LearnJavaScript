const assert = require('node:assert/strict');

class Node {
  constructor(key) {
    this.key = key;
    this.count = 1;
    this.height = 1;
    this.size = 1;
    this.left = null;
    this.right = null;
  }
}

const height = n => n ? n.height : 0;
const size = n => n ? n.size : 0;

function refresh(n) {
  n.height = 1 + Math.max(height(n.left), height(n.right));
  n.size = n.count + size(n.left) + size(n.right);
  return n;
}

function rotateRight(root) {
  const pivot = root.left;
  root.left = pivot.right;
  pivot.right = refresh(root);
  return refresh(pivot);
}

function rotateLeft(root) {
  const pivot = root.right;
  root.right = pivot.left;
  pivot.left = refresh(root);
  return refresh(pivot);
}

function balance(n) {
  if (!n) return n;
  refresh(n);
  const factor = height(n.left) - height(n.right);
  if (factor > 1) {
    if (height(n.left.left) < height(n.left.right)) n.left = rotateLeft(n.left);
    return rotateRight(n);
  }
  if (factor < -1) {
    if (height(n.right.right) < height(n.right.left)) n.right = rotateRight(n.right);
    return rotateLeft(n);
  }
  return n;
}

class AVLMultiset {
  constructor(compare = (a, b) => a < b ? -1 : a > b ? 1 : 0) {
    this.root = null;
    this.compare = compare;
  }

  insert(key) {
    const add = node => {
      if (!node) return new Node(key);
      const c = this.compare(key, node.key);
      if (c < 0) node.left = add(node.left);
      else if (c > 0) node.right = add(node.right);
      else node.count++;
      return balance(node);
    };
    this.root = add(this.root);
    return this;
  }

  delete(key) {
    const removeMin = node => {
      if (!node.left) return node.right;
      node.left = removeMin(node.left);
      return balance(node);
    };
    const remove = node => {
      if (!node) return null;
      const c = this.compare(key, node.key);
      if (c < 0) node.left = remove(node.left);
      else if (c > 0) node.right = remove(node.right);
      else if (node.count > 1) node.count--;
      else if (!node.left) return node.right;
      else if (!node.right) return node.left;
      else {
        let successor = node.right;
        while (successor.left) successor = successor.left;
        node.key = successor.key;
        node.count = successor.count;
        node.right = removeMin(node.right);
      }
      return balance(node);
    };
    this.root = remove(this.root);
    return this;
  }

  get size() { return size(this.root); }

  has(key) {
    let node = this.root;
    while (node) {
      const c = this.compare(key, node.key);
      if (c === 0) return true;
      node = c < 0 ? node.left : node.right;
    }
    return false;
  }

  // Number of stored values strictly smaller than key.
  rank(key) {
    let node = this.root, result = 0;
    while (node) {
      const c = this.compare(key, node.key);
      if (c <= 0) node = node.left;
      else {
        result += size(node.left) + node.count;
        node = node.right;
      }
    }
    return result;
  }

  // Zero-based order statistic; duplicates occupy separate positions.
  select(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.size) return undefined;
    let node = this.root;
    while (node) {
      const leftSize = size(node.left);
      if (index < leftSize) node = node.left;
      else if (index < leftSize + node.count) return node.key;
      else {
        index -= leftSize + node.count;
        node = node.right;
      }
    }
    return undefined;
  }

  toArray() {
    const out = [];
    const visit = node => {
      if (!node) return;
      visit(node.left);
      for (let i = 0; i < node.count; i++) out.push(node.key);
      visit(node.right);
    };
    visit(this.root);
    return out;
  }

  range(low, high) {
    const out = [];
    const visit = node => {
      if (!node) return;
      if (this.compare(node.key, low) >= 0) visit(node.left);
      if (this.compare(node.key, low) >= 0 && this.compare(node.key, high) <= 0)
        for (let i = 0; i < node.count; i++) out.push(node.key);
      if (this.compare(node.key, high) <= 0) visit(node.right);
    };
    visit(this.root);
    return out;
  }
}

const tree = new AVLMultiset();
[20, 4, 26, 3, 9, 15, 30, 2, 7, 11, 18, 9].forEach(v => tree.insert(v));
assert.deepEqual(tree.toArray(), [2,3,4,7,9,9,11,15,18,20,26,30]);
assert.equal(tree.size, 12);
assert.equal(tree.rank(15), 7);
assert.equal(tree.select(5), 9);
assert.deepEqual(tree.range(7, 18), [7,9,9,11,15,18]);
tree.delete(9).delete(20).delete(2);
assert.deepEqual(tree.toArray(), [3,4,7,9,11,15,18,26,30]);
assert.equal(tree.has(20), false);
assert.equal(tree.select(99), undefined);
console.log('AVL multiset tests passed');