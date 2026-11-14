/**
 * Count-Min Sketch + Misra-Gries heavy-hitter detector
 * -----------------------------------------------------
 * Exercise: maintain approximate item frequencies in bounded memory.
 *
 * Count-Min Sketch gives an upper-bound estimate (collisions can inflate it).
 * Misra-Gries retains candidates that may exceed a frequency threshold.
 * Combining them gives a compact streaming heavy-hitter query.
 *
 * Run: node count-min-sketch-heavy-hitters.js
 */

'use strict';

const assert = require('node:assert/strict');

function hashText(text, seed) {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function encodeItem(item) {
  if (typeof item === 'string') return `string:${item}`;
  if (typeof item === 'number') {
    if (Number.isNaN(item)) return 'number:NaN';
    if (Object.is(item, -0)) return 'number:-0';
  }
  if (typeof item === 'bigint') return `bigint:${item}`;
  if (typeof item === 'boolean') return `boolean:${item}`;
  if (item === null) return 'null:';
  if (item === undefined) return 'undefined:';
  throw new TypeError('items must be primitive strings, numbers, bigints, booleans, null, or undefined');
}

function positiveSafeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

class CountMinSketch {
  constructor({ width = 512, depth = 5, seed = 0x811c9dc5 } = {}) {
    if (!Number.isInteger(width) || width < 1 ||
        !Number.isInteger(depth) || depth < 1) {
      throw new RangeError('width and depth must be positive integers');
    }
    if (!Number.isInteger(seed)) throw new TypeError('seed must be an integer');

    this.width = width;
    this.depth = depth;
    this.seed = seed >>> 0;
    this.total = 0;
    this.tables = Array.from({ length: depth }, () => new Float64Array(width));
  }

  indexFor(encoded, row) {
    const rowSeed = (this.seed + Math.imul(row + 1, 0x9e3779b9)) >>> 0;
    return hashText(encoded, rowSeed) % this.width;
  }

  add(item, count = 1) {
    positiveSafeInteger(count, 'count');
    if (this.total > Number.MAX_SAFE_INTEGER - count) {
      throw new RangeError('total count would exceed Number.MAX_SAFE_INTEGER');
    }

    const encoded = encodeItem(item);
    const indexes = [];
    for (let row = 0; row < this.depth; row++) {
      const index = this.indexFor(encoded, row);
      if (this.tables[row][index] > Number.MAX_SAFE_INTEGER - count) {
        throw new RangeError('counter would exceed Number.MAX_SAFE_INTEGER');
      }
      indexes.push(index);
    }

    for (let row = 0; row < this.depth; row++) {
      this.tables[row][indexes[row]] += count;
    }
    this.total += count;
    return this;
  }

  estimate(item) {
    const encoded = encodeItem(item);
    let estimate = Number.POSITIVE_INFINITY;
    for (let row = 0; row < this.depth; row++) {
      const value = this.tables[row][this.indexFor(encoded, row)];
      if (value < estimate) estimate = value;
    }
    return estimate;
  }

  merge(other) {
    if (!(other instanceof CountMinSketch) ||
        this.width !== other.width ||
        this.depth !== other.depth ||
        this.seed !== other.seed) {
      throw new TypeError('sketches must have identical dimensions and seeds');
    }
    if (this.total > Number.MAX_SAFE_INTEGER - other.total) {
      throw new RangeError('merged total would exceed Number.MAX_SAFE_INTEGER');
    }

    for (let row = 0; row < this.depth; row++) {
      for (let col = 0; col < this.width; col++) {
        const sum = this.tables[row][col] + other.tables[row][col];
        if (!Number.isSafeInteger(sum)) {
          throw new RangeError('merged counter would exceed Number.MAX_SAFE_INTEGER');
        }
      }
    }
    for (let row = 0; row < this.depth; row++) {
      for (let col = 0; col < this.width; col++) {
        this.tables[row][col] += other.tables[row][col];
      }
    }
    this.total += other.total;
    return this;
  }

  toJSON() {
    return {
      version: 1,
      width: this.width,
      depth: this.depth,
      seed: this.seed,
      total: this.total,
      tables: this.tables.map(row => Array.from(row))
    };
  }

  static fromJSON(data) {
    if (!data || data.version !== 1 ||
        !Number.isInteger(data.width) || data.width < 1 ||
        !Number.isInteger(data.depth) || data.depth < 1 ||
        !Number.isInteger(data.seed) ||
        !Number.isSafeInteger(data.total) || data.total < 0 ||
        !Array.isArray(data.tables) || data.tables.length !== data.depth) {
      throw new TypeError('invalid Count-Min Sketch snapshot');
    }

    const sketch = new CountMinSketch({
      width: data.width,
      depth: data.depth,
      seed: data.seed
    });

    for (let row = 0; row < data.depth; row++) {
      const values = data.tables[row];
      if (!Array.isArray(values) || values.length !== data.width) {
        throw new TypeError('snapshot table has an invalid width');
      }
      for (let col = 0; col < data.width; col++) {
        if (!Number.isSafeInteger(values[col]) || values[col] < 0) {
          throw new TypeError('snapshot counters must be non-negative safe integers');
        }
        sketch.tables[row][col] = values[col];
      }
    }
    sketch.total = data.total;
    return sketch;
  }
}

class MisraGries {
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('capacity must be a positive integer');
    }
    this.capacity = capacity;
    this.counters = new Map();
  }

  observe(item, weight = 1) {
    positiveSafeInteger(weight, 'weight');
    const key = encodeItem(item);
    let remaining = weight;

    while (remaining > 0) {
      if (this.counters.has(key)) {
        const next = this.counters.get(key) + remaining;
        if (!Number.isSafeInteger(next)) throw new RangeError('candidate counter overflow');
        this.counters.set(key, next);
        break;
      }

      if (this.counters.size < this.capacity) {
        this.counters.set(key, remaining);
        break;
      }

      let minimum = Number.POSITIVE_INFINITY;
      for (const count of this.counters.values()) minimum = Math.min(minimum, count);
      const decrement = Math.min(remaining, minimum);
      for (const [candidate, count] of this.counters) {
        const next = count - decrement;
        if (next === 0) this.counters.delete(candidate);
        else this.counters.set(candidate, next);
      }
      remaining -= decrement;
    }
    return this;
  }

  candidates() {
    return [...this.counters.keys()].map(encoded => {
      const separator = encoded.indexOf(':');
      const type = encoded.slice(0, separator);
      const value = encoded.slice(separator + 1);
      let item;
      switch (type) {
        case 'string': item = value; break;
        case 'number': item = value === '-0' ? -0 : value === 'NaN' ? NaN : Number(value); break;
        case 'bigint': item = BigInt(value); break;
        case 'boolean': item = value === 'true'; break;
        case 'null': item = null; break;
        case 'undefined': item = undefined; break;
        default: throw new Error('unknown encoded candidate type');
      }
      return { item, residualCount: this.counters.get(encoded) };
    });
  }
}

class StreamingHeavyHitters {
  constructor({ width = 512, depth = 5, candidates = 32, seed = 0x811c9dc5 } = {}) {
    this.sketch = new CountMinSketch({ width, depth, seed });
    this.summary = new MisraGries(candidates);
  }

  add(item, count = 1) {
    this.sketch.add(item, count);
    this.summary.observe(item, count);
    return this;
  }

  query(minCount) {
    positiveSafeInteger(minCount, 'minCount');
    return this.summary.candidates()
      .map(({ item, residualCount }) => ({
        item,
        estimate: this.sketch.estimate(item),
        residualCount
      }))
      .filter(entry => entry.estimate >= minCount)
      .sort((a, b) => b.estimate - a.estimate);
  }
}

function runTests() {
  const sketch = new CountMinSketch({ width: 128, depth: 5, seed: 17 });
  sketch.add('apple', 5).add('banana', 3).add('pear', 2);
  assert.ok(sketch.estimate('apple') >= 5);
  assert.ok(sketch.estimate('banana') >= 3);
  assert.equal(sketch.total, 10);

  const left = new CountMinSketch({ width: 64, depth: 4, seed: 9 });
  const right = new CountMinSketch({ width: 64, depth: 4, seed: 9 });
  left.add('x', 7);
  right.add('x', 4).add('y', 2);
  left.merge(right);
  assert.ok(left.estimate('x') >= 11);
  assert.ok(left.estimate('y') >= 2);
  assert.equal(left.total, 13);

  const restored = CountMinSketch.fromJSON(sketch.toJSON());
  assert.equal(restored.total, sketch.total);
  assert.equal(restored.estimate('apple'), sketch.estimate('apple'));
  assert.throws(() => left.merge(new CountMinSketch({ width: 32, depth: 4, seed: 9 })), /identical/);

  const stream = new StreamingHeavyHitters({ width: 256, depth: 5, candidates: 2 });
  for (const item of ['a', 'b', 'a', 'c', 'a', 'b', 'a']) stream.add(item);
  const hits = stream.query(3);
  assert.equal(hits[0].item, 'a');
  assert.ok(hits[0].estimate >= 4);

  const weighted = new MisraGries(2);
  weighted.observe('dominant', 100).observe('noise', 3);
  assert.equal(weighted.candidates()[0].item, 'dominant');
  assert.throws(() => sketch.add('bad', 0), /positive safe integer/);
  console.log('Count-Min Sketch: all tests passed');
}

if (require.main === module) runTests();

module.exports = {
  CountMinSketch,
  MisraGries,
  StreamingHeavyHitters
};
