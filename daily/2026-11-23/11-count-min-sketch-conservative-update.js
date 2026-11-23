// Exercise: Implement a Count-Min Sketch for approximate stream frequencies.
// Use independent seeded hashes, conservative updates, estimates and compatible
// sketch merging. Explain that estimates are upper bounds with probabilistic error.
//
// Run: node 11-count-min-sketch-conservative-update.js
const assert = require("node:assert/strict");

function hashString(value, seed) {
  const text = String(value);
  let hash = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  return hash >>> 0;
}

class CountMinSketch {
  constructor(width, depth, seeds) {
    if (!Number.isInteger(width) || width < 1 ||
        !Number.isInteger(depth) || depth < 1) {
      throw new RangeError("width and depth must be positive integers");
    }
    this.width = width;
    this.depth = depth;
    this.seeds = seeds ? seeds.slice() :
      Array.from({ length: depth }, (_, i) => Math.imul(i + 1, 0x9e3779b9) >>> 0);
    if (this.seeds.length !== depth) throw new RangeError("one seed is required per row");
    this.table = Array.from({ length: depth }, () => new Float64Array(width));
    this.total = 0;
  }

  indexes(item) {
    return this.seeds.map((seed) => hashString(item, seed) % this.width);
  }

  estimate(item) {
    const indexes = this.indexes(item);
    let estimate = Infinity;
    for (let row = 0; row < this.depth; row += 1) {
      estimate = Math.min(estimate, this.table[row][indexes[row]]);
    }
    return estimate;
  }

  update(item, count = 1) {
    if (!Number.isFinite(count) || count < 0) {
      throw new RangeError("count must be a non-negative finite number");
    }
    if (count === 0) return this.estimate(item);
    const indexes = this.indexes(item);
    let minimum = Infinity;
    for (let row = 0; row < this.depth; row += 1) {
      minimum = Math.min(minimum, this.table[row][indexes[row]]);
    }

    // Conservative update: only counters currently below the new estimate rise.
    const target = minimum + count;
    for (let row = 0; row < this.depth; row += 1) {
      const column = indexes[row];
      if (this.table[row][column] < target) this.table[row][column] = target;
    }
    this.total += count;
    return this.estimate(item);
  }

  merge(other) {
    if (!(other instanceof CountMinSketch) ||
        other.width !== this.width || other.depth !== this.depth ||
        this.seeds.some((seed, i) => seed !== other.seeds[i])) {
      throw new TypeError("sketches must have identical dimensions and seeds");
    }
    const merged = new CountMinSketch(this.width, this.depth, this.seeds);
    for (let row = 0; row < this.depth; row += 1) {
      for (let column = 0; column < this.width; column += 1) {
        merged.table[row][column] = this.table[row][column] + other.table[row][column];
      }
    }
    merged.total = this.total + other.total;
    return merged;
  }
}

// Example tests
{
  const seeds = [11, 23, 47, 89];
  const left = new CountMinSketch(256, 4, seeds);
  const right = new CountMinSketch(256, 4, seeds);
  for (let i = 0; i < 30; i += 1) left.update("apple");
  for (let i = 0; i < 12; i += 1) left.update("pear");
  for (let i = 0; i < 20; i += 1) right.update("apple");
  for (let i = 0; i < 7; i += 1) right.update("plum");

  assert.ok(left.estimate("apple") >= 30);
  assert.ok(left.estimate("pear") >= 12);
  assert.equal(left.total, 42);

  const merged = left.merge(right);
  assert.ok(merged.estimate("apple") >= 50);
  assert.ok(merged.estimate("pear") >= 12);
  assert.equal(merged.total, 69);
  assert.throws(() => left.merge(new CountMinSketch(10, 4, seeds)), /identical/);
  assert.throws(() => left.update("x", -1), /non-negative/);
}
console.log("Count-Min Sketch tests passed");
