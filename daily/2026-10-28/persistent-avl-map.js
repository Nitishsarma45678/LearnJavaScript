// Persistent AVL map: every update returns a new balanced tree while old versions remain usable.
// Keys are ordered by the supplied comparator. Run with: node persistent-avl-map.js
const assert = require("node:assert/strict");

const height = (node) => (node ? node.height : 0);
const nodeSize = (node) => (node ? node.size : 0);

function makeNode(key, value, left = null, right = null) {
  return {
    key,
    value,
    left,
    right,
    height: 1 + Math.max(height(left), height(right)),
    size: 1 + nodeSize(left) + nodeSize(right),
  };
}

function rotateRight(root) {
  const pivot = root.left;
  const moved = pivot.right;
  return makeNode(
    pivot.key,
    pivot.value,
    pivot.left,
    makeNode(root.key, root.value, moved, root.right)
  );
}

function rotateLeft(root) {
  const pivot = root.right;
  const moved = pivot.left;
  return makeNode(
    pivot.key,
    pivot.value,
    makeNode(root.key, root.value, root.left, moved),
    pivot.right
  );
}

function rebalance(rawNode) {
  let node = makeNode(rawNode.key, rawNode.value, rawNode.left, rawNode.right);
  const factor = height(node.left) - height(node.right);

  if (factor > 1) {
    if (height(node.left.left) < height(node.left.right)) {
      node = makeNode(node.key, node.value, rotateLeft(node.left), node.right);
    }
    return rotateRight(node);
  }

  if (factor < -1) {
    if (height(node.right.right) < height(node.right.left)) {
      node = makeNode(node.key, node.value, node.left, rotateRight(node.right));
    }
    return rotateLeft(node);
  }

  return node;
}

function findNode(root, key, compare) {
  let current = root;
  while (current) {
    const order = compare(key, current.key);
    if (order === 0) return current;
    current = order < 0 ? current.left : current.right;
  }
  return null;
}

function insertNode(root, key, value, compare) {
  if (!root) return makeNode(key, value);
  const order = compare(key, root.key);

  if (order === 0) return makeNode(root.key, value, root.left, root.right);
  if (order < 0) {
    return rebalance(makeNode(root.key, root.value, insertNode(root.left, key, value, compare), root.right));
  }
  return rebalance(makeNode(root.key, root.value, root.left, insertNode(root.right, key, value, compare)));
}

function minimumNode(root) {
  let current = root;
  while (current.left) current = current.left;
  return current;
}

function removeMinimum(root) {
  if (!root.left) return root.right;
  return rebalance(makeNode(root.key, root.value, removeMinimum(root.left), root.right));
}

function deleteNode(root, key, compare) {
  if (!root) return null;
  const order = compare(key, root.key);

  if (order < 0) {
    const left = deleteNode(root.left, key, compare);
    if (left === root.left) return root;
    return rebalance(makeNode(root.key, root.value, left, root.right));
  }

  if (order > 0) {
    const right = deleteNode(root.right, key, compare);
    if (right === root.right) return root;
    return rebalance(makeNode(root.key, root.value, root.left, right));
  }

  if (!root.left) return root.right;
  if (!root.right) return root.left;

  const successor = minimumNode(root.right);
  return rebalance(makeNode(
    successor.key,
    successor.value,
    root.left,
    removeMinimum(root.right)
  ));
}

class PersistentAVLMap {
  constructor(root = null, compare = PersistentAVLMap.defaultCompare) {
    this.root = root;
    this.compare = compare;
  }

  static defaultCompare(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
  }

  get size() {
    return nodeSize(this.root);
  }

  has(key) {
    return findNode(this.root, key, this.compare) !== null;
  }

  get(key) {
    const found = findNode(this.root, key, this.compare);
    return found ? found.value : undefined;
  }

  set(key, value) {
    return new PersistentAVLMap(insertNode(this.root, key, value, this.compare), this.compare);
  }

  delete(key) {
    if (!this.has(key)) return this;
    return new PersistentAVLMap(deleteNode(this.root, key, this.compare), this.compare);
  }

  entries() {
    const result = [];
    const stack = [];
    let current = this.root;

    while (current || stack.length) {
      while (current) {
        stack.push(current);
        current = current.left;
      }
      current = stack.pop();
      result.push([current.key, current.value]);
      current = current.right;
    }
    return result;
  }

  [Symbol.iterator]() {
    return this.entries()[Symbol.iterator]();
  }
}

function assertAVL(node, compare) {
  if (!node) return { height: 0, size: 0 };
  const left = assertAVL(node.left, compare);
  const right = assertAVL(node.right, compare);
  assert.ok(Math.abs(left.height - right.height) <= 1, "AVL balance invariant");
  assert.equal(node.height, 1 + Math.max(left.height, right.height));
  assert.equal(node.size, 1 + left.size + right.size);
  if (node.left) assert.ok(compare(node.left.key, node.key) < 0);
  if (node.right) assert.ok(compare(node.right.key, node.key) > 0);
  return { height: node.height, size: node.size };
}

let map = new PersistentAVLMap();
for (const key of [40, 20, 60, 10, 30, 50, 70, 25, 35, 5, 15]) {
  map = map.set(key, "v" + key);
}
const original = map;
const updated = map.set(30, "changed").set(65, "v65").delete(20);

assert.equal(original.get(30), "v30", "old versions must remain unchanged");
assert.equal(updated.get(30), "changed");
assert.equal(updated.has(20), false);
assert.equal(updated.get(65), "v65");
assert.equal(updated.size, original.size);
assert.deepEqual(updated.entries().map(([key]) => key), [5, 10, 15, 25, 30, 35, 40, 50, 60, 65, 70]);
assert.equal(updated.delete(999), updated, "deleting a missing key returns the same version");
assertAVL(original.root, original.compare);
assertAVL(updated.root, updated.compare);

const withUndefined = new PersistentAVLMap().set("present", undefined);
assert.equal(withUndefined.has("present"), true);
assert.equal(withUndefined.get("present"), undefined);
assert.equal(withUndefined.has("missing"), false);

console.log("PersistentAVLMap: all assertions passed");
