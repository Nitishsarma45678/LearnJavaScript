'use strict';

// Exercise: maintain a piecewise-constant map over numeric half-open ranges.
// Assignments split old ranges and coalesce adjacent ranges with equal values.

class IntervalValueMap {
  constructor() { this.segments = []; }

  assign(start, end, value) {
    this.validate(start, end);
    const next = [];
    for (const segment of this.segments) {
      if (segment.end <= start || segment.start >= end) {
        next.push(segment);
      } else {
        if (segment.start < start) next.push({ start: segment.start, end: start, value: segment.value });
        if (segment.end > end) next.push({ start: end, end: segment.end, value: segment.value });
      }
    }
    next.push({ start, end, value });
    this.segments = this.coalesce(next.sort((a, b) => a.start - b.start));
    return this;
  }

  delete(start, end) {
    this.validate(start, end);
    const next = [];
    for (const segment of this.segments) {
      if (segment.end <= start || segment.start >= end) next.push(segment);
      else {
        if (segment.start < start) next.push({ start: segment.start, end: start, value: segment.value });
        if (segment.end > end) next.push({ start: end, end: segment.end, value: segment.value });
      }
    }
    this.segments = this.coalesce(next);
    return this;
  }

  get(point) {
    let low = 0, high = this.segments.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const segment = this.segments[middle];
      if (point < segment.start) high = middle - 1;
      else if (point >= segment.end) low = middle + 1;
      else return segment.value;
    }
    return undefined;
  }

  coalesce(segments) {
    const result = [];
    for (const segment of segments) {
      const previous = result[result.length - 1];
      if (previous && previous.end === segment.start && Object.is(previous.value, segment.value)) {
        previous.end = segment.end;
      } else result.push({ ...segment });
    }
    return result;
  }

  validate(start, end) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      throw new RangeError('range must be finite and non-empty');
    }
  }
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  const map = new IntervalValueMap();
  map.assign(0, 10, 'A').assign(10, 20, 'A').assign(5, 15, 'B');
  assert.deepEqual(map.segments, [
    { start: 0, end: 5, value: 'A' },
    { start: 5, end: 15, value: 'B' },
    { start: 15, end: 20, value: 'A' }
  ]);
  assert.equal(map.get(5), 'B');
  assert.equal(map.get(15), 'A');
  map.delete(7, 17);
  assert.deepEqual(map.segments, [
    { start: 0, end: 5, value: 'A' },
    { start: 5, end: 7, value: 'B' },
    { start: 17, end: 20, value: 'A' }
  ]);
  map.assign(5, 7, 'A');
  assert.deepEqual(map.segments, [{ start: 0, end: 7, value: 'A' }, { start: 17, end: 20, value: 'A' }]);
  assert.throws(() => map.assign(2, 2, 'x'), RangeError);
  console.log('interval value map: all tests passed');
}

module.exports = { IntervalValueMap };
