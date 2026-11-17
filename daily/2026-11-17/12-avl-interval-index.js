/**
 * EXERCISE: AVL Interval Index
 *
 * Maintain closed numeric intervals in an AVL tree augmented with maxEnd.
 * Query every interval intersecting [from, to] without scanning the full set.
 *
 * Operations: insert/remove O(log n), overlap query O(log n + k) in typical
 * reporting workloads, where k is the number of returned intervals.
 */

"use strict";

function height(node) {
  return node ? node.height : 0;
}

function maxEnd(node) {
  return node ? node.maxEnd : -Infinity;
}

function compareInterval(a, b) {
  if (a.start !== b.start) return a.start - b.start;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function makeNode(interval, left = null, right = null) {
  return {
    interval,
    left,
    right,
    height: 1 + Math.max(height(left), height(right)),
    maxEnd: Math.max(interval.end, maxEnd(left), maxEnd(right))
  };
}

function rotateRight(root) {
  const pivot = root.left;
  const moved = makeNode(root.interval, pivot.right, root.right);
  return makeNode(pivot.interval, pivot.left, moved);
}

function rotateLeft(root) {
  const pivot = root.right;
  const moved = makeNode(root.interval, root.left, pivot.left);
  return makeNode(pivot.interval, moved, pivot.right);
}

function balance(node) {
  if (!node) return null;
  const factor = height(node.left) - height(node.right);

  if (factor > 1) {
    if (height(node.left.left) < height(node.left.right)) {
      node = makeNode(node.interval, rotateLeft(node.left), node.right);
    }
    return rotateRight(node);
  }

  if (factor < -1) {
    if (height(node.right.right) < height(node.right.left)) {
      node = makeNode(node.interval, node.left, rotateRight(node.right));
    }
    return rotateLeft(node);
  }

  return node;
}

function insertNode(root, interval) {
  if (!root) return makeNode(interval);
  const order = compareInterval(interval, root.interval);
  if (order < 0) {
    return balance(makeNode(root.interval, insertNode(root.left, interval), root.right));
  }
  return balance(makeNode(root.interval, root.left, insertNode(root.right, interval)));
}

function minimumNode(root) {
  while (root.left) root = root.left;
  return root;
}

function deleteNode(root, interval) {
  if (!root) return null;
  const order = compareInterval(interval, root.interval);

  if (order < 0) return balance(makeNode(root.interval, deleteNode(root.left, interval), root.right));
  if (order > 0) return balance(makeNode(root.interval, root.left, deleteNode(root.right, interval)));

  if (!root.left) return root.right;
  if (!root.right) return root.left;

  const successor = minimumNode(root.right);
  return balance(makeNode(
    successor.interval,
    root.left,
    deleteNode(root.right, successor.interval)
  ));
}

class AVLIntervalIndex {
  constructor() {
    this.root = null;
    this.byId = new Map();
  }

  get size() {
    return this.byId.size;
  }

  insert(id, start, end) {
    if (typeof id !== "string" || id.length === 0) {
      throw new TypeError("Interval id must be a non-empty string");
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
      throw new RangeError("Expected finite endpoints with start <= end");
    }
    if (this.byId.has(id)) throw new Error("Duplicate interval id: " + id);

    const interval = Object.freeze({ id, start, end });
    this.root = insertNode(this.root, interval);
    this.byId.set(id, interval);
    return interval;
  }

  remove(id) {
    const interval = this.byId.get(id);
    if (!interval) return false;
    this.root = deleteNode(this.root, interval);
    this.byId.delete(id);
    return true;
  }

  get(id) {
    return this.byId.get(id);
  }

  query(from, to) {
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
      throw new RangeError("Expected finite query endpoints with from <= to");
    }

    const found = [];
    const visit = (node) => {
      if (!node) return;

      if (node.left && node.left.maxEnd >= from) visit(node.left);

      const item = node.interval;
      if (item.start <= to && item.end >= from) found.push(item);

      if (node.right && item.start <= to) visit(node.right);
    };

    visit(this.root);
    return found;
  }

  findAny(from, to) {
    return this.query(from, to)[0] || null;
  }

  validate() {
    const inspect = (node, lower, upper) => {
      if (!node) return { height: 0, maxEnd: -Infinity, count: 0 };

      if (lower && compareInterval(node.interval, lower) <= 0) {
        throw new Error("BST lower-bound invariant violated");
      }
      if (upper && compareInterval(node.interval, upper) >= 0) {
        throw new Error("BST upper-bound invariant violated");
      }

      const left = inspect(node.left, lower, node.interval);
      const right = inspect(node.right, node.interval, upper);
      const expectedHeight = 1 + Math.max(left.height, right.height);
      const expectedMax = Math.max(node.interval.end, left.maxEnd, right.maxEnd);

      if (Math.abs(left.height - right.height) > 1) throw new Error("AVL balance violated");
      if (node.height !== expectedHeight) throw new Error("Incorrect stored height");
      if (node.maxEnd !== expectedMax) throw new Error("Incorrect maxEnd augmentation");

      return {
        height: expectedHeight,
        maxEnd: expectedMax,
        count: left.count + right.count + 1
      };
    };

    const result = inspect(this.root, null, null);
    if (result.count !== this.byId.size) throw new Error("Index size mismatch");
    return true;
  }
}

function runTests() {
  const assert = require("node:assert/strict");
  const index = new AVLIntervalIndex();

  index.insert("a", 5, 9);
  index.insert("b", 1, 3);
  index.insert("c", 8, 12);
  index.insert("d", 20, 25);
  assert.deepEqual(index.query(3, 8).map((x) => x.id), ["b", "a", "c"]);
  assert.equal(index.findAny(13, 19), null);
  assert.equal(index.remove("a"), true);
  assert.equal(index.remove("missing"), false);
  assert.deepEqual(index.query(8, 8).map((x) => x.id), ["c"]);
  assert.throws(() => index.insert("bad", 4, 2), RangeError);
  assert.throws(() => index.insert("b", 0, 1), /Duplicate/);
  index.validate();

  let seed = 0x12345678;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  const randomizedIndex = new AVLIntervalIndex();
  const model = new Map();
  for (let step = 0; step < 600; step++) {
    if (random() < 0.62 || model.size === 0) {
      const id = "r" + step;
      const start = Math.floor(random() * 100) - 30;
      const end = start + Math.floor(random() * 18);
      randomizedIndex.insert(id, start, end);
      model.set(id, { id, start, end });
    } else {
      const ids = Array.from(model.keys());
      const id = ids[Math.floor(random() * ids.length)];
      assert.equal(randomizedIndex.remove(id), true);
      model.delete(id);
    }

    const from = Math.floor(random() * 100) - 30;
    const to = from + Math.floor(random() * 20);
    const expected = Array.from(model.values())
      .filter((x) => x.start <= to && x.end >= from)
      .sort(compareInterval);
    assert.deepEqual(randomizedIndex.query(from, to), expected);
    randomizedIndex.validate();
  }

  console.log("AVL interval index tests passed");
}

if (require.main === module) runTests();

module.exports = { AVLIntervalIndex };
