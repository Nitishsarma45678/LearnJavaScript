/**
 * Indexed Skip List (ordered map with rank/select)
 * ------------------------------------------------
 * Exercise: implement a probabilistic ordered map whose forward links carry
 * spans. Spans support O(log n) rank(key) and select(index) in addition to
 * expected O(log n) search, insertion, and deletion.
 *
 * Keys must have a total order. Supply compare(a, b) for custom key types.
 *
 * Run: node indexed-skip-list.js
 */

'use strict';

const assert = require('node:assert/strict');

function defaultCompare(a, b) {
  if (a === b) return 0;
  if (a < b) return -1;
  if (a > b) return 1;
  throw new TypeError('keys are not mutually comparable; provide a total-order comparator');
}

class SkipNode {
  constructor(key, value, level) {
    this.key = key;
    this.value = value;
    this.forward = Array(level).fill(null);
    this.span = Array(level).fill(0);
  }
}

class IndexedSkipList {
  constructor({
    maxLevel = 20,
    probability = 0.25,
    seed = 0x6d2b79f5,
    compare = defaultCompare
  } = {}) {
    if (!Number.isInteger(maxLevel) || maxLevel < 1 || maxLevel > 64) {
      throw new RangeError('maxLevel must be an integer from 1 to 64');
    }
    if (!(probability > 0 && probability < 1)) {
      throw new RangeError('probability must be between 0 and 1');
    }
    if (typeof compare !== 'function') throw new TypeError('compare must be a function');

    this.maxLevel = maxLevel;
    this.probability = probability;
    this.compare = compare;
    this.randomState = (seed >>> 0) || 0x9e3779b9;
    this.level = 1;
    this.size = 0;
    this.head = new SkipNode(undefined, undefined, maxLevel);
  }

  random() {
    let x = this.randomState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.randomState = x >>> 0;
    return this.randomState / 0x100000000;
  }

  randomLevel() {
    let level = 1;
    while (level < this.maxLevel && this.random() < this.probability) {
      level++;
    }
    return level;
  }

  findNode(key) {
    let current = this.head;
    for (let level = this.level - 1; level >= 0; level--) {
      while (current.forward[level] &&
             this.compare(current.forward[level].key, key) < 0) {
        current = current.forward[level];
      }
    }
    current = current.forward[0];
    return current && this.compare(current.key, key) === 0 ? current : null;
  }

  has(key) {
    return this.findNode(key) !== null;
  }

  get(key) {
    return this.findNode(key)?.value;
  }

  set(key, value) {
    const update = Array(this.maxLevel);
    const rank = Array(this.maxLevel).fill(0);
    let current = this.head;

    for (let level = this.level - 1; level >= 0; level--) {
      rank[level] = level === this.level - 1 ? 0 : rank[level + 1];
      while (current.forward[level] &&
             this.compare(current.forward[level].key, key) < 0) {
        rank[level] += current.span[level];
        current = current.forward[level];
      }
      update[level] = current;
    }

    current = current.forward[0];
    if (current && this.compare(current.key, key) === 0) {
      const previousValue = current.value;
      current.value = value;
      return { inserted: false, previousValue };
    }

    const nodeLevel = this.randomLevel();
    if (nodeLevel > this.level) {
      for (let level = this.level; level < nodeLevel; level++) {
        rank[level] = 0;
        update[level] = this.head;
        this.head.span[level] = this.size;
      }
      this.level = nodeLevel;
    }

    const node = new SkipNode(key, value, nodeLevel);
    for (let level = 0; level < nodeLevel; level++) {
      node.forward[level] = update[level].forward[level];
      update[level].forward[level] = node;
      node.span[level] = update[level].span[level] - (rank[0] - rank[level]);
      update[level].span[level] = (rank[0] - rank[level]) + 1;
    }
    for (let level = nodeLevel; level < this.level; level++) {
      update[level].span[level]++;
    }

    this.size++;
    return { inserted: true, previousValue: undefined };
  }

  delete(key) {
    const update = Array(this.maxLevel);
    let current = this.head;

    for (let level = this.level - 1; level >= 0; level--) {
      while (current.forward[level] &&
             this.compare(current.forward[level].key, key) < 0) {
        current = current.forward[level];
      }
      update[level] = current;
    }

    const target = current.forward[0];
    if (!target || this.compare(target.key, key) !== 0) return false;

    for (let level = 0; level < this.level; level++) {
      if (update[level].forward[level] === target) {
        update[level].span[level] += target.span[level] - 1;
        update[level].forward[level] = target.forward[level];
      } else {
        update[level].span[level]--;
      }
    }

    while (this.level > 1 && this.head.forward[this.level - 1] === null) {
      this.level--;
    }
    this.size--;
    return true;
  }

  // Number of keys strictly smaller than key.
  rank(key) {
    let current = this.head;
    let traversed = 0;
    for (let level = this.level - 1; level >= 0; level--) {
      while (current.forward[level] &&
             this.compare(current.forward[level].key, key) < 0) {
        traversed += current.span[level];
        current = current.forward[level];
      }
    }
    return traversed;
  }

  // Zero-based order statistic.
  select(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.size) {
      return undefined;
    }
    const targetRank = index + 1;
    let traversed = 0;
    let current = this.head;

    for (let level = this.level - 1; level >= 0; level--) {
      while (current.forward[level] &&
             traversed + current.span[level] <= targetRank) {
        traversed += current.span[level];
        current = current.forward[level];
      }
    }
    return traversed === targetRank
      ? { key: current.key, value: current.value }
      : undefined;
  }

  // Inclusive index range [start, end].
  range(start, end) {
    if (!Number.isInteger(start) || !Number.isInteger(end) ||
        start < 0 || end < start || start >= this.size) {
      return [];
    }
    const result = [];
    let node = this.select(start);
    let index = start;
    while (node && index <= end) {
      result.push(node);
      const found = this.findNode(node.key);
      node = found?.forward[0]
        ? { key: found.forward[0].key, value: found.forward[0].value }
        : undefined;
      index++;
    }
    return result;
  }

  *entries() {
    let current = this.head.forward[0];
    while (current) {
      yield [current.key, current.value];
      current = current.forward[0];
    }
  }

  keys() {
    return [...this.entries()].map(([key]) => key);
  }

  // Expensive diagnostic: verifies ordering, tower links, and every span.
  validate() {
    const nodes = [this.head];
    let current = this.head.forward[0];
    let previous;
    while (current) {
      if (previous !== undefined && this.compare(previous, current.key) >= 0) {
        throw new Error('level-zero keys are not strictly increasing');
      }
      nodes.push(current);
      previous = current.key;
      current = current.forward[0];
    }
    if (nodes.length - 1 !== this.size) throw new Error('size does not match level zero');

    const positions = new Map([[this.head, 0]]);
    for (let i = 1; i < nodes.length; i++) positions.set(nodes[i], i);

    for (const node of nodes) {
      const activeLevels = node === this.head ? this.level : node.forward.length;
      for (let level = 0; level < activeLevels; level++) {
        const next = node.forward[level];
        if (next && next.forward.length <= level) {
          throw new Error('forward link points to a node without that level');
        }
        const expected = next
          ? positions.get(next) - positions.get(node)
          : this.size - positions.get(node);
        if (node.span[level] !== expected) {
          throw new Error(`invalid span at level ${level}: expected ${expected}, got ${node.span[level]}`);
        }
      }
    }
    return true;
  }
}

function runTests() {
  const list = new IndexedSkipList({ seed: 12345, maxLevel: 16 });
  for (const key of [8, 3, 10, 1, 6, 14, 4, 7, 13]) {
    list.set(key, String(key * 10));
  }
  assert.deepEqual(list.keys(), [1, 3, 4, 6, 7, 8, 10, 13, 14]);
  assert.equal(list.rank(7), 4);
  assert.deepEqual(list.select(4), { key: 7, value: '70' });
  assert.deepEqual(list.range(2, 5).map(entry => entry.key), [4, 6, 7, 8]);
  assert.equal(list.get(10), '100');
  assert.equal(list.has(99), false);

  const update = list.set(7, 'updated');
  assert.equal(update.inserted, false);
  assert.equal(update.previousValue, '70');
  assert.equal(list.size, 9);
  assert.equal(list.get(7), 'updated');
  assert.equal(list.delete(6), true);
  assert.equal(list.delete(6), false);
  assert.equal(list.validate(), true);

  // Randomized differential test against a native Map + sorted keys.
  let seed = 0x12345678;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
  };
  const actual = new IndexedSkipList({ seed: 77, maxLevel: 18 });
  const reference = new Map();

  for (let step = 0; step < 1500; step++) {
    const key = random() % 120;
    if (random() & 1) {
      const value = `v${step}`;
      actual.set(key, value);
      reference.set(key, value);
    } else {
      assert.equal(actual.delete(key), reference.delete(key));
    }

    const sorted = [...reference.keys()].sort((a, b) => a - b);
    assert.equal(actual.size, sorted.length);
    assert.deepEqual(actual.keys(), sorted);
    for (let i = 0; i < sorted.length; i++) {
      assert.deepEqual(actual.select(i), {
        key: sorted[i],
        value: reference.get(sorted[i])
      });
    }
    for (let probe = 0; probe < 5; probe++) {
      const candidate = random() % 140;
      assert.equal(actual.rank(candidate), sorted.filter(k => k < candidate).length);
    }
    assert.equal(actual.validate(), true);
  }

  assert.equal(actual.select(-1), undefined);
  assert.equal(actual.select(actual.size), undefined);
  console.log('Indexed Skip List: all tests passed');
}

if (require.main === module) runTests();

module.exports = { IndexedSkipList };
