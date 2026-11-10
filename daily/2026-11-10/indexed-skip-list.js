/**
 * Indexed Skip List — an ordered map with order-statistic operations.
 *
 * Each forward pointer stores a span: the number of level-0 nodes crossed
 * by that pointer. This makes rank(key) and select(index) expected O(log n),
 * in addition to ordinary lookup, insertion and deletion.
 *
 * Run: node indexed-skip-list.js
 */

"use strict";

const assert = require("node:assert/strict");

function defaultCompare(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

class Node {
  constructor(key, value, level) {
    this.key = key;
    this.value = value;
    this.forward = Array(level).fill(null);
    this.span = Array(level).fill(0);
  }
}

class IndexedSkipList {
  constructor({ maxLevel = 20, probability = 0.5, random = Math.random, compare = defaultCompare } = {}) {
    if (!Number.isInteger(maxLevel) || maxLevel < 1) throw new RangeError("maxLevel must be positive");
    if (!(probability > 0 && probability < 1)) throw new RangeError("probability must be between 0 and 1");
    if (typeof random !== "function" || typeof compare !== "function") {
      throw new TypeError("random and compare must be functions");
    }
    this.maxLevel = maxLevel;
    this.probability = probability;
    this.random = random;
    this.compare = compare;
    this.header = new Node(undefined, undefined, maxLevel);
    this.level = 1;
    this.length = 0;
  }

  get size() {
    return this.length;
  }

  _randomLevel() {
    let level = 1;
    while (level < this.maxLevel && this.random() < this.probability) level++;
    return level;
  }

  _locate(key) {
    const update = Array(this.maxLevel);
    const ranks = Array(this.maxLevel).fill(0);
    let current = this.header;

    for (let i = this.level - 1; i >= 0; i--) {
      ranks[i] = i === this.level - 1 ? 0 : ranks[i + 1];
      while (current.forward[i] && this.compare(current.forward[i].key, key) < 0) {
        ranks[i] += current.span[i];
        current = current.forward[i];
      }
      update[i] = current;
    }
    return { update, ranks, candidate: current.forward[0] };
  }

  get(key) {
    const { candidate } = this._locate(key);
    return candidate && this.compare(candidate.key, key) === 0 ? candidate.value : undefined;
  }

  has(key) {
    const { candidate } = this._locate(key);
    return Boolean(candidate && this.compare(candidate.key, key) === 0);
  }

  set(key, value) {
    const { update, ranks, candidate } = this._locate(key);
    if (candidate && this.compare(candidate.key, key) === 0) {
      candidate.value = value;
      return false;
    }

    const nodeLevel = this._randomLevel();
    if (nodeLevel > this.level) {
      for (let i = this.level; i < nodeLevel; i++) {
        ranks[i] = 0;
        update[i] = this.header;
        this.header.span[i] = this.length;
      }
      this.level = nodeLevel;
    }

    const node = new Node(key, value, nodeLevel);
    for (let i = 0; i < nodeLevel; i++) {
      node.forward[i] = update[i].forward[i];
      update[i].forward[i] = node;
      node.span[i] = update[i].span[i] - (ranks[0] - ranks[i]);
      update[i].span[i] = ranks[0] - ranks[i] + 1;
    }
    for (let i = nodeLevel; i < this.level; i++) update[i].span[i]++;
    this.length++;
    return true;
  }

  delete(key) {
    const { update, candidate } = this._locate(key);
    if (!candidate || this.compare(candidate.key, key) !== 0) return false;

    for (let i = 0; i < this.level; i++) {
      if (update[i].forward[i] === candidate) {
        update[i].span[i] += candidate.span[i] - 1;
        update[i].forward[i] = candidate.forward[i];
      } else {
        update[i].span[i]--;
      }
    }

    while (this.level > 1 && !this.header.forward[this.level - 1]) this.level--;
    this.length--;
    return true;
  }

  // Returns the zero-based index, or -1 when the key is absent.
  rank(key) {
    let current = this.header;
    let traversed = 0;
    for (let i = this.level - 1; i >= 0; i--) {
      while (current.forward[i] && this.compare(current.forward[i].key, key) < 0) {
        traversed += current.span[i];
        current = current.forward[i];
      }
    }
    const candidate = current.forward[0];
    return candidate && this.compare(candidate.key, key) === 0 ? traversed : -1;
  }

  // Returns { key, value } at a zero-based index, or null out of bounds.
  select(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.length) return null;
    const target = index + 1;
    let traversed = 0;
    let current = this.header;
    for (let i = this.level - 1; i >= 0; i--) {
      while (current.forward[i] && traversed + current.span[i] <= target) {
        traversed += current.span[i];
        current = current.forward[i];
      }
    }
    return { key: current.key, value: current.value };
  }

  lowerBound(key) {
    let current = this.header;
    for (let i = this.level - 1; i >= 0; i--) {
      while (current.forward[i] && this.compare(current.forward[i].key, key) < 0) {
        current = current.forward[i];
      }
    }
    return current.forward[0] ? { key: current.forward[0].key, value: current.forward[0].value } : null;
  }

  range(minKey, maxKey) {
    if (this.compare(minKey, maxKey) > 0) return [];
    let current = this.header;
    for (let i = this.level - 1; i >= 0; i--) {
      while (current.forward[i] && this.compare(current.forward[i].key, minKey) < 0) {
        current = current.forward[i];
      }
    }
    current = current.forward[0];
    const result = [];
    while (current && this.compare(current.key, maxKey) <= 0) {
      result.push({ key: current.key, value: current.value });
      current = current.forward[0];
    }
    return result;
  }

  entries() {
    const result = [];
    let current = this.header.forward[0];
    while (current) {
      result.push([current.key, current.value]);
      current = current.forward[0];
    }
    return result;
  }
}

function runTests() {
  let seed = 0x1ced;
  const random = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const list = new IndexedSkipList({ maxLevel: 16, random });
  const reference = new Map();

  for (let step = 0; step < 1800; step++) {
    const key = Math.floor(random() * 180);
    if (random() < 0.62) {
      const value = "v" + step;
      const inserted = list.set(key, value);
      assert.equal(inserted, !reference.has(key));
      reference.set(key, value);
    } else {
      assert.equal(list.delete(key), reference.delete(key));
    }

    const sorted = [...reference.keys()].sort((a, b) => a - b);
    assert.equal(list.size, sorted.length);
    assert.deepEqual(list.entries(), sorted.map(k => [k, reference.get(k)]));
    for (let i = 0; i < sorted.length; i++) {
      assert.equal(list.rank(sorted[i]), i);
      assert.deepEqual(list.select(i), { key: sorted[i], value: reference.get(sorted[i]) });
    }
    assert.equal(list.select(-1), null);
    assert.equal(list.select(sorted.length), null);
    for (const probe of [0, 45, 90, 135, 179]) {
      assert.equal(list.has(probe), reference.has(probe));
      assert.equal(list.rank(probe), sorted.includes(probe) ? sorted.indexOf(probe) : -1);
    }
  }

  assert.deepEqual(list.range(30, 60),
    [...reference.entries()].filter(([key]) => key >= 30 && key <= 60)
      .sort((a, b) => a[0] - b[0]).map(([key, value]) => ({ key, value })));
  assert.equal(list.lowerBound(30)?.key ?? null,
    [...reference.keys()].filter(key => key >= 30).sort((a, b) => a - b)[0] ?? null);

  const strings = new IndexedSkipList({ compare: (a, b) => a.localeCompare(b), random: () => 0.9 });
  strings.set("pear", 3);
  strings.set("apple", 1);
  strings.set("orange", 2);
  assert.deepEqual(strings.entries(), [["apple", 1], ["orange", 2], ["pear", 3]]);
  assert.equal(strings.get("orange"), 2);
  assert.equal(strings.set("orange", 9), false);
  assert.equal(strings.get("orange"), 9);

  console.log("IndexedSkipList: all tests passed");
}

module.exports = { IndexedSkipList };

if (require.main === module) runTests();
