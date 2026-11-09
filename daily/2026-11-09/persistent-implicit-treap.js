/*
 * Persistent Implicit Treap
 * -------------------------
 * An immutable sequence supporting insert, remove, range addition, range
 * reversal, indexed reads and range sums. Split/merge use path copying, so
 * old versions remain valid. Lazy tags keep range operations logarithmic
 * on expected treap height.
 *
 * Ranges are half-open: [start, end). Values and range deltas must be finite
 * numbers. Priorities come from a deterministic integer mixer so examples
 * and tests are reproducible.
 */

"use strict";

const assert = require("node:assert/strict");

let priorityState = 0x6d2b79f5;

function nextPriority() {
  let value = (priorityState += 0x6d2b79f5) >>> 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return (value ^ (value >>> 14)) >>> 0;
}

function size(node) {
  return node ? node.size : 0;
}

function sum(node) {
  return node ? node.sum : 0;
}

function makeNode(value, priority, left = null, right = null) {
  return Object.freeze({
    value,
    priority,
    left,
    right,
    size: 1 + size(left) + size(right),
    sum: value + sum(left) + sum(right),
    add: 0,
    reversed: false
  });
}

function applyAdd(node, delta) {
  if (!node || delta === 0) return node;
  return Object.freeze({
    ...node,
    value: node.value + delta,
    sum: node.sum + delta * node.size,
    add: node.add + delta
  });
}

function applyReverse(node) {
  if (!node) return null;
  return Object.freeze({
    ...node,
    left: node.right,
    right: node.left,
    reversed: !node.reversed
  });
}

function push(node) {
  if (!node || (node.add === 0 && !node.reversed)) return node;

  let left = node.left;
  let right = node.right;

  if (node.add !== 0) {
    left = applyAdd(left, node.add);
    right = applyAdd(right, node.add);
  }
  if (node.reversed) {
    left = applyReverse(left);
    right = applyReverse(right);
  }

  return makeNode(node.value, node.priority, left, right);
}

function split(root, count) {
  if (!root) return [null, null];

  const current = push(root);
  const leftSize = size(current.left);

  if (count <= leftSize) {
    const [before, after] = split(current.left, count);
    return [
      before,
      makeNode(current.value, current.priority, after, current.right)
    ];
  }

  const [before, after] = split(
    current.right,
    count - leftSize - 1
  );
  return [
    makeNode(current.value, current.priority, current.left, before),
    after
  ];
}

function merge(left, right) {
  if (!left) return right;
  if (!right) return left;

  if (left.priority >= right.priority) {
    const root = push(left);
    return makeNode(
      root.value,
      root.priority,
      root.left,
      merge(root.right, right)
    );
  }

  const root = push(right);
  return makeNode(
    root.value,
    root.priority,
    merge(left, root.left),
    root.right
  );
}

function assertFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(label + " must be a finite number");
  }
}

class PersistentSequence {
  constructor(root = null) {
    this.root = root;
    Object.freeze(this);
  }

  static from(values) {
    let root = null;
    for (const value of values) {
      assertFiniteNumber(value, "Sequence value");
      root = merge(root, makeNode(value, nextPriority()));
    }
    return new PersistentSequence(root);
  }

  get length() {
    return size(this.root);
  }

  checkIndex(index, allowEnd = false) {
    const upper = allowEnd ? this.length : this.length - 1;
    if (!Number.isInteger(index) || index < 0 || index > upper) {
      throw new RangeError("Index is outside the sequence");
    }
  }

  checkRange(start, end) {
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end < start ||
      end > this.length
    ) {
      throw new RangeError("Expected a valid half-open range");
    }
  }

  get(index) {
    this.checkIndex(index);
    let current = this.root;
    let offset = index;

    while (current) {
      current = push(current);
      const leftSize = size(current.left);
      if (offset < leftSize) {
        current = current.left;
      } else if (offset === leftSize) {
        return current.value;
      } else {
        offset -= leftSize + 1;
        current = current.right;
      }
    }
    throw new Error("Treap invariant violated");
  }

  insert(index, value) {
    this.checkIndex(index, true);
    assertFiniteNumber(value, "Inserted value");
    const [left, right] = split(this.root, index);
    const middle = makeNode(value, nextPriority());
    return new PersistentSequence(merge(merge(left, middle), right));
  }

  remove(index) {
    this.checkIndex(index);
    const [left, rest] = split(this.root, index);
    const [middle, right] = split(rest, 1);
    const removed = push(middle).value;
    return {
      value: removed,
      sequence: new PersistentSequence(merge(left, right))
    };
  }

  rangeAdd(start, end, delta) {
    this.checkRange(start, end);
    assertFiniteNumber(delta, "Range delta");
    const [left, rest] = split(this.root, start);
    const [middle, right] = split(rest, end - start);
    return new PersistentSequence(
      merge(merge(left, applyAdd(middle, delta)), right)
    );
  }

  reverseRange(start, end) {
    this.checkRange(start, end);
    const [left, rest] = split(this.root, start);
    const [middle, right] = split(rest, end - start);
    return new PersistentSequence(
      merge(merge(left, applyReverse(middle)), right)
    );
  }

  rangeSum(start, end) {
    this.checkRange(start, end);
    const [, rest] = split(this.root, start);
    const [middle] = split(rest, end - start);
    return sum(middle);
  }

  toArray() {
    const result = [];
    const visit = node => {
      if (!node) return;
      const current = push(node);
      visit(current.left);
      result.push(current.value);
      visit(current.right);
    };
    visit(this.root);
    return result;
  }
}

function runTests() {
  const original = PersistentSequence.from([1, 2, 3, 4, 5]);
  const added = original.rangeAdd(1, 4, 10);
  assert.deepEqual(original.toArray(), [1, 2, 3, 4, 5]);
  assert.deepEqual(added.toArray(), [1, 12, 13, 14, 5]);
  assert.equal(added.rangeSum(1, 4), 39);

  const reversed = added.reverseRange(1, 4);
  assert.deepEqual(reversed.toArray(), [1, 14, 13, 12, 5]);
  const inserted = reversed.insert(2, 99);
  assert.deepEqual(inserted.toArray(), [1, 14, 99, 13, 12, 5]);

  const removed = inserted.remove(2);
  assert.equal(removed.value, 99);
  assert.deepEqual(removed.sequence.toArray(), reversed.toArray());
  assert.equal(original.get(2), 3);
  assert.equal(PersistentSequence.from([]).rangeSum(0, 0), 0);
  assert.throws(() => original.get(5), RangeError);
  assert.throws(() => original.rangeAdd(3, 2, 1), RangeError);

  // Differential model: every new version is compared with a plain array.
  let seed = 987654321;
  const random = max => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed % max;
  };

  let sequence = PersistentSequence.from([]);
  let model = [];
  const snapshots = [];

  for (let step = 0; step < 450; step += 1) {
    const operation = random(4);
    if (operation === 0 || model.length === 0) {
      const index = random(model.length + 1);
      const value = random(101) - 50;
      snapshots.push({ sequence, model: model.slice() });
      sequence = sequence.insert(index, value);
      model.splice(index, 0, value);
    } else if (operation === 1) {
      const index = random(model.length);
      const removed = sequence.remove(index);
      assert.equal(removed.value, model[index]);
      sequence = removed.sequence;
      model.splice(index, 1);
    } else {
      const start = random(model.length + 1);
      const end = start + random(model.length - start + 1);
      if (operation === 2) {
        const delta = random(21) - 10;
        sequence = sequence.rangeAdd(start, end, delta);
        for (let i = start; i < end; i += 1) model[i] += delta;
      } else {
        sequence = sequence.reverseRange(start, end);
        model.splice(start, end - start, ...model.slice(start, end).reverse());
      }
    }

    assert.deepEqual(sequence.toArray(), model);
    const left = random(model.length + 1);
    const right = left + random(model.length - left + 1);
    assert.equal(
      sequence.rangeSum(left, right),
      model.slice(left, right).reduce((total, value) => total + value, 0)
    );
  }

  for (const snapshot of snapshots.slice(0, 25)) {
    assert.deepEqual(snapshot.sequence.toArray(), snapshot.model);
  }

  console.log("PersistentSequence: all tests passed");
}

module.exports = { PersistentSequence };

if (require.main === module) runTests();
