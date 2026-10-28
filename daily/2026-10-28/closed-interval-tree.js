'use strict';

// Centered interval tree for closed intervals [start, end].
// Each interval is stored at exactly one node. Queries return original interval
// objects sorted by start, end, then input order.
const assert = require('node:assert/strict');

class ClosedIntervalTree {
  constructor(intervals) {
    if (!Array.isArray(intervals)) throw new TypeError('intervals must be an array');

    this.entries = intervals.map((interval, index) => {
      if (!interval || !Number.isFinite(interval.start) ||
          !Number.isFinite(interval.end) || interval.start > interval.end) {
        throw new TypeError('each interval needs finite start <= end');
      }
      return { interval, start: interval.start, end: interval.end, index };
    });

    this.root = this._build(this.entries);
  }

  _build(entries) {
    if (entries.length === 0) return null;

    const endpoints = entries.flatMap(entry => [entry.start, entry.end]).sort((a, b) => a - b);
    const center = endpoints[Math.floor(endpoints.length / 2)];
    const crossing = [];
    const left = [];
    const right = [];

    for (const entry of entries) {
      if (entry.end < center) left.push(entry);
      else if (entry.start > center) right.push(entry);
      else crossing.push(entry);
    }

    // The chosen center is an endpoint, so at least one interval crosses it.
    if (crossing.length === 0) throw new Error('internal error: empty center partition');

    const byStart = [...crossing].sort((a, b) =>
      a.start - b.start || a.end - b.end || a.index - b.index);
    const byEnd = [...crossing].sort((a, b) =>
      b.end - a.end || a.start - b.start || a.index - b.index);

    return {
      center,
      crossing,
      byStart,
      byEnd,
      left: this._build(left),
      right: this._build(right)
    };
  }

  query(start, end) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
      throw new TypeError('query needs finite start <= end');
    }

    const found = [];
    const visit = node => {
      if (!node) return;

      if (end < node.center) {
        for (const entry of node.byStart) {
          if (entry.start > end) break;
          found.push(entry);
        }
        visit(node.left);
      } else if (start > node.center) {
        for (const entry of node.byEnd) {
          if (entry.end < start) break;
          found.push(entry);
        }
        visit(node.right);
      } else {
        // The query contains the node center, so every crossing interval hits.
        found.push(...node.crossing);
        visit(node.left);
        visit(node.right);
      }
    };

    visit(this.root);
    found.sort((a, b) => a.start - b.start || a.end - b.end || a.index - b.index);
    return found.map(entry => entry.interval);
  }
}

// Example tests: boundary contact counts as overlap for closed intervals.
const intervals = [
  { start: 1, end: 4, id: 'a' },
  { start: 3, end: 6, id: 'b' },
  { start: 7, end: 9, id: 'c' },
  { start: 4, end: 4, id: 'point' },
  { start: -2, end: 0, id: 'd' }
];
const tree = new ClosedIntervalTree(intervals);

assert.deepEqual(tree.query(4, 7).map(item => item.id), ['a', 'b', 'point', 'c']);
assert.deepEqual(tree.query(5, 5).map(item => item.id), ['b']);
assert.deepEqual(tree.query(-10, -3), []);
assert.deepEqual(tree.query(-2, -2).map(item => item.id), ['d']);
assert.throws(() => new ClosedIntervalTree([{ start: 5, end: 1 }]), TypeError);
assert.throws(() => tree.query(4, 3), TypeError);

console.log('ClosedIntervalTree tests passed.');
