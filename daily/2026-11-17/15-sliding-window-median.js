/**
 * EXERCISE: Sliding-Window Median with Lazy Deletion
 *
 * Maintain the median of a changing multiset using a max-heap for the lower
 * half and a min-heap for the upper half. Unique entry ids make duplicate
 * values removable. Stale heap entries are pruned lazily and periodically
 * compacted so long-running streams do not accumulate unbounded garbage.
 *
 * add/remove: O(log n) amortized; median: O(1) after pruning.
 */

"use strict";

class BinaryHeap {
  constructor(compare) {
    this.items = [];
    this.compare = compare;
  }

  get size() {
    return this.items.length;
  }

  peek() {
    return this.items[0];
  }

  push(value) {
    const items = this.items;
    items.push(value);
    let index = items.length - 1;

    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(items[index], items[parent]) >= 0) break;
      [items[index], items[parent]] = [items[parent], items[index]];
      index = parent;
    }
  }

  pop() {
    const items = this.items;
    if (items.length === 0) return undefined;
    const root = items[0];
    const last = items.pop();

    if (items.length > 0) {
      items[0] = last;
      let index = 0;

      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let best = index;

        if (left < items.length && this.compare(items[left], items[best]) < 0) {
          best = left;
        }
        if (right < items.length && this.compare(items[right], items[best]) < 0) {
          best = right;
        }
        if (best === index) break;
        [items[index], items[best]] = [items[best], items[index]];
        index = best;
      }
    }

    return root;
  }

  clear() {
    this.items.length = 0;
  }
}

class SlidingMedian {
  constructor() {
    this.lower = new BinaryHeap((a, b) => b.value - a.value || b.id - a.id);
    this.upper = new BinaryHeap((a, b) => a.value - b.value || a.id - b.id);
    this.active = new Map();
    this.side = new Map();
    this.lowerSize = 0;
    this.upperSize = 0;
    this.nextId = 1;
  }

  get size() {
    return this.active.size;
  }

  _prune(heap) {
    while (heap.size > 0 && !this.active.has(heap.peek().id)) heap.pop();
  }

  _rebalance() {
    this._prune(this.lower);
    this._prune(this.upper);

    while (this.lowerSize > this.upperSize + 1) {
      const entry = this.lower.pop();
      this.upper.push(entry);
      this.side.set(entry.id, "upper");
      this.lowerSize--;
      this.upperSize++;
      this._prune(this.lower);
    }

    while (this.lowerSize < this.upperSize) {
      const entry = this.upper.pop();
      this.lower.push(entry);
      this.side.set(entry.id, "lower");
      this.upperSize--;
      this.lowerSize++;
      this._prune(this.upper);
    }

    this._prune(this.lower);
    this._prune(this.upper);
  }

  _compactIfNeeded() {
    const physical = this.lower.size + this.upper.size;
    if (physical <= this.active.size * 3 + 64) return;

    const entries = Array.from(this.active, ([id, value]) => ({ id, value }))
      .sort((a, b) => a.value - b.value || a.id - b.id);

    this.lower.clear();
    this.upper.clear();
    this.side.clear();

    this.lowerSize = Math.ceil(entries.length / 2);
    this.upperSize = entries.length - this.lowerSize;

    entries.forEach((entry, index) => {
      if (index < this.lowerSize) {
        this.lower.push(entry);
        this.side.set(entry.id, "lower");
      } else {
        this.upper.push(entry);
        this.side.set(entry.id, "upper");
      }
    });
  }

  add(value) {
    if (!Number.isFinite(value)) throw new TypeError("Only finite numbers are supported");

    const id = this.nextId++;
    const entry = { id, value };
    this.active.set(id, value);
    this._prune(this.lower);

    if (this.lowerSize === 0 || value <= this.lower.peek().value) {
      this.lower.push(entry);
      this.side.set(id, "lower");
      this.lowerSize++;
    } else {
      this.upper.push(entry);
      this.side.set(id, "upper");
      this.upperSize++;
    }

    this._rebalance();
    this._compactIfNeeded();
    return id;
  }

  remove(id) {
    if (!this.active.has(id)) return false;

    this.active.delete(id);
    const side = this.side.get(id);
    this.side.delete(id);

    if (side === "lower") this.lowerSize--;
    else if (side === "upper") this.upperSize--;
    else throw new Error("Active entry has no heap assignment");

    this._rebalance();
    this._compactIfNeeded();
    return true;
  }

  median() {
    if (this.active.size === 0) return null;
    this._rebalance();

    if (this.lowerSize > this.upperSize) return this.lower.peek().value;
    const a = this.lower.peek().value;
    const b = this.upper.peek().value;
    return a / 2 + b / 2;
  }

  debugStats() {
    return {
      active: this.active.size,
      lowerLogical: this.lowerSize,
      upperLogical: this.upperSize,
      lowerPhysical: this.lower.size,
      upperPhysical: this.upper.size
    };
  }
}

class SlidingWindowMedian {
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError("capacity must be a positive integer");
    }
    this.capacity = capacity;
    this.medianIndex = new SlidingMedian();
    this.ids = [];
  }

  push(value) {
    const id = this.medianIndex.add(value);
    this.ids.push(id);
    if (this.ids.length > this.capacity) {
      this.medianIndex.remove(this.ids.shift());
    }
    return this.medianIndex.median();
  }

  get size() {
    return this.ids.length;
  }

  currentMedian() {
    return this.medianIndex.median();
  }
}

function referenceMedian(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : sorted[middle - 1] / 2 + sorted[middle] / 2;
}

function runTests() {
  const assert = require("node:assert/strict");
  const index = new SlidingMedian();

  const a = index.add(5);
  const b = index.add(1);
  index.add(9);
  index.add(2);
  assert.equal(index.median(), 3.5);
  assert.equal(index.remove(b), true);
  assert.equal(index.median(), 5);
  assert.equal(index.remove(b), false);
  assert.equal(index.remove(a), true);
  assert.equal(index.median(), 5.5);
  assert.throws(() => index.add(Infinity), TypeError);

  const duplicates = new SlidingMedian();
  const ids = [duplicates.add(7), duplicates.add(7), duplicates.add(7)];
  assert.equal(duplicates.median(), 7);
  duplicates.remove(ids[1]);
  assert.equal(duplicates.median(), 7);
  duplicates.remove(ids[0]);
  assert.equal(duplicates.median(), 7);

  let seed = 0x31415926;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  const randomIndex = new SlidingMedian();
  const live = new Map();
  for (let step = 0; step < 1200; step++) {
    if (live.size === 0 || random() < 0.68) {
      const value = Math.floor(random() * 31) - 15;
      const id = randomIndex.add(value);
      live.set(id, value);
    } else {
      const keys = Array.from(live.keys());
      const id = keys[Math.floor(random() * keys.length)];
      assert.equal(randomIndex.remove(id), true);
      live.delete(id);
    }

    assert.equal(randomIndex.size, live.size);
    assert.equal(randomIndex.median(), referenceMedian(Array.from(live.values())));
    const stats = randomIndex.debugStats();
    assert.equal(stats.lowerLogical + stats.upperLogical, stats.active);
    assert.ok(stats.lowerLogical === stats.upperLogical ||
      stats.lowerLogical === stats.upperLogical + 1);
  }

  const window = new SlidingWindowMedian(5);
  const values = [];
  for (let i = 0; i < 100; i++) {
    const value = Math.floor(random() * 50);
    values.push(value);
    if (values.length > 5) values.shift();
    assert.equal(window.push(value), referenceMedian(values));
  }

  const compacting = new SlidingMedian();
  const removable = [];
  for (let i = 0; i < 500; i++) removable.push(compacting.add(i % 13));
  for (const id of removable) compacting.remove(id);
  assert.equal(compacting.median(), null);
  assert.equal(compacting.size, 0);

  console.log("Sliding-window median tests passed");
}

if (require.main === module) runTests();

module.exports = { SlidingMedian, SlidingWindowMedian };
