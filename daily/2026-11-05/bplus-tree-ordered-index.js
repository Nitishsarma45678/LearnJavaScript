"use strict";

const assert = require("node:assert/strict");

function defaultCompare(a, b) {
  if (typeof a !== typeof b || (typeof a !== "number" && typeof a !== "string")) {
    throw new TypeError("default keys must be numbers or strings of one consistent type");
  }
  if (typeof a === "number" && (!Number.isFinite(a) || !Number.isFinite(b))) {
    throw new TypeError("numeric keys must be finite");
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

function lowerBound(items, key, compare) {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (compare(items[middle], key) < 0) low = middle + 1;
    else high = middle;
  }
  return low;
}

function upperBound(items, key, compare) {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (compare(items[middle], key) <= 0) low = middle + 1;
    else high = middle;
  }
  return low;
}

function firstKey(node) {
  while (!node.leaf) node = node.children[0];
  if (node.keys.length === 0) throw new Error("internal tree contains an empty leaf");
  return node.keys[0];
}

/**
 * In-memory B+ tree ordered index.
 *
 * All records live in linked leaves. Internal keys are separators equal to
 * the first key in the child immediately to their right. Insertions split
 * overflowing leaves and internal nodes; range() walks the leaf chain.
 */
class BPlusTree {
  constructor({ maxKeys = 4, compare = defaultCompare } = {}) {
    if (!Number.isInteger(maxKeys) || maxKeys < 3) {
      throw new RangeError("maxKeys must be an integer of at least 3");
    }
    if (typeof compare !== "function") throw new TypeError("compare must be a function");

    this.maxKeys = maxKeys;
    this.compare = compare;
    this.root = this._makeLeaf();
    this.size = 0;
  }

  _makeLeaf() {
    return { leaf: true, keys: [], values: [], next: null };
  }

  _makeInternal(children) {
    const node = { leaf: false, keys: [], children };
    this._refresh(node);
    return node;
  }

  _refresh(node) {
    if (!node.leaf) {
      node.keys = node.children.slice(1).map(firstKey);
    }
  }

  _findLeaf(key) {
    let node = this.root;
    while (!node.leaf) {
      node = node.children[upperBound(node.keys, key, this.compare)];
    }
    return node;
  }

  _insert(node, key, value) {
    if (node.leaf) {
      const index = lowerBound(node.keys, key, this.compare);

      if (index < node.keys.length && this.compare(node.keys[index], key) === 0) {
        node.values[index] = value;
        return { added: false, right: null };
      }

      node.keys.splice(index, 0, key);
      node.values.splice(index, 0, value);

      if (node.keys.length <= this.maxKeys) {
        return { added: true, right: null };
      }

      const middle = Math.ceil(node.keys.length / 2);
      const right = this._makeLeaf();
      right.keys = node.keys.splice(middle);
      right.values = node.values.splice(middle);
      right.next = node.next;
      node.next = right;
      return { added: true, right };
    }

    const childIndex = upperBound(node.keys, key, this.compare);
    const result = this._insert(node.children[childIndex], key, value);

    if (result.right) {
      node.children.splice(childIndex + 1, 0, result.right);
    }
    this._refresh(node);

    if (node.keys.length <= this.maxKeys) {
      return { added: result.added, right: null };
    }

    const middle = Math.ceil(node.children.length / 2);
    const right = this._makeInternal(node.children.splice(middle));
    this._refresh(node);
    return { added: result.added, right };
  }

  insert(key, value) {
    // Validate the key before mutating any node.
    if (this.compare(key, key) !== 0) throw new TypeError("compare(key, key) must be zero");

    const result = this._insert(this.root, key, value);
    if (result.right) {
      this.root = this._makeInternal([this.root, result.right]);
    }
    if (result.added) this.size += 1;
    return result.added;
  }

  get(key) {
    const leaf = this._findLeaf(key);
    const index = lowerBound(leaf.keys, key, this.compare);
    return index < leaf.keys.length && this.compare(leaf.keys[index], key) === 0
      ? leaf.values[index]
      : undefined;
  }

  has(key) {
    const leaf = this._findLeaf(key);
    const index = lowerBound(leaf.keys, key, this.compare);
    return index < leaf.keys.length && this.compare(leaf.keys[index], key) === 0;
  }

  /**
   * Return sorted { key, value } records. Bounds are inclusive by default.
   * Set includeFrom/includeTo to false for exclusive bounds.
   */
  range({
    from,
    to,
    includeFrom = true,
    includeTo = true,
    limit = Infinity
  } = {}) {
    if (!(limit === Infinity || (Number.isInteger(limit) && limit >= 0))) {
      throw new RangeError("limit must be a non-negative integer or Infinity");
    }
    if (limit === 0) return [];
    if (from !== undefined && to !== undefined && this.compare(from, to) > 0) {
      return [];
    }

    let leaf = from === undefined ? this._leftmostLeaf() : this._findLeaf(from);
    let index = from === undefined ? 0 : lowerBound(leaf.keys, from, this.compare);

    if (
      from !== undefined &&
      !includeFrom &&
      index < leaf.keys.length &&
      this.compare(leaf.keys[index], from) === 0
    ) {
      index += 1;
    }

    const result = [];
    while (leaf) {
      for (; index < leaf.keys.length; index += 1) {
        const key = leaf.keys[index];

        if (to !== undefined) {
          const order = this.compare(key, to);
          if (order > 0 || (order === 0 && !includeTo)) return result;
        }

        result.push({ key, value: leaf.values[index] });
        if (result.length === limit) return result;
      }
      leaf = leaf.next;
      index = 0;
    }

    return result;
  }

  _leftmostLeaf() {
    let node = this.root;
    while (!node.leaf) node = node.children[0];
    return node;
  }

  /** Throw on a broken separator, ordering invariant, leaf chain, or size. */
  validate() {
    const leaves = [];
    let leafDepth = null;
    let counted = 0;

    const visit = (node, depth, isRoot) => {
      if (node.leaf) {
        if (node.keys.length !== node.values.length) {
          throw new Error("leaf key/value lengths differ");
        }
        for (let i = 1; i < node.keys.length; i += 1) {
          if (this.compare(node.keys[i - 1], node.keys[i]) >= 0) {
            throw new Error("leaf keys are not strictly increasing");
          }
        }
        if (!isRoot && node.keys.length === 0) throw new Error("empty non-root leaf");
        if (leafDepth === null) leafDepth = depth;
        if (leafDepth !== depth) throw new Error("leaves have different depths");
        counted += node.keys.length;
        leaves.push(node);
        return;
      }

      if (node.children.length !== node.keys.length + 1 || node.children.length < 2) {
        throw new Error("invalid internal node arity");
      }
      for (let i = 1; i < node.keys.length; i += 1) {
        if (this.compare(node.keys[i - 1], node.keys[i]) >= 0) {
          throw new Error("internal separators are not strictly increasing");
        }
      }
      for (let i = 0; i < node.keys.length; i += 1) {
        if (this.compare(node.keys[i], firstKey(node.children[i + 1])) !== 0) {
          throw new Error("separator does not match right-child minimum");
        }
      }
      for (const child of node.children) visit(child, depth + 1, false);
    };

    visit(this.root, 0, true);

    for (let i = 0; i < leaves.length; i += 1) {
      if (leaves[i].next !== (leaves[i + 1] ?? null)) {
        throw new Error("leaf sibling chain is inconsistent");
      }
    }
    if (counted !== this.size) throw new Error("stored size is inconsistent");
    return true;
  }
}

// Force several leaf and internal splits, then verify search and range scans.
const tree = new BPlusTree({ maxKeys: 3 });
const keys = [20, 5, 15, 25, 10, 30, 35, 0, 17, 8, 12, 40, 2, 6, 22, 27];
for (const key of keys) assert.equal(tree.insert(key, "v" + key), true);
assert.equal(tree.size, keys.length);
assert.equal(tree.validate(), true);
assert.equal(tree.get(17), "v17");
assert.equal(tree.has(99), false);
assert.equal(tree.get(99), undefined);
assert.equal(tree.insert(15, "updated"), false);
assert.equal(tree.get(15), "updated");
assert.equal(tree.size, keys.length);

assert.deepEqual(
  tree.range({ from: 8, to: 25 }).map((entry) => entry.key),
  [8, 10, 12, 15, 17, 20, 22, 25]
);
assert.deepEqual(
  tree.range({ from: 8, to: 25, includeFrom: false, includeTo: false, limit: 3 })
    .map((entry) => entry.key),
  [10, 12, 15]
);
assert.deepEqual(tree.range({ from: 50 }), []);
assert.deepEqual(tree.range({ from: 25, to: 8 }), []);
assert.equal(tree.validate(), true);

module.exports = { BPlusTree };
