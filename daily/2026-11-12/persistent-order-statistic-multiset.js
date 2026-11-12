/**
 * Persistent order-statistic multiset.
 *
 * Exercise:
 * Build immutable segment-tree versions over a known coordinate domain.
 * Every insert/remove returns a new version while old versions remain
 * queryable. Support kth-smallest, value-range counts, and kth queries over
 * the multiset difference between two versions.
 *
 * Complexity: O(log M) per update/query, where M is the number of distinct
 * values in the compressed coordinate domain. Each update allocates O(log M)
 * new nodes; unchanged subtrees are structurally shared.
 *
 * Run: node persistent-order-statistic-multiset.js
 */

const EMPTY = Object.freeze({ count: 0, left: null, right: null });

class PersistentOrderStatisticMultiset {
  constructor(domain) {
    if (!Array.isArray(domain) || domain.length === 0) {
      throw new TypeError("domain must be a non-empty array");
    }
    if (domain.some(value => typeof value !== "number" || !Number.isFinite(value))) {
      throw new TypeError("domain values must be finite numbers");
    }
    this.values = [...new Set(domain)].sort((a, b) => a - b);
    this.index = new Map(this.values.map((value, i) => [value, i]));
    this.roots = [EMPTY];
  }

  _version(version) {
    if (!Number.isInteger(version) || version < 0 || version >= this.roots.length) {
      throw new RangeError("unknown version");
    }
    return this.roots[version];
  }

  _update(node, left, right, position, delta) {
    node ||= EMPTY;
    const nextCount = node.count + delta;
    if (nextCount < 0) throw new Error("cannot remove a value that is not present");
    if (left === right) return { count: nextCount, left: null, right: null };

    const middle = (left + right) >> 1;
    let nextLeft = node.left;
    let nextRight = node.right;
    if (position <= middle) {
      nextLeft = this._update(node.left, left, middle, position, delta);
    } else {
      nextRight = this._update(node.right, middle + 1, right, position, delta);
    }
    return { count: nextCount, left: nextLeft, right: nextRight };
  }

  _change(version, value, delta) {
    const position = this.index.get(value);
    if (position === undefined) throw new RangeError(`value ${value} is outside the coordinate domain`);
    const root = this._update(this._version(version), 0, this.values.length - 1, position, delta);
    this.roots.push(root);
    return this.roots.length - 1;
  }

  insert(version, value) {
    return this._change(version, value, 1);
  }

  remove(version, value) {
    return this._change(version, value, -1);
  }

  size(version) {
    return this._version(version).count;
  }

  _query(node, left, right, queryLeft, queryRight) {
    if (!node || queryRight < left || right < queryLeft) return 0;
    if (queryLeft <= left && right <= queryRight) return node.count;
    const middle = (left + right) >> 1;
    return this._query(node.left, left, middle, queryLeft, queryRight) +
      this._query(node.right, middle + 1, right, queryLeft, queryRight);
  }

  _lowerBound(value) {
    let low = 0, high = this.values.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (this.values[middle] < value) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  _upperBound(value) {
    let low = 0, high = this.values.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (this.values[middle] <= value) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  countRange(version, minimum, maximum) {
    if (minimum > maximum) return 0;
    const root = this._version(version);
    const left = this._lowerBound(minimum);
    const right = this._upperBound(maximum) - 1;
    if (left > right || left >= this.values.length || right < 0) return 0;
    return this._query(root, 0, this.values.length - 1, left, right);
  }

  kth(version, k) {
    let node = this._version(version);
    if (!Number.isInteger(k) || k < 1 || k > node.count) {
      throw new RangeError("k must be between 1 and the version size");
    }
    let left = 0, right = this.values.length - 1;
    while (left < right) {
      const middle = (left + right) >> 1;
      const leftCount = node.left?.count || 0;
      if (k <= leftCount) {
        node = node.left;
        right = middle;
      } else {
        k -= leftCount;
        node = node.right;
        left = middle + 1;
      }
    }
    return this.values[left];
  }

  kthBetween(olderVersion, newerVersion, k) {
    let older = this._version(olderVersion);
    let newer = this._version(newerVersion);
    const total = newer.count - older.count;
    if (!Number.isInteger(k) || k < 1 || k > total) {
      throw new RangeError("k must be between 1 and the version-difference size");
    }
    let left = 0, right = this.values.length - 1;
    while (left < right) {
      const middle = (left + right) >> 1;
      const leftCount = (newer.left?.count || 0) - (older.left?.count || 0);
      const rightCount = (newer.right?.count || 0) - (older.right?.count || 0);
      if (leftCount < 0 || rightCount < 0) {
        throw new Error("newer version is not a multiset superset of older version");
      }
      if (k <= leftCount) {
        older = older.left || EMPTY;
        newer = newer.left || EMPTY;
        right = middle;
      } else {
        k -= leftCount;
        older = older.right || EMPTY;
        newer = newer.right || EMPTY;
        left = middle + 1;
      }
    }
    if ((newer.count - older.count) < 0) {
      throw new Error("newer version is not a multiset superset of older version");
    }
    return this.values[left];
  }
}

function runTests() {
  const assert = require("node:assert/strict");
  const tree = new PersistentOrderStatisticMultiset([9, 1, 5, 3, 5, 7]);
  const v1 = tree.insert(0, 5);
  const v2 = tree.insert(v1, 1);
  const v3 = tree.insert(v2, 9);
  const v4 = tree.insert(v3, 5);
  assert.equal(tree.size(0), 0);
  assert.equal(tree.size(v4), 4);
  assert.deepEqual([1, 2, 3, 4].map(k => tree.kth(v4, k)), [1, 5, 5, 9]);
  assert.equal(tree.countRange(v4, 4, 8), 2);
  const v5 = tree.remove(v4, 5);
  assert.deepEqual([1, 2, 3].map(k => tree.kth(v5, k)), [1, 5, 9]);
  assert.equal(tree.kthBetween(v1, v4, 2), 9);
  assert.equal(tree.countRange(v1, -10, 100), 1);
  assert.throws(() => tree.remove(0, 5), /not present/);
  assert.throws(() => tree.kth(v4, 0), /k must/);
  assert.throws(() => tree.insert(v4, 2), /outside/);

  const onlyNine = tree.insert(0, 9);
  const twoLeft = tree.insert(tree.insert(0, 1), 5);
  assert.throws(() => tree.kthBetween(onlyNine, twoLeft, 1), /superset/);
  console.log("PersistentOrderStatisticMultiset: all tests passed");
}

if (require.main === module) runTests();
module.exports = { PersistentOrderStatisticMultiset };
