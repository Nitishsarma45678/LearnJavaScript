'use strict';

/**
 * Persistent implicit treap for numeric sequences.
 *
 * Supports immutable insert/remove/set, range add/reverse, indexed access,
 * range sum/min, and materialization. Every update returns a new version;
 * untouched subtrees are shared between versions.
 *
 * Ranges are half-open: [start, end).
 */

function size(node) {
  return node ? node.size : 0;
}

function makeNode(value, priority, left = null, right = null) {
  const leftSize = size(left);
  const rightSize = size(right);
  return {
    value,
    priority,
    left,
    right,
    size: 1 + leftSize + rightSize,
    sum: value + (left ? left.sum : 0) + (right ? right.sum : 0),
    min: Math.min(value, left ? left.min : Infinity, right ? right.min : Infinity),
    lazyAdd: 0,
    reversed: false
  };
}

function applyAdd(node, delta) {
  if (!node || delta === 0) return node;
  return {
    ...node,
    value: node.value + delta,
    sum: node.sum + delta * node.size,
    min: node.min + delta,
    lazyAdd: node.lazyAdd + delta
  };
}

function applyReverse(node) {
  if (!node) return node;
  return {
    ...node,
    left: node.right,
    right: node.left,
    reversed: !node.reversed
  };
}

function push(node) {
  if (!node || (!node.reversed && node.lazyAdd === 0)) return node;
  let left = node.left;
  let right = node.right;

  if (node.reversed) {
    left = applyReverse(left);
    right = applyReverse(right);
  }
  if (node.lazyAdd !== 0) {
    left = applyAdd(left, node.lazyAdd);
    right = applyAdd(right, node.lazyAdd);
  }

  return makeNode(node.value, node.priority, left, right);
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

// Returns the first k elements and the remaining elements.
function split(root, k) {
  if (!root) return [null, null];
  const current = push(root);
  const leftSize = size(current.left);

  if (k <= leftSize) {
    const [before, after] = split(current.left, k);
    return [
      before,
      makeNode(current.value, current.priority, after, current.right)
    ];
  }

  const [before, after] = split(current.right, k - leftSize - 1);
  return [
    makeNode(current.value, current.priority, current.left, before),
    after
  ];
}

function makeRandom(seed) {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return {
    next() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return state >>> 0;
    }
  };
}

function assertIndex(index, length, allowEnd = false) {
  const upper = allowEnd ? length : length - 1;
  if (!Number.isInteger(index) || index < 0 || index > upper) {
    throw new RangeError('Index is outside the sequence');
  }
}

function assertRange(start, end, length) {
  if (!Number.isInteger(start) || !Number.isInteger(end) ||
      start < 0 || end < start || end > length) {
    throw new RangeError('Expected a valid half-open range');
  }
}

function createPersistentSequence(values = [], seed = 0x12345678) {
  if (!Array.isArray(values)) throw new TypeError('values must be an array');
  const random = makeRandom(seed);
  let root = null;

  for (const value of values) {
    if (!Number.isFinite(value)) throw new TypeError('Values must be finite numbers');
    root = merge(root, makeNode(value, random.next()));
  }

  return makeVersion(root, random);
}

function makeVersion(root, random) {
  const sequence = {
    get length() {
      return size(root);
    },

    get(index) {
      assertIndex(index, size(root));
      let current = root;
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
      throw new Error('Treap invariant violated');
    },

    toArray() {
      const result = [];
      function visit(node) {
        if (!node) return;
        const current = push(node);
        visit(current.left);
        result.push(current.value);
        visit(current.right);
      }
      visit(root);
      return result;
    },

    insert(index, value) {
      assertIndex(index, size(root), true);
      if (!Number.isFinite(value)) throw new TypeError('Value must be finite');
      const [left, right] = split(root, index);
      const inserted = makeNode(value, random.next());
      return makeVersion(merge(merge(left, inserted), right), random);
    },

    remove(index) {
      assertIndex(index, size(root));
      const [left, tail] = split(root, index);
      const [middle, right] = split(tail, 1);
      const removed = push(middle).value;
      return {
        value: removed,
        sequence: makeVersion(merge(left, right), random)
      };
    },

    set(index, value) {
      assertIndex(index, size(root));
      if (!Number.isFinite(value)) throw new TypeError('Value must be finite');
      const [left, tail] = split(root, index);
      const [middle, right] = split(tail, 1);
      const current = push(middle);
      const replacement = makeNode(value, current.priority);
      return makeVersion(merge(merge(left, replacement), right), random);
    },

    rangeAdd(start, end, delta) {
      assertRange(start, end, size(root));
      if (!Number.isFinite(delta)) throw new TypeError('Delta must be finite');
      if (start === end || delta === 0) return sequence;
      const [left, tail] = split(root, start);
      const [middle, right] = split(tail, end - start);
      return makeVersion(
        merge(merge(left, applyAdd(middle, delta)), right),
        random
      );
    },

    rangeReverse(start, end) {
      assertRange(start, end, size(root));
      if (end - start < 2) return sequence;
      const [left, tail] = split(root, start);
      const [middle, right] = split(tail, end - start);
      return makeVersion(
        merge(merge(left, applyReverse(middle)), right),
        random
      );
    },

    rangeSum(start, end) {
      assertRange(start, end, size(root));
      if (start === end) return 0;
      const [, tail] = split(root, start);
      const [middle] = split(tail, end - start);
      return middle.sum;
    },

    rangeMin(start, end) {
      assertRange(start, end, size(root));
      if (start === end) throw new RangeError('Minimum of an empty range is undefined');
      const [, tail] = split(root, start);
      const [middle] = split(tail, end - start);
      return middle.min;
    }
  };

  return Object.freeze(sequence);
}

function runTests() {
  const assert = require('node:assert/strict');
  let sequence = createPersistentSequence([4, 1, 7, 3, 9, 2]);
  const original = sequence;

  sequence = sequence.rangeAdd(1, 5, 10);
  assert.deepEqual(sequence.toArray(), [4, 11, 17, 13, 19, 2]);
  assert.deepEqual(original.toArray(), [4, 1, 7, 3, 9, 2]);

  const reversed = sequence.rangeReverse(1, 5);
  assert.deepEqual(reversed.toArray(), [4, 19, 13, 17, 11, 2]);
  assert.equal(reversed.rangeSum(1, 5), 60);
  assert.equal(reversed.rangeMin(1, 5), 11);

  const inserted = reversed.insert(3, -5);
  assert.deepEqual(inserted.toArray(), [4, 19, 13, -5, 17, 11, 2]);
  const removed = inserted.remove(3);
  assert.equal(removed.value, -5);
  assert.deepEqual(removed.sequence.toArray(), reversed.toArray());
  assert.deepEqual(inserted.toArray(), [4, 19, 13, -5, 17, 11, 2]);

  let model = [3, 8, -2, 6, 0];
  let version = createPersistentSequence(model, 42);
  let seed = 123456789;
  const randomInt = (limit) => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed % limit;
  };

  for (let step = 0; step < 400; step += 1) {
    const operation = randomInt(5);
    if (operation === 0 || model.length === 0) {
      const index = randomInt(model.length + 1);
      const value = randomInt(41) - 20;
      version = version.insert(index, value);
      model.splice(index, 0, value);
    } else if (operation === 1) {
      const index = randomInt(model.length);
      const result = version.remove(index);
      assert.equal(result.value, model[index]);
      version = result.sequence;
      model.splice(index, 1);
    } else {
      const a = randomInt(model.length + 1);
      const b = a + randomInt(model.length - a + 1);
      if (operation === 2) {
        const delta = randomInt(11) - 5;
        version = version.rangeAdd(a, b, delta);
        for (let i = a; i < b; i += 1) model[i] += delta;
      } else if (operation === 3) {
        version = version.rangeReverse(a, b);
        model.splice(a, b - a, ...model.slice(a, b).reverse());
      } else {
        const index = randomInt(model.length);
        const value = randomInt(51) - 25;
        version = version.set(index, value);
        model[index] = value;
      }
    }

    assert.deepEqual(version.toArray(), model);
    assert.equal(version.length, model.length);
    if (model.length) {
      const index = randomInt(model.length);
      assert.equal(version.get(index), model[index]);
    }
  }

  assert.throws(() => createPersistentSequence([1, Infinity]), TypeError);
  assert.throws(() => original.get(99), RangeError);
  console.log('Persistent implicit treap: all tests passed');
}

module.exports = { createPersistentSequence };

if (require.main === module) runTests();
