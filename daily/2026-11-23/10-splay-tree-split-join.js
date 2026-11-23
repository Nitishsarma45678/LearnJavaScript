// Exercise: Implement a splay tree map with amortized O(log n) operations.
// Support set, get, delete, split(key) into keys < key and keys >= key, and
// join(other) when every key in this tree is less than every key in other.
//
// Run: node 10-splay-tree-split-join.js
const assert = require("node:assert/strict");

class SplayNode {
  constructor(key, value) {
    this.key = key;
    this.value = value;
    this.left = null;
    this.right = null;
    this.parent = null;
  }
}

class SplayTree {
  constructor(root = null) {
    this.root = root;
    this.size = root ? this.count(root) : 0;
  }

  count(node) {
    return node ? 1 + this.count(node.left) + this.count(node.right) : 0;
  }

  rotate(node) {
    const parent = node.parent;
    const grand = parent.parent;
    if (node === parent.left) {
      parent.left = node.right;
      if (node.right) node.right.parent = parent;
      node.right = parent;
    } else {
      parent.right = node.left;
      if (node.left) node.left.parent = parent;
      node.left = parent;
    }
    parent.parent = node;
    node.parent = grand;
    if (!grand) this.root = node;
    else if (grand.left === parent) grand.left = node;
    else grand.right = node;
  }

  splay(node) {
    while (node.parent) {
      const parent = node.parent;
      const grand = parent.parent;
      if (!grand) this.rotate(node);
      else if ((node === parent.left) === (parent === grand.left)) {
        this.rotate(parent);
        this.rotate(node);
      } else {
        this.rotate(node);
        this.rotate(node);
      }
    }
    this.root = node;
  }

  set(key, value) {
    if (!this.root) {
      this.root = new SplayNode(key, value);
      this.size = 1;
      return this;
    }
    let current = this.root;
    while (true) {
      if (key === current.key) {
        current.value = value;
        this.splay(current);
        return this;
      }
      const side = key < current.key ? "left" : "right";
      if (!current[side]) {
        current[side] = new SplayNode(key, value);
        current[side].parent = current;
        this.size += 1;
        this.splay(current[side]);
        return this;
      }
      current = current[side];
    }
  }

  getNode(key) {
    let current = this.root;
    let last = null;
    while (current) {
      last = current;
      if (key === current.key) {
        this.splay(current);
        return current;
      }
      current = key < current.key ? current.left : current.right;
    }
    if (last) this.splay(last);
    return null;
  }

  get(key) {
    return this.getNode(key)?.value;
  }

  delete(key) {
    const node = this.getNode(key);
    if (!node || node.key !== key) return false;
    const left = node.left;
    const right = node.right;
    if (left) left.parent = null;
    if (right) right.parent = null;
    node.left = node.right = null;
    this.size -= 1;

    if (!left) {
      this.root = right;
    } else {
      this.root = left;
      let maximum = left;
      while (maximum.right) maximum = maximum.right;
      this.splay(maximum);
      this.root.right = right;
      if (right) right.parent = this.root;
    }
    return true;
  }

  minimum(node = this.root) {
    if (!node) return null;
    while (node.left) node = node.left;
    return node;
  }

  maximum(node = this.root) {
    if (!node) return null;
    while (node.right) node = node.right;
    return node;
  }

  split(key) {
    if (!this.root) return [new SplayTree(), new SplayTree()];
    let current = this.root;
    let candidate = null;
    while (current) {
      if (current.key >= key) {
        candidate = current;
        current = current.left;
      } else {
        current = current.right;
      }
    }

    if (!candidate) {
      this.splay(this.maximum());
      return [this, new SplayTree()];
    }

    this.splay(candidate);
    const rightRoot = this.root;
    const leftRoot = rightRoot.left;
    rightRoot.left = null;
    if (leftRoot) leftRoot.parent = null;
    rightRoot.parent = null;

    const leftTree = new SplayTree(leftRoot);
    const rightTree = new SplayTree(rightRoot);
    this.root = rightTree.root;
    this.size = rightTree.size;
    return [leftTree, this];
  }

  join(other) {
    if (!(other instanceof SplayTree)) throw new TypeError("join expects a SplayTree");
    if (!this.root) {
      this.root = other.root;
      this.size = other.size;
      other.root = null;
      other.size = 0;
      return this;
    }
    if (!other.root) return this;
    if (this.maximum().key >= other.minimum().key) {
      throw new RangeError("all keys in the left tree must be smaller");
    }

    this.splay(this.maximum());
    this.root.right = other.root;
    other.root.parent = this.root;
    this.size += other.size;
    other.root = null;
    other.size = 0;
    return this;
  }

  entries() {
    const output = [];
    const visit = (node) => {
      if (!node) return;
      visit(node.left);
      output.push([node.key, node.value]);
      visit(node.right);
    };
    visit(this.root);
    return output;
  }

  validate() {
    let count = 0;
    const visit = (node, low, high, parent) => {
      if (!node) return;
      if (node.parent !== parent) throw new Error("broken parent pointer");
      if (low !== undefined && node.key <= low) throw new Error("BST lower bound violated");
      if (high !== undefined && node.key >= high) throw new Error("BST upper bound violated");
      count += 1;
      visit(node.left, low, node.key, node);
      visit(node.right, node.key, high, node);
    };
    visit(this.root, undefined, undefined, null);
    if (count !== this.size) throw new Error("size mismatch");
    return true;
  }
}

// Example tests
{
  const tree = new SplayTree();
  [8, 3, 10, 1, 6, 14, 4, 7, 13].forEach((key) => tree.set(key, key * 10));
  assert.equal(tree.get(6), 60);
  assert.equal(tree.root.key, 6);
  assert.equal(tree.delete(8), true);
  assert.equal(tree.delete(8), false);
  assert.equal(tree.validate(), true);

  const [left, right] = tree.split(7);
  assert.deepEqual(left.entries().map(([key]) => key), [1, 3, 4, 6]);
  assert.deepEqual(right.entries().map(([key]) => key), [7, 10, 13, 14]);
  assert.equal(left.size + right.size, 8);
  left.join(right);
  assert.deepEqual(left.entries().map(([key]) => key), [1, 3, 4, 6, 7, 10, 13, 14]);
  assert.equal(left.validate(), true);
  assert.equal(right.size, 0);
}
console.log("splay tree tests passed");
