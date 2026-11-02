const assert = require('node:assert/strict');

// Maintains a sorted list of disjoint half-open intervals [start, end).
class RangeModule {
  constructor() { this.ranges = []; }

  addRange(left, right) {
    this.#validate(left, right);
    if (left === right) return;
    const next = [];
    let inserted = false;
    for (const [start, end] of this.ranges) {
      if (end < left) next.push([start, end]);
      else if (right < start) {
        if (!inserted) { next.push([left, right]); inserted = true; }
        next.push([start, end]);
      } else {
        left = Math.min(left, start);
        right = Math.max(right, end);
      }
    }
    if (!inserted) next.push([left, right]);
    this.ranges = next;
  }

  removeRange(left, right) {
    this.#validate(left, right);
    if (left === right) return;
    const next = [];
    for (const [start, end] of this.ranges) {
      if (end <= left || start >= right) next.push([start, end]);
      else {
        if (start < left) next.push([start, left]);
        if (end > right) next.push([right, end]);
      }
    }
    this.ranges = next;
  }

  queryRange(left, right) {
    this.#validate(left, right);
    if (left === right) return true;
    return this.ranges.some(([start, end]) => start <= left && end >= right);
  }

  #validate(left, right) {
    if (!Number.isFinite(left) || !Number.isFinite(right) || left > right) {
      throw new RangeError('Expected finite endpoints with left <= right');
    }
  }
}

const ranges = new RangeModule();
ranges.addRange(10, 20);
ranges.addRange(20, 30); // Adjacent ranges coalesce.
ranges.addRange(5, 10);
assert.deepEqual(ranges.ranges, [[5, 30]]);
assert.equal(ranges.queryRange(5, 30), true);
ranges.removeRange(14, 16);
assert.deepEqual(ranges.ranges, [[5, 14], [16, 30]]);
assert.equal(ranges.queryRange(13, 17), false);
ranges.addRange(14, 16);
assert.deepEqual(ranges.ranges, [[5, 30]]);
ranges.removeRange(5, 30);
assert.deepEqual(ranges.ranges, []);
assert.throws(() => ranges.addRange(4, 2), RangeError);
console.log('RangeModule tests passed');