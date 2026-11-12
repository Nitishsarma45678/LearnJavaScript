'use strict';

const assert = require('node:assert/strict');

/**
 * IntervalMap stores non-overlapping, half-open numeric intervals [start, end).
 * Assignments overwrite existing coverage; deletion preserves uncovered gaps.
 * Adjacent intervals with Object.is-equal values are coalesced.
 * Operations are O(n) and favor simple, auditable range semantics.
 */
class IntervalMap {
  constructor(entries = []) {
    this._ranges = [];
    for (const [start, end, value] of entries) this.assign(start, end, value);
  }

  static _checkRange(start, end) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      throw new RangeError('Expected finite endpoints with start < end');
    }
  }

  _normalize(ranges) {
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const range of ranges) {
      const last = merged[merged.length - 1];
      if (last && range[0] < last[1]) throw new Error('Internal invariant violated: overlapping intervals');
      if (last && Object.is(last[2], range[2]) && last[1] === range[0]) last[1] = range[1];
      else merged.push(range.slice());
    }
    this._ranges = merged;
  }

  assign(start, end, value) {
    IntervalMap._checkRange(start, end);
    const next = [];
    for (const [a, b, oldValue] of this._ranges) {
      if (b <= start || a >= end) {
        next.push([a, b, oldValue]);
      } else {
        if (a < start) next.push([a, start, oldValue]);
        if (b > end) next.push([end, b, oldValue]);
      }
    }
    next.push([start, end, value]);
    this._normalize(next);
    return this;
  }

  delete(start, end) {
    IntervalMap._checkRange(start, end);
    const next = [];
    for (const [a, b, value] of this._ranges) {
      if (b <= start || a >= end) next.push([a, b, value]);
      else {
        if (a < start) next.push([a, start, value]);
        if (b > end) next.push([end, b, value]);
      }
    }
    this._normalize(next);
    return this;
  }

  _lowerBound(point) {
    let lo = 0, hi = this._ranges.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this._ranges[mid][0] <= point) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  get(point) {
    if (!Number.isFinite(point)) throw new TypeError('point must be finite');
    const index = this._lowerBound(point) - 1;
    if (index < 0) return undefined;
    const [start, end, value] = this._ranges[index];
    return point < end ? value : undefined;
  }

  has(point) {
    if (!Number.isFinite(point)) throw new TypeError('point must be finite');
    const index = this._lowerBound(point) - 1;
    return index >= 0 && point < this._ranges[index][1];
  }

  intersect(start, end) {
    IntervalMap._checkRange(start, end);
    const result = [];
    for (const [a, b, value] of this._ranges) {
      if (b <= start) continue;
      if (a >= end) break;
      result.push([Math.max(a, start), Math.min(b, end), value]);
    }
    return result;
  }

  coveredLength(start = -Infinity, end = Infinity) {
    if (!(start < end)) throw new RangeError('Expected start < end');
    let total = 0;
    for (const [a, b] of this._ranges) total += Math.max(0, Math.min(b, end) - Math.max(a, start));
    return total;
  }

  entries() { return this._ranges.map(([a, b, value]) => [a, b, value]); }

  validate() {
    for (let i = 0; i < this._ranges.length; i++) {
      const [start, end] = this._ranges[i];
      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return false;
      if (i > 0) {
        const previous = this._ranges[i - 1];
        if (previous[1] > start) return false;
        if (previous[1] === start && Object.is(previous[2], this._ranges[i][2])) return false;
      }
    }
    return true;
  }
}

function runTests() {
  const map = new IntervalMap().assign(0, 10, 'A').assign(3, 6, 'B').assign(10, 12, 'A');
  assert.deepEqual(map.entries(), [[0, 3, 'A'], [3, 6, 'B'], [6, 12, 'A']]);
  assert.equal(map.get(0), 'A');
  assert.equal(map.get(3), 'B');
  assert.equal(map.get(6), 'A');
  assert.equal(map.get(12), undefined); // half-open end
  assert.deepEqual(map.intersect(2, 8), [[2, 3, 'A'], [3, 6, 'B'], [6, 8, 'A']]);
  assert.equal(map.coveredLength(), 12);
  map.delete(4, 9);
  assert.deepEqual(map.entries(), [[0, 3, 'A'], [3, 4, 'B'], [9, 12, 'A']]);
  map.assign(4, 9, 'A');
  assert.deepEqual(map.entries(), [[0, 3, 'A'], [3, 4, 'B'], [4, 12, 'A']]);
  assert.equal(map.validate(), true);
  assert.throws(() => map.assign(4, 4, 'bad'), /start < end/);

  // Differential test against an integer-coordinate reference model.
  let seed = 0x1a2b3c;
  const random = max => ((seed = (seed * 1664525 + 1013904223) >>> 0) % max);
  for (let trial = 0; trial < 100; trial++) {
    const actual = new IntervalMap();
    const reference = Array(40).fill(undefined);
    const covered = Array(40).fill(false);
    for (let step = 0; step < 100; step++) {
      let a = random(40), b = random(40);
      if (a === b) b = (b + 1) % 41;
      if (a > b) [a, b] = [b, a];
      if (a === b) continue;
      if (random(3) === 0) {
        actual.delete(a, b);
        for (let x = a; x < b; x++) covered[x] = false;
      } else {
        const value = ['red', 'blue', 'green'][random(3)];
        actual.assign(a, b, value);
        for (let x = a; x < b; x++) { reference[x] = value; covered[x] = true; }
      }
      assert.equal(actual.validate(), true);
      for (let x = 0; x < 40; x++) {
        assert.equal(actual.has(x), covered[x]);
        assert.equal(actual.get(x), covered[x] ? reference[x] : undefined);
      }
    }
  }
  console.log('Interval Map: all tests passed');
}

if (require.main === module) runTests();
module.exports = { IntervalMap };
