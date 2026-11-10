/*
 * Adaptive Replacement Cache (ARC)
 * ---------------------------------
 * Implements the four-list ARC policy:
 *   T1: recently seen resident keys
 *   T2: frequently seen resident keys
 *   B1: ghost keys evicted from T1
 *   B2: ghost keys evicted from T2
 *
 * The target p adapts the balance between recency and frequency using ghost
 * hits. Map insertion order supplies O(1) LRU operations. Values are stored
 * only in T1/T2; B1/B2 retain keys, not values.
 */

"use strict";

const assert = require("node:assert/strict");

function oldestEntry(map) {
  const iterator = map.keys().next();
  return iterator.done ? { found: false } : { found: true, key: iterator.value };
}

function touch(map, key, value) {
  map.delete(key);
  map.set(key, value);
}

class AdaptiveReplacementCache {
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError("capacity must be a positive integer");
    }

    this.capacity = capacity;
    this.p = 0;
    this.t1 = new Map();
    this.t2 = new Map();
    this.b1 = new Map();
    this.b2 = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  get size() {
    return this.t1.size + this.t2.size;
  }

  has(key) {
    return this.t1.has(key) || this.t2.has(key);
  }

  _moveOldest(source, destination) {
    const entry = oldestEntry(source);
    if (!entry.found) return false;

    const value = source.get(entry.key);
    source.delete(entry.key);
    destination.set(entry.key, value);
    return true;
  }

  _replace(incomingKey) {
    const preferT1 =
      this.t1.size > 0 &&
      (
        this.t1.size > this.p ||
        (this.b2.has(incomingKey) && this.t1.size === this.p)
      );

    if (preferT1 || this.t2.size === 0) {
      this._moveOldest(this.t1, this.b1);
    } else {
      this._moveOldest(this.t2, this.b2);
    }
  }

  get(key) {
    if (this.t1.has(key)) {
      const value = this.t1.get(key);
      this.t1.delete(key);
      this.t2.set(key, value);
      this.hits += 1;
      return value;
    }

    if (this.t2.has(key)) {
      const value = this.t2.get(key);
      touch(this.t2, key, value);
      this.hits += 1;
      return value;
    }

    this.misses += 1;
    return undefined;
  }

  peek(key) {
    if (this.t1.has(key)) return this.t1.get(key);
    if (this.t2.has(key)) return this.t2.get(key);
    return undefined;
  }

  set(key, value) {
    if (this.t1.has(key)) {
      this.t1.delete(key);
      this.t2.set(key, value);
      return this;
    }

    if (this.t2.has(key)) {
      touch(this.t2, key, value);
      return this;
    }

    if (this.b1.has(key)) {
      const delta = Math.max(1, this.b2.size / this.b1.size);
      this.p = Math.min(this.capacity, this.p + delta);
      this.b1.delete(key);
      this._replace(key);
      this.t2.set(key, value);
      return this;
    }

    if (this.b2.has(key)) {
      const delta = Math.max(1, this.b1.size / this.b2.size);
      this.p = Math.max(0, this.p - delta);
      this.b2.delete(key);
      this._replace(key);
      this.t2.set(key, value);
      return this;
    }

    const c = this.capacity;

    if (this.t1.size + this.b1.size === c) {
      if (this.t1.size < c) {
        const oldestGhost = oldestEntry(this.b1);
        if (oldestGhost.found) this.b1.delete(oldestGhost.key);
        this._replace(key);
      } else {
        const oldestRecent = oldestEntry(this.t1);
        if (oldestRecent.found) this.t1.delete(oldestRecent.key);
      }
    } else if (this.t1.size + this.t2.size + this.b1.size + this.b2.size >= c) {
      const total = this.t1.size + this.t2.size + this.b1.size + this.b2.size;
      if (total === 2 * c) {
        const oldestGhost = oldestEntry(this.b2);
        if (oldestGhost.found) this.b2.delete(oldestGhost.key);
      }
      this._replace(key);
    }

    this.t1.set(key, value);
    return this;
  }

  delete(key) {
    const resident = this.t1.delete(key) || this.t2.delete(key);
    this.b1.delete(key);
    this.b2.delete(key);
    return resident;
  }

  clear() {
    this.t1.clear();
    this.t2.clear();
    this.b1.clear();
    this.b2.clear();
    this.p = 0;
    this.hits = 0;
    this.misses = 0;
  }

  inspect() {
    return {
      p: this.p,
      T1: Array.from(this.t1.keys()),
      T2: Array.from(this.t2.keys()),
      B1: Array.from(this.b1.keys()),
      B2: Array.from(this.b2.keys()),
      hits: this.hits,
      misses: this.misses
    };
  }

  validate() {
    const resident = this.t1.size + this.t2.size;
    const ghosts = this.b1.size + this.b2.size;
    const total = resident + ghosts;

    if (resident > this.capacity) {
      throw new Error("Resident capacity invariant violated");
    }
    if (ghosts > this.capacity) {
      throw new Error("Ghost capacity invariant violated");
    }
    if (total > 2 * this.capacity) {
      throw new Error("Combined ARC directory bound violated");
    }
    if (this.p < 0 || this.p > this.capacity) {
      throw new Error("Adaptive target p is outside its valid range");
    }

    const groups = [this.t1, this.t2, this.b1, this.b2];
    for (let i = 0; i < groups.length; i += 1) {
      for (let j = i + 1; j < groups.length; j += 1) {
        for (const key of groups[i].keys()) {
          if (groups[j].has(key)) {
            throw new Error("A key appears in more than one ARC list");
          }
        }
      }
    }
    return true;
  }
}

function runTests() {
  const cache = new AdaptiveReplacementCache(2);
  cache.set("A", 1).set("B", 2);
  assert.equal(cache.get("A"), 1);
  cache.set("C", 3);

  assert.equal(cache.has("B"), false);
  assert.equal(cache.peek("A"), 1);
  assert.equal(cache.get("C"), 3);

  // B was remembered in B1. Its return increases the recency target.
  cache.set("B", 20);
  assert.ok(cache.p > 0);
  assert.equal(cache.get("B"), 20);
  assert.equal(cache.validate(), true);

  const objectKey = {};
  cache.set(objectKey, "identity");
  assert.equal(cache.get(objectKey), "identity");
  assert.equal(cache.delete(objectKey), true);
  assert.equal(cache.delete(objectKey), false);

  // Exercise both ghost lists and repeated adaptation under a scan workload.
  const adaptive = new AdaptiveReplacementCache(4);
  for (let i = 0; i < 4; i += 1) adaptive.set("hot-" + i, i);
  for (let round = 0; round < 5; round += 1) {
    adaptive.get("hot-0");
    adaptive.get("hot-1");
  }
  for (let i = 0; i < 20; i += 1) {
    adaptive.set("scan-" + i, i);
    adaptive.validate();
  }
  assert.ok(adaptive.size <= 4);
  assert.ok(adaptive.inspect().B1.length + adaptive.inspect().B2.length <= 4);

  let seed = 0xarc2026;
  const random = max => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed % max;
  };
  const fuzz = new AdaptiveReplacementCache(7);

  for (let step = 0; step < 2500; step += 1) {
    const key = "k" + random(30);
    const action = random(3);
    if (action === 0) fuzz.set(key, step);
    else if (action === 1) fuzz.get(key);
    else fuzz.delete(key);

    assert.equal(fuzz.validate(), true);
    assert.ok(fuzz.size <= 7);
  }

  fuzz.clear();
  assert.equal(fuzz.size, 0);
  assert.equal(fuzz.p, 0);
  assert.equal(fuzz.validate(), true);

  console.log("AdaptiveReplacementCache: all tests passed");
}

module.exports = { AdaptiveReplacementCache };

if (require.main === module) {
  runTests();
}