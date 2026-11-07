'use strict';

/**
 * Exercise: Implement a canonical interval map over numeric half-open ranges.
 *
 * Ranges are [start, end), may overlap during assignment, and are normalized
 * into sorted, disjoint intervals. Adjacent intervals with Object.is-equal
 * values are coalesced. Support overwrite, removal, point lookup, and clipped
 * range intersections using binary search where possible.
 */

function validateRange(start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new RangeError('range must have finite endpoints with start < end');
  }
}

class IntervalMap {
  #intervals = [];

  constructor(entries = []) {
    if (!Array.isArray(entries)) throw new TypeError('entries must be an array');
    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length !== 3) throw new TypeError('each entry must be [start, end, value]');
      this.assign(entry[0], entry[1], entry[2]);
    }
  }

  assign(start, end, value) {
    validateRange(start, end);
    if (value === undefined) throw new TypeError('undefined is reserved to represent an unmapped point');
    this.#rewrite(start, end, value, true);
    return this;
  }

  remove(start, end) {
    validateRange(start, end);
    this.#rewrite(start, end, undefined, false);
    return this;
  }

  #rewrite(start, end, value, insert) {
    const next = [];
    for (const interval of this.#intervals) {
      if (interval.end <= start || interval.start >= end) {
        next.push(interval);
        continue;
      }
      if (interval.start < start) next.push({ start: interval.start, end: start, value: interval.value });
      if (interval.end > end) next.push({ start: end, end: interval.end, value: interval.value });
    }
    if (insert) next.push({ start, end, value });
    next.sort((a, b) => a.start - b.start);

    const normalized = [];
    for (const interval of next) {
      const previous = normalized[normalized.length - 1];
      if (previous && previous.end === interval.start && Object.is(previous.value, interval.value)) {
        previous.end = interval.end;
      } else {
        normalized.push({ ...interval });
      }
    }
    this.#intervals = normalized;
  }

  get(point) {
    if (!Number.isFinite(point)) throw new TypeError('point must be finite');
    let low = 0;
    let high = this.#intervals.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.#intervals[middle].start <= point) low = middle + 1;
      else high = middle;
    }
    const candidate = this.#intervals[low - 1];
    return candidate && point < candidate.end ? candidate.value : undefined;
  }

  intersections(start, end) {
    validateRange(start, end);
    const results = [];
    // Find the first interval whose end is greater than start.
    let low = 0;
    let high = this.#intervals.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.#intervals[middle].end <= start) low = middle + 1;
      else high = middle;
    }
    for (let i = low; i < this.#intervals.length && this.#intervals[i].start < end; i++) {
      const interval = this.#intervals[i];
      results.push(Object.freeze({
        start: Math.max(start, interval.start),
        end: Math.min(end, interval.end),
        value: interval.value,
      }));
    }
    return results;
  }

  entries() {
    return this.#intervals.map((interval) => Object.freeze({ ...interval }));
  }

  get size() { return this.#intervals.length; }

  assertInvariants() {
    for (let i = 0; i < this.#intervals.length; i++) {
      const current = this.#intervals[i];
      if (!(Number.isFinite(current.start) && Number.isFinite(current.end) && current.start < current.end)) {
        throw new Error(`invalid interval at index ${i}`);
      }
      if (current.value === undefined) throw new Error(`undefined value at index ${i}`);
      if (i > 0) {
        const previous = this.#intervals[i - 1];
        if (previous.end > current.start) throw new Error(`overlap between intervals ${i - 1} and ${i}`);
        if (previous.end === current.start && Object.is(previous.value, current.value)) {
          throw new Error(`adjacent equal intervals were not coalesced at index ${i}`);
        }
      }
    }
    return true;
  }
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  const map = new IntervalMap([[0, 10, 'A'], [12, 15, 'B']]);
  map.assign(4, 13, 'C');
  assert.deepEqual(map.entries(), [
    { start: 0, end: 4, value: 'A' },
    { start: 4, end: 13, value: 'C' },
    { start: 13, end: 15, value: 'B' },
  ]);
  assert.equal(map.get(0), 'A');
  assert.equal(map.get(4), 'C');
  assert.equal(map.get(13), 'B');
  assert.equal(map.get(15), undefined, 'endpoints are exclusive');
  assert.deepEqual(map.intersections(3, 14), [
    { start: 3, end: 4, value: 'A' },
    { start: 4, end: 13, value: 'C' },
    { start: 13, end: 14, value: 'B' },
  ]);

  map.remove(2, 14);
  assert.deepEqual(map.entries(), [
    { start: 0, end: 2, value: 'A' },
    { start: 14, end: 15, value: 'B' },
  ]);
  map.assign(2, 14, 'A');
  assert.deepEqual(map.entries(), [{ start: 0, end: 14, value: 'A' }, { start: 14, end: 15, value: 'B' }]);
  map.assign(14, 18, 'B');
  assert.deepEqual(map.entries(), [{ start: 0, end: 14, value: 'A' }, { start: 14, end: 18, value: 'B' }]);

  const nullMap = new IntervalMap().assign(-1, 1, null);
  assert.equal(nullMap.get(0), null);
  assert.equal(nullMap.get(1), undefined);
  assert.throws(() => nullMap.assign(0, 1, undefined), /reserved/);
  assert.throws(() => nullMap.assign(2, 2, 'x'), /start < end/);
  assert.throws(() => nullMap.get(Infinity), /finite/);

  // Differential test against a discrete reference model for integer ranges.
  let seed = 0x51A7E;
  const random = (limit) => { seed = (seed * 1103515245 + 12345) >>> 0; return seed % limit; };
  for (let trial = 0; trial < 80; trial++) {
    const actual = new IntervalMap();
    const reference = Array(40).fill(undefined); // point i represents [i - 10, i - 9)
    for (let operation = 0; operation < 120; operation++) {
      let a = random(40) - 10;
      let b = random(40) - 10;
      if (a === b) b++;
      const start = Math.min(a, b);
      const end = Math.max(a, b);
      if (random(4) === 0) {
        actual.remove(start, end);
        for (let point = start; point < end; point++) if (point >= -10 && point < 30) reference[point + 10] = undefined;
      } else {
        const value = ['red', 'blue', null][random(3)];
        actual.assign(start, end, value);
        for (let point = start; point < end; point++) if (point >= -10 && point < 30) reference[point + 10] = value;
      }
      assert.equal(actual.assertInvariants(), true);
      for (let point = -10; point < 30; point++) {
        assert.equal(actual.get(point + 0.25), reference[point + 10], `trial ${trial}, operation ${operation}, point ${point}`);
      }
    }
  }
  console.log('interval-map: all tests passed');
}

module.exports = { IntervalMap };
