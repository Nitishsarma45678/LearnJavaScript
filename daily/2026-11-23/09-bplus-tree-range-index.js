// Exercise: Implement a B+ tree with unique numeric keys.
// Internal nodes store separator keys; all records live in linked leaves.
// Support insertion/update, lookup, inclusive range scans and invariant checks.
// Deletion is intentionally outside this exercise.
//
// Run: node 09-bplus-tree-range-index.js
const assert = require("node:assert/strict");

class BPlusNode {
  constructor(leaf) {
    this.leaf = leaf;
    this.keys = [];
    this.values = [];
    this.children = [];
    this.next = null;
  }
}

class BPlusTree {
  constructor(order = 4) {
    if (!Number.isInteger(order) || order < 3) throw new RangeError("order must be >= 3");
    this.order = order;
    this.maxKeys = order - 1;
    this.root = new BPlusNode(true);
    this.size = 0;
  }

  minKey(node) {
    let current = node;
    while (!current.leaf) current = current.children[0];
    return current.keys[0];
  }

  lowerBound(keys, key) {
    let low = 0;
    let high = keys.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (keys[middle] < key) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  upperBound(keys, key) {
    let low = 0;
    let high = keys.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (keys[middle] <= key) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  findLeaf(key) {
    let node = this.root;
    while (!node.leaf) node = node.children[this.upperBound(node.keys, key)];
    return node;
  }

  get(key) {
    const leaf = this.findLeaf(key);
    const index = this.lowerBound(leaf.keys, key);
    return index < leaf.keys.length && leaf.keys[index] === key
      ? leaf.values[index] : undefined;
  }

  set(key, value) {
    if (typeof key !== "number" || !Number.isFinite(key)) {
      throw new TypeError("key must be a finite number");
    }
    const result = this.insertRecursive(this.root, key, value);
    if (result.split) {
      const root = new BPlusNode(false);
      root.children = [this.root, result.split];
      this.refreshSeparators(root);
      this.root = root;
    }
    if (result.added) this.size += 1;
    return this;
  }

  insertRecursive(node, key, value) {
    if (node.leaf) {
      const index = this.lowerBound(node.keys, key);
      if (node.keys[index] === key) {
        node.values[index] = value;
        return { added: false, split: null };
      }
      node.keys.splice(index, 0, key);
      node.values.splice(index, 0, value);
      if (node.keys.length <= this.maxKeys) return { added: true, split: null };

      const right = new BPlusNode(true);
      const splitAt = Math.ceil(node.keys.length / 2);
      right.keys = node.keys.splice(splitAt);
      right.values = node.values.splice(splitAt);
      right.next = node.next;
      node.next = right;
      return { added: true, split: right };
    }

    const childIndex = this.upperBound(node.keys, key);
    const result = this.insertRecursive(node.children[childIndex], key, value);
    if (result.split) node.children.splice(childIndex + 1, 0, result.split);
    this.refreshSeparators(node);

    if (node.children.length <= this.order) return { added: result.added, split: null };
    const right = new BPlusNode(false);
    const splitAt = Math.ceil(node.children.length / 2);
    right.children = node.children.splice(splitAt);
    this.refreshSeparators(node);
    this.refreshSeparators(right);
    return { added: result.added, split: right };
  }

  refreshSeparators(node) {
    node.keys = node.children.slice(1).map((child) => this.minKey(child));
  }

  range(min = -Infinity, max = Infinity) {
    if (min > max) return [];
    let leaf = this.findLeaf(min);
    let index = this.lowerBound(leaf.keys, min);
    const output = [];
    while (leaf) {
      for (; index < leaf.keys.length; index += 1) {
        if (leaf.keys[index] > max) return output;
        output.push([leaf.keys[index], leaf.values[index]]);
      }
      leaf = leaf.next;
      index = 0;
    }
    return output;
  }

  validate() {
    const leafDepths = new Set();
    const leaves = [];
    const visit = (node, depth, isRoot) => {
      if (node.leaf) {
        leafDepths.add(depth);
        leaves.push(node);
        if (node.keys.length !== node.values.length) throw new Error("leaf key/value mismatch");
        if (node.keys.length > this.maxKeys) throw new Error("leaf overflow");
      } else {
        if (node.children.length !== node.keys.length + 1) throw new Error("separator mismatch");
        if (node.children.length > this.order) throw new Error("internal overflow");
        if (!isRoot && node.children.length < 2) throw new Error("underfull internal node");
        for (let i = 1; i < node.children.length; i += 1) {
          if (node.keys[i - 1] !== this.minKey(node.children[i])) {
            throw new Error("incorrect separator key");
          }
        }
        node.children.forEach((child) => visit(child, depth + 1, false));
      }
      for (let i = 1; i < node.keys.length; i += 1) {
        if (node.keys[i - 1] >= node.keys[i]) throw new Error("keys are not strictly ordered");
      }
    };

    visit(this.root, 0, true);
    if (leafDepths.size > 1) throw new Error("leaves have unequal depths");
    for (let i = 0; i < leaves.length - 1; i += 1) {
      if (leaves[i].next !== leaves[i + 1]) throw new Error("broken leaf chain");
    }
    if (leaves.length && leaves[leaves.length - 1].next !== null) {
      throw new Error("leaf chain has an unexpected tail");
    }
    const count = leaves.reduce((sum, leaf) => sum + leaf.keys.length, 0);
    if (count !== this.size) throw new Error("size counter mismatch");
    return true;
  }
}

// Example tests
{
  const tree = new BPlusTree(4);
  const entries = Array.from({ length: 80 }, (_, i) => [i * 3, "v" + i]);
  for (const [key, value] of entries.slice().reverse()) tree.set(key, value);
  assert.equal(tree.size, 80);
  assert.equal(tree.get(30), "v10");
  assert.equal(tree.get(31), undefined);
  assert.deepEqual(tree.range(15, 24), [[15, "v5"], [18, "v6"], [21, "v7"], [24, "v8"]]);
  tree.set(30, "updated");
  assert.equal(tree.size, 80);
  assert.equal(tree.get(30), "updated");
  assert.equal(tree.validate(), true);
  assert.deepEqual(tree.range(10, 5), []);
  assert.throws(() => tree.set(NaN, 1), /finite/);
}
console.log("B+ tree tests passed");
