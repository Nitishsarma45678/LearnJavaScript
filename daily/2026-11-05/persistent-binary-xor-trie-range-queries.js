"use strict";

/*
 * Exercise: build immutable prefix versions of a 32-bit binary trie.
 * Query a half-open array range [left, right) for:
 *   - the stored value maximizing XOR with x,
 *   - the kth-smallest XOR result,
 *   - counts of values or XOR results below a threshold.
 *
 * Each insertion copies only one 33-node path, so old prefix roots remain valid.
 * Values and XOR results are unsigned 32-bit integers.
 */

function createPersistentXorIndex(values) {
  if (!Array.isArray(values)) throw new TypeError("values must be an array");

  const EMPTY = Object.freeze({ count: 0, left: null, right: null });
  const roots = [EMPTY];

  function toUint32(value, name) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xFFFFFFFF) {
      throw new RangeError(name + " must be an unsigned 32-bit integer");
    }
    return value >>> 0;
  }

  function insert(previousRoot, value) {
    const root = {
      count: previousRoot.count + 1,
      left: previousRoot.left,
      right: previousRoot.right
    };

    let oldNode = previousRoot;
    let newNode = root;

    for (let bit = 31; bit >= 0; bit -= 1) {
      const one = ((value >>> bit) & 1) === 1;
      const side = one ? "right" : "left";
      const oldChild = oldNode[side] ?? EMPTY;
      const newChild = {
        count: oldChild.count + 1,
        left: oldChild.left,
        right: oldChild.right
      };
      newNode[side] = newChild;
      oldNode = oldChild;
      newNode = newChild;
    }
    return root;
  }

  const normalized = values.map((value, index) => toUint32(value, "values[" + index + "]"));
  for (const value of normalized) roots.push(insert(roots[roots.length - 1], value));

  function validateRange(left, right) {
    if (!Number.isInteger(left) || !Number.isInteger(right) ||
        left < 0 || right < left || right > normalized.length) {
      throw new RangeError("Expected 0 <= left <= right <= values.length");
    }
  }

  function countDifference(leftNode, rightNode) {
    return (rightNode?.count ?? 0) - (leftNode?.count ?? 0);
  }

  function branch(node, side) {
    return node?.[side] ?? EMPTY;
  }

  function maxXor(left, right, rawX) {
    validateRange(left, right);
    const x = toUint32(rawX, "x");
    if (left === right) return null;

    let before = roots[left];
    let after = roots[right];
    let value = 0;

    for (let bit = 31; bit >= 0; bit -= 1) {
      const xBit = (x >>> bit) & 1;
      const preferredBit = xBit ^ 1;
      const preferredSide = preferredBit ? "right" : "left";
      const preferredBefore = branch(before, preferredSide);
      const preferredAfter = branch(after, preferredSide);

      let chosenBit;
      if (countDifference(preferredBefore, preferredAfter) > 0) {
        chosenBit = preferredBit;
        before = preferredBefore;
        after = preferredAfter;
      } else {
        chosenBit = xBit;
        const side = chosenBit ? "right" : "left";
        before = branch(before, side);
        after = branch(after, side);
      }
      value = (value | (chosenBit << bit)) >>> 0;
    }

    return { value, xor: (value ^ x) >>> 0 };
  }

  function countValue(left, right, rawValue) {
    validateRange(left, right);
    const value = toUint32(rawValue, "value");
    let before = roots[left];
    let after = roots[right];

    for (let bit = 31; bit >= 0; bit -= 1) {
      const side = ((value >>> bit) & 1) ? "right" : "left";
      before = branch(before, side);
      after = branch(after, side);
    }
    return countDifference(before, after);
  }

  function countXorLessThan(left, right, rawX, limit) {
    validateRange(left, right);
    const x = toUint32(rawX, "x");
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > 0x100000000) {
      throw new RangeError("limit must be in [0, 2^32]");
    }
    if (limit === 0) return 0;
    if (limit === 0x100000000) return right - left;

    let before = roots[left];
    let after = roots[right];
    let result = 0;

    for (let bit = 31; bit >= 0; bit -= 1) {
      const xBit = (x >>> bit) & 1;
      const limitBit = (limit >>> bit) & 1;
      const zeroXorSide = xBit ? "right" : "left";

      if (limitBit === 1) {
        result += countDifference(
          branch(before, zeroXorSide),
          branch(after, zeroXorSide)
        );
        const oneXorSide = xBit ? "left" : "right";
        before = branch(before, oneXorSide);
        after = branch(after, oneXorSide);
      } else {
        before = branch(before, zeroXorSide);
        after = branch(after, zeroXorSide);
      }
    }
    return result;
  }

  function kthSmallestXor(left, right, rawX, k) {
    validateRange(left, right);
    const x = toUint32(rawX, "x");
    const total = right - left;
    if (!Number.isInteger(k) || k < 0 || k >= total) {
      throw new RangeError("k must be a valid zero-based rank in the selected range");
    }

    let before = roots[left];
    let after = roots[right];
    let value = 0;
    let xor = 0;

    for (let bit = 31; bit >= 0; bit -= 1) {
      const xBit = (x >>> bit) & 1;
      const zeroXorSide = xBit ? "right" : "left";
      const zeroBefore = branch(before, zeroXorSide);
      const zeroAfter = branch(after, zeroXorSide);
      const zeroCount = countDifference(zeroBefore, zeroAfter);

      let chosenBit;
      if (k < zeroCount) {
        chosenBit = xBit;
        before = zeroBefore;
        after = zeroAfter;
      } else {
        k -= zeroCount;
        chosenBit = xBit ^ 1;
        const oneXorSide = xBit ? "left" : "right";
        before = branch(before, oneXorSide);
        after = branch(after, oneXorSide);
        xor = (xor | (1 << bit)) >>> 0;
      }
      value = (value | (chosenBit << bit)) >>> 0;
    }

    return { value, xor: (value ^ x) >>> 0 };
  }

  return Object.freeze({
    size: normalized.length,
    maxXor,
    countValue,
    countXorLessThan,
    kthSmallestXor
  });
}

if (require.main === module) {
  const assert = require("node:assert/strict");
  const index = createPersistentXorIndex([5, 1, 7, 3, 5]);

  assert.deepEqual(index.maxXor(1, 4, 2), { value: 7, xor: 5 });
  assert.equal(index.countValue(0, 5, 5), 2);
  assert.equal(index.countXorLessThan(0, 5, 2, 4), 2);
  assert.deepEqual(index.kthSmallestXor(0, 5, 2, 0), { value: 3, xor: 1 });
  assert.deepEqual(index.kthSmallestXor(0, 5, 2, 4), { value: 5, xor: 7 });
  assert.equal(index.maxXor(2, 2, 123), null);
  assert.equal(index.countXorLessThan(0, 5, 0, 0x100000000), 5);

  const persistent = createPersistentXorIndex([0, 0xFFFFFFFF, 0x80000000]);
  assert.deepEqual(persistent.maxXor(0, 3, 0), {
    value: 0xFFFFFFFF,
    xor: 0xFFFFFFFF
  });
  assert.equal(persistent.countValue(0, 1, 0), 1);
  assert.throws(() => index.maxXor(-1, 2, 0), RangeError);
  assert.throws(() => index.countXorLessThan(0, 5, 0, -1), RangeError);
  assert.throws(() => createPersistentXorIndex([1.5]), RangeError);

  console.log("Persistent binary XOR trie: all tests passed.");
}

module.exports = { createPersistentXorIndex };
