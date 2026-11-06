/**
 * Exercise: Streaming Heavy Hitters
 *
 * Combine a Count-Min Sketch (frequency estimates with sublinear memory) and
 * the Space-Saving algorithm (a bounded candidate set with error bounds).
 * Keys are normalized to strings. Counts are positive safe integers.
 *
 * Count-Min update/query: O(depth); Space-Saving update: O(capacity) here
 * because the minimum candidate is found by scanning the bounded Map.
 */

function hashString(value, seed) {
  let hash = (2166136261 ^ seed) >>> 0;
  for (const character of value) {
    const code = character.codePointAt(0);
    hash ^= code;
    hash = Math.imul(hash, 16777619) >>> 0;
    hash ^= code >>> 8;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b) >>> 0;
  hash ^= hash >>> 16;
  return hash >>> 0;
}

class CountMinSketch {
  constructor(width, depth) {
    if (!Number.isInteger(width) || width < 2 ||
        !Number.isInteger(depth) || depth < 1) {
      throw new RangeError("width must be >= 2 and depth must be >= 1");
    }
    this.width = width;
    this.depth = depth;
    this.seeds = Array.from({ length: depth }, (_, row) =>
      Math.imul(row + 1, 0x9e3779b1) >>> 0
    );
    this.rows = Array.from({ length: depth }, () => new Float64Array(width));
    this.totalCount = 0;
  }

  _key(item) {
    if (item === null || item === undefined) throw new TypeError("item cannot be null or undefined");
    return String(item);
  }

  _column(key, row) {
    return hashString(key, this.seeds[row]) % this.width;
  }

  add(item, count = 1) {
    if (!Number.isSafeInteger(count) || count <= 0) {
      throw new RangeError("count must be a positive safe integer");
    }
    if (!Number.isSafeInteger(this.totalCount + count)) {
      throw new RangeError("total count would exceed safe integer precision");
    }
    const key = this._key(item);
    for (let row = 0; row < this.depth; row++) {
      const column = this._column(key, row);
      this.rows[row][column] += count;
    }
    this.totalCount += count;
    return this;
  }

  estimate(item) {
    const key = this._key(item);
    let estimate = Infinity;
    for (let row = 0; row < this.depth; row++) {
      estimate = Math.min(estimate, this.rows[row][this._column(key, row)]);
    }
    return estimate;
  }

  merge(other) {
    if (!(other instanceof CountMinSketch) ||
        other.width !== this.width || other.depth !== this.depth ||
        other.seeds.some((seed, i) => seed !== this.seeds[i])) {
      throw new TypeError("sketches must have identical dimensions and hash seeds");
    }
    if (!Number.isSafeInteger(this.totalCount + other.totalCount)) {
      throw new RangeError("merged total would exceed safe integer precision");
    }
    for (let row = 0; row < this.depth; row++) {
      for (let column = 0; column < this.width; column++) {
        this.rows[row][column] += other.rows[row][column];
      }
    }
    this.totalCount += other.totalCount;
    return this;
  }
}

class StreamingHeavyHitters {
  constructor(capacity, width = 512, depth = 5) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError("capacity must be a positive integer");
    }
    this.capacity = capacity;
    this.sketch = new CountMinSketch(width, depth);
    this.candidates = new Map();
  }

  add(item, count = 1) {
    if (!Number.isSafeInteger(count) || count <= 0) {
      throw new RangeError("count must be a positive safe integer");
    }
    const key = String(item);
    if (item === null || item === undefined) throw new TypeError("item cannot be null or undefined");
    this.sketch.add(key, count);

    const existing = this.candidates.get(key);
    if (existing) {
      existing.count += count;
      return this;
    }
    if (this.candidates.size < this.capacity) {
      this.candidates.set(key, { count, error: 0 });
      return this;
    }

    let minimumKey;
    let minimumCount = Infinity;
    for (const [candidate, data] of this.candidates) {
      if (data.count < minimumCount) {
        minimumCount = data.count;
        minimumKey = candidate;
      }
    }
    this.candidates.delete(minimumKey);
    this.candidates.set(key, {
      count: minimumCount + count,
      error: minimumCount
    });
    return this;
  }

  topK(k = this.capacity) {
    if (!Number.isInteger(k) || k < 0) throw new RangeError("k must be non-negative");
    return [...this.candidates.entries()]
      .map(([item, data]) => ({
        item,
        spaceSavingCount: data.count,
        error: data.error,
        lowerBound: data.count - data.error,
        countMinEstimate: this.sketch.estimate(item)
      }))
      .sort((a, b) =>
        b.spaceSavingCount - a.spaceSavingCount || a.item.localeCompare(b.item)
      )
      .slice(0, k);
  }

  estimate(item) {
    return this.sketch.estimate(item);
  }
}

// ------------------------------ Tests -------------------------------------

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(label + ": expected " + expected + ", got " + actual);
  }
}
function assertThrows(fn, pattern) {
  let error;
  try { fn(); } catch (caught) { error = caught; }
  if (!error || (pattern && !pattern.test(error.message))) throw new Error("expected throw " + pattern);
}

const sketch = new CountMinSketch(128, 5);
sketch.add("apple", 4).add("banana", 3).add("apple", 2);
assertEqual(sketch.estimate("apple"), 6, "apple frequency");
assertEqual(sketch.estimate("banana"), 3, "banana frequency");
assertEqual(sketch.totalCount, 9, "total stream count");

const left = new CountMinSketch(64, 4).add("x", 2).add("left", 1);
const right = new CountMinSketch(64, 4).add("x", 3).add("right", 4);
left.merge(right);
assertEqual(left.estimate("x"), 5, "merged frequency");
assertEqual(left.totalCount, 10, "merged total");
assertThrows(() => left.merge(new CountMinSketch(32, 4)), /identical/);

const heavy = new StreamingHeavyHitters(3, 256, 5);
heavy.add("apple", 4).add("banana", 5).add("pear", 1).add("mango", 2);
const top = heavy.topK(2);
assertEqual(top[0].item, "banana", "most frequent candidate");
assertEqual(top[1].item, "apple", "second candidate");
assertEqual(heavy.estimate("banana"), 5, "candidate estimate");
assertEqual(heavy.topK(0).length, 0, "zero top-k");
assertThrows(() => heavy.add("bad", 0), /positive/);

if (typeof module !== "undefined") module.exports = {
  CountMinSketch,
  StreamingHeavyHitters
};
