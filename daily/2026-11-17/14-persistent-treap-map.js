/**
 * EXERCISE: Persistent Treap Ordered Map
 *
 * Implement an immutable ordered map using a treap: BST order by key and
 * deterministic pseudo-random heap priorities. Each update returns a new map
 * while sharing every untouched subtree with previous versions.
 *
 * Includes rank/select order statistics and inclusive range enumeration.
 */

"use strict";

function defaultCompare(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function priorityFor(key) {
  const text = typeof key + ":" + String(key);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function subtreeSize(node) {
  return node ? node.size : 0;
}

function makeNode(key, value, priority, left = null, right = null) {
  return Object.freeze({
    key,
    value,
    priority,
    left,
    right,
    size: 1 + subtreeSize(left) + subtreeSize(right)
  });
}

function heapBefore(a, b, compare) {
  return a.priority < b.priority ||
    (a.priority === b.priority && compare(a.key, b.key) < 0);
}

function rotateRight(root) {
  const pivot = root.left;
  const moved = makeNode(root.key, root.value, root.priority, pivot.right, root.right);
  return makeNode(pivot.key, pivot.value, pivot.priority, pivot.left, moved);
}

function rotateLeft(root) {
  const pivot = root.right;
  const moved = makeNode(root.key, root.value, root.priority, root.left, pivot.left);
  return makeNode(pivot.key, pivot.value, pivot.priority, moved, pivot.right);
}

function insertNode(root, key, value, compare) {
  if (!root) return makeNode(key, value, priorityFor(key));

  const order = compare(key, root.key);
  if (order === 0) {
    return makeNode(root.key, value, root.priority, root.left, root.right);
  }

  if (order < 0) {
    const next = makeNode(
      root.key, root.value, root.priority,
      insertNode(root.left, key, value, compare), root.right
    );
    return heapBefore(next.left, next, compare) ? rotateRight(next) : next;
  }

  const next = makeNode(
    root.key, root.value, root.priority,
    root.left, insertNode(root.right, key, value, compare)
  );
  return heapBefore(next.right, next, compare) ? rotateLeft(next) : next;
}

function mergeTrees(left, right, compare) {
  if (!left) return right;
  if (!right) return left;

  if (heapBefore(left, right, compare)) {
    return makeNode(
      left.key, left.value, left.priority,
      left.left, mergeTrees(left.right, right, compare)
    );
  }

  return makeNode(
    right.key, right.value, right.priority,
    mergeTrees(left, right.left, compare), right.right
  );
}

function deleteNode(root, key, compare) {
  if (!root) return null;
  const order = compare(key, root.key);

  if (order < 0) {
    return makeNode(
      root.key, root.value, root.priority,
      deleteNode(root.left, key, compare), root.right
    );
  }
  if (order > 0) {
    return makeNode(
      root.key, root.value, root.priority,
      root.left, deleteNode(root.right, key, compare)
    );
  }
  return mergeTrees(root.left, root.right, compare);
}

class PersistentTreapMap {
  constructor(compare = defaultCompare, root = null) {
    if (typeof compare !== "function") throw new TypeError("compare must be a function");
    this.compare = compare;
    this.root = root;
    Object.freeze(this);
  }

  get size() {
    return subtreeSize(this.root);
  }

  has(key) {
    let node = this.root;
    while (node) {
      const order = this.compare(key, node.key);
      if (order === 0) return true;
      node = order < 0 ? node.left : node.right;
    }
    return false;
  }

  get(key) {
    let node = this.root;
    while (node) {
      const order = this.compare(key, node.key);
      if (order === 0) return node.value;
      node = order < 0 ? node.left : node.right;
    }
    return undefined;
  }

  set(key, value) {
    return new PersistentTreapMap(
      this.compare,
      insertNode(this.root, key, value, this.compare)
    );
  }

  delete(key) {
    return new PersistentTreapMap(
      this.compare,
      deleteNode(this.root, key, this.compare)
    );
  }

  // Number of keys strictly smaller than key.
  rank(key) {
    let node = this.root;
    let count = 0;
    while (node) {
      const order = this.compare(key, node.key);
      if (order <= 0) {
        node = node.left;
      } else {
        count += subtreeSize(node.left) + 1;
        node = node.right;
      }
    }
    return count;
  }

  // Zero-based order statistic; returns undefined outside [0, size).
  select(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.size) return undefined;
    let node = this.root;
    let target = index;

    while (node) {
      const leftSize = subtreeSize(node.left);
      if (target < leftSize) node = node.left;
      else if (target === leftSize) return { key: node.key, value: node.value };
      else {
        target -= leftSize + 1;
        node = node.right;
      }
    }
    return undefined;
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

  // Inclusive [from, to] range.
  range(from, to) {
    if (this.compare(from, to) > 0) throw new RangeError("from must be <= to");
    const result = [];
    const visit = (node) => {
      if (!node) return;
      if (this.compare(node.key, from) > 0) visit(node.left);
      if (this.compare(node.key, from) >= 0 && this.compare(node.key, to) <= 0) {
        result.push([node.key, node.value]);
      }
      if (this.compare(node.key, to) < 0) visit(node.right);
    };
    visit(this.root);
    return result;
  }

  validate() {
    const inspect = (node, lower, upper) => {
      if (!node) return 0;
      if (lower !== undefined && this.compare(node.key, lower) <= 0) {
        throw new Error("BST lower-bound invariant violated");
      }
      if (upper !== undefined && this.compare(node.key, upper) >= 0) {
        throw new Error("BST upper-bound invariant violated");
      }
      if (node.left && heapBefore(node.left, node, this.compare)) {
        throw new Error("Heap invariant violated on left child");
      }
      if (node.right && heapBefore(node.right, node, this.compare)) {
        throw new Error("Heap invariant violated on right child");
      }

      const expected = 1 +
        inspect(node.left, lower, node.key) +
        inspect(node.right, node.key, upper);
      if (node.size !== expected) throw new Error("Subtree size invariant violated");
      return expected;
    };

    if (inspect(this.root, undefined, undefined) !== this.size) {
      throw new Error("Root size mismatch");
    }
    return true;
  }
}

function runTests() {
  const assert = require("node:assert/strict");
  const empty = new PersistentTreapMap();
  const first = empty.set(4, "four").set(2, "two").set(8, "eight").set(6, "six");
  const branch = first.set(5, "five").delete(2);

  assert.equal(empty.size, 0);
  assert.equal(first.size, 4);
  assert.equal(first.has(2), true);
  assert.equal(first.has(5), false);
  assert.equal(branch.has(2), false);
  assert.equal(first.get(2), "two");
  assert.deepEqual(first.select(0), { key: 2, value: "two" });
  assert.deepEqual(first.select(2), { key: 6, value: "six" });
  assert.equal(first.select(99), undefined);
  assert.equal(first.rank(6), 2);
  assert.deepEqual(first.range(4, 8), [[4, "four"], [6, "six"], [8, "eight"]]);
  first.validate();
  branch.validate();

  let seed = 0xdecafbad;
  const random = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed / 0x100000000;
  };

  let tree = empty;
  const model = new Map();
  const snapshots = [];

  for (let step = 0; step < 500; step++) {
    const key = Math.floor(random() * 90);
    if (random() < 0.64) {
      const value = "v" + step;
      tree = tree.set(key, value);
      model.set(key, value);
    } else {
      tree = tree.delete(key);
      model.delete(key);
    }

    if (step % 75 === 0) snapshots.push({ tree, entries: tree.entries() });
    tree.validate();

    const expected = Array.from(model.entries()).sort((a, b) => a[0] - b[0]);
    assert.deepEqual(tree.entries(), expected);
    assert.equal(tree.size, model.size);

    for (let i = 0; i < expected.length; i++) {
      assert.deepEqual(tree.select(i), { key: expected[i][0], value: expected[i][1] });
      assert.equal(tree.rank(expected[i][0]), i);
    }
  }

  for (const snapshot of snapshots) {
    assert.deepEqual(snapshot.tree.entries(), snapshot.entries);
    snapshot.tree.validate();
  }

  console.log("Persistent treap tests passed");
}

if (require.main === module) runTests();

module.exports = { PersistentTreapMap };
