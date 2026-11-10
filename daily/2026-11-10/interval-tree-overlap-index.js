/*
 * AVL Interval Tree with max-end augmentation
 * --------------------------------------------
 * Stores closed numeric intervals and reports every interval intersecting
 * a query in O(log n + k) time on a balanced tree, where k is the result
 * count. Each AVL node is ordered by (start, insertionOrder) and stores the
 * maximum end point in its subtree for overlap pruning.
 *
 * IDs are unique. Intervals may share endpoints and zero-length intervals
 * are supported. Query boundaries are inclusive.
 */

"use strict";

const assert = require("node:assert/strict");

function height(node) {
  return node ? node.height : 0;
}

function maxEnd(node) {
  return node ? node.maxEnd : -Infinity;
}

function compareKey(startA, orderA, startB, orderB) {
  if (startA !== startB) return startA - startB;
  return orderA - orderB;
}

class IntervalNode {
  constructor(id, start, end, order) {
    this.id = id;
    this.start = start;
    this.end = end;
    this.order = order;
    this.left = null;
    this.right = null;
    this.height = 1;
    this.maxEnd = end;
  }
}

class IntervalTree {
  constructor() {
    this.root = null;
    this.nextOrder = 1;
    this.ids = new Map();
  }

  get size() {
    return this.ids.size;
  }

  _update(node) {
    node.height = 1 + Math.max(height(node.left), height(node.right));
    node.maxEnd = Math.max(
      node.end,
      maxEnd(node.left),
      maxEnd(node.right)
    );
    return node;
  }

  _rotateRight(root) {
    const pivot = root.left;
    root.left = pivot.right;
    pivot.right = root;
    this._update(root);
    return this._update(pivot);
  }

  _rotateLeft(root) {
    const pivot = root.right;
    root.right = pivot.left;
    pivot.left = root;
    this._update(root);
    return this._update(pivot);
  }

  _balance(node) {
    if (!node) return null;
    this._update(node);

    const factor = height(node.left) - height(node.right);
    if (factor > 1) {
      if (height(node.left.left) < height(node.left.right)) {
        node.left = this._rotateLeft(node.left);
      }
      return this._rotateRight(node);
    }

    if (factor < -1) {
      if (height(node.right.right) < height(node.right.left)) {
        node.right = this._rotateRight(node.right);
      }
      return this._rotateLeft(node);
    }

    return node;
  }

  _insert(root, inserted) {
    if (!root) return inserted;

    const order = compareKey(
      inserted.start,
      inserted.order,
      root.start,
      root.order
    );

    if (order < 0) {
      root.left = this._insert(root.left, inserted);
    } else {
      root.right = this._insert(root.right, inserted);
    }
    return this._balance(root);
  }

  insert(id, start, end) {
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      throw new TypeError("Interval endpoints must be finite numbers");
    }
    if (start > end) {
      throw new RangeError("Interval start must not exceed its end");
    }
    if (this.ids.has(id)) {
      throw new Error("Interval ID already exists");
    }

    const order = this.nextOrder++;
    const node = new IntervalNode(id, start, end, order);
    this.root = this._insert(this.root, node);
    this.ids.set(id, { start, order });
    return this;
  }

  _minimum(node) {
    while (node.left) node = node.left;
    return node;
  }

  _remove(root, start, order) {
    if (!root) return null;

    const comparison = compareKey(start, order, root.start, root.order);
    if (comparison < 0) {
      root.left = this._remove(root.left, start, order);
    } else if (comparison > 0) {
      root.right = this._remove(root.right, start, order);
    } else {
      if (!root.left) return root.right;
      if (!root.right) return root.left;

      const successor = this._minimum(root.right);
      root.id = successor.id;
      root.start = successor.start;
      root.end = successor.end;
      root.order = successor.order;
      root.right = this._remove(
        root.right,
        successor.start,
        successor.order
      );
    }

    return this._balance(root);
  }

  remove(id) {
    const key = this.ids.get(id);
    if (!key) return false;

    this.root = this._remove(this.root, key.start, key.order);
    this.ids.delete(id);
    return true;
  }

  search(queryStart, queryEnd) {
    if (!Number.isFinite(queryStart) || !Number.isFinite(queryEnd)) {
      throw new TypeError("Query endpoints must be finite numbers");
    }
    if (queryStart > queryEnd) {
      throw new RangeError("Query start must not exceed its end");
    }

    const matches = [];

    const visit = node => {
      if (!node || node.maxEnd < queryStart) return;

      if (node.left && node.left.maxEnd >= queryStart) {
        visit(node.left);
      }

      if (node.start <= queryEnd && node.end >= queryStart) {
        matches.push({
          id: node.id,
          start: node.start,
          end: node.end
        });
      }

      // Every key in the right subtree has start >= node.start.
      if (node.start <= queryEnd) {
        visit(node.right);
      }
    };

    visit(this.root);
    return matches;
  }

  validate() {
    const visit = (node, lower, upper) => {
      if (!node) {
        return { height: 0, maxEnd: -Infinity, count: 0 };
      }

      const key = { start: node.start, order: node.order };
      if (
        (lower && compareKey(key.start, key.order, lower.start, lower.order) <= 0) ||
        (upper && compareKey(key.start, key.order, upper.start, upper.order) >= 0)
      ) {
        throw new Error("BST ordering invariant violated");
      }

      const left = visit(node.left, lower, key);
      const right = visit(node.right, key, upper);
      const expectedHeight = 1 + Math.max(left.height, right.height);
      const expectedMax = Math.max(node.end, left.maxEnd, right.maxEnd);

      if (Math.abs(left.height - right.height) > 1) {
        throw new Error("AVL balance invariant violated");
      }
      if (node.height !== expectedHeight) {
        throw new Error("Stored height is incorrect");
      }
      if (node.maxEnd !== expectedMax) {
        throw new Error("Subtree maxEnd is incorrect");
      }

      return {
        height: expectedHeight,
        maxEnd: expectedMax,
        count: left.count + right.count + 1
      };
    };

    const result = visit(this.root, null, null);
    if (result.count !== this.size) {
      throw new Error("Tree size does not match ID index");
    }
    return true;
  }
}

function runTests() {
  const tree = new IntervalTree();
  tree
    .insert("a", 15, 20)
    .insert("b", 10, 30)
    .insert("c", 17, 19)
    .insert("d", 5, 20)
    .insert("e", 12, 15)
    .insert("f", 30, 40);

  assert.deepEqual(
    tree.search(14, 16).map(item => item.id).sort(),
    ["a", "b", "d", "e"]
  );
  assert.deepEqual(tree.search(40, 40).map(item => item.id), ["f"]);
  assert.deepEqual(tree.search(41, 50), []);
  assert.equal(tree.remove("b"), true);
  assert.equal(tree.remove("b"), false);
  assert.equal(tree.validate(), true);
  assert.throws(() => tree.insert("a", 1, 2), /already exists/);
  assert.throws(() => tree.insert("bad", 5, 4), /must not exceed/);

  // Differential test against a plain Map after randomized insertions,
  // removals, and inclusive overlap queries.
  let seed = 0x51f15e;
  const random = max => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed % max;
  };

  const randomTree = new IntervalTree();
  const reference = new Map();
  let nextId = 0;

  for (let step = 0; step < 900; step += 1) {
    const action = random(3);

    if (action === 0 || reference.size === 0) {
      const id = "r" + nextId++;
      const start = random(200) - 100;
      const end = start + random(25);
      randomTree.insert(id, start, end);
      reference.set(id, { id, start, end });
    } else if (action === 1) {
      const keys = Array.from(reference.keys());
      const id = keys[random(keys.length)];
      assert.equal(randomTree.remove(id), true);
      reference.delete(id);
    } else {
      const start = random(220) - 110;
      const end = start + random(35);
      const expectedIds = Array.from(reference.values())
        .filter(item => item.start <= end && item.end >= start)
        .map(item => item.id)
        .sort();
      const actualIds = randomTree.search(start, end)
        .map(item => item.id)
        .sort();
      assert.deepEqual(actualIds, expectedIds);
    }

    assert.equal(randomTree.validate(), true);
    assert.equal(randomTree.size, reference.size);
  }

  console.log("IntervalTree: all tests passed");
}

module.exports = { IntervalTree };

if (require.main === module) {
  runTests();
}