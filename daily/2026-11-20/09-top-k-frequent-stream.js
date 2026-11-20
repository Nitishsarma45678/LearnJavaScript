// Exercise: Return the k most frequent values using a size-k min-heap.
// Ties are deterministic: values are ordered by their string representation.
// Run: node daily/2026-11-20/09-top-k-frequent-stream.js
"use strict";
const assert = require("node:assert/strict");
class Heap {
  constructor(compare) { this.data = []; this.compare = compare; }
  get size() { return this.data.length; }
  peek() { return this.data[0]; }
  push(value) {
    const a = this.data; a.push(value); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (this.compare(a[p], value) <= 0) break; a[i] = a[p]; i = p; }
    a[i] = value;
  }
  pop() {
    const a = this.data; if (!a.length) return undefined;
    const root = a[0], last = a.pop();
    if (a.length) {
      let i = 0;
      while (true) {
        let child = i * 2 + 1; if (child >= a.length) break;
        if (child + 1 < a.length && this.compare(a[child + 1], a[child]) < 0) child++;
        if (this.compare(last, a[child]) <= 0) break;
        a[i] = a[child]; i = child;
      }
      a[i] = last;
    }
    return root;
  }
}
function topKFrequent(values, k) {
  if (!Number.isInteger(k) || k < 0) throw new RangeError("k must be non-negative");
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  if (k === 0) return [];
  // The root is the least desirable retained item: lower count, then larger label.
  const worseFirst = (a, b) => a.count - b.count || String(b.value).localeCompare(String(a.value));
  const heap = new Heap(worseFirst);
  for (const [value, count] of counts) {
    const candidate = { value, count };
    if (heap.size < k) heap.push(candidate);
    else if (worseFirst(candidate, heap.peek()) > 0) { heap.pop(); heap.push(candidate); }
  }
  return heap.data.slice().sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)))
    .map(entry => entry.value);
}
assert.deepEqual(topKFrequent(["red","blue","red","green","blue","red","green"], 2), ["red","blue"]);
assert.deepEqual(topKFrequent([4,4,2,2,9], 3), [2,4,9]);
assert.deepEqual(topKFrequent([1,1,2], 0), []);
assert.deepEqual(topKFrequent([], 5), []);
assert.throws(() => topKFrequent([1], -1), /non-negative/);
console.log("top-k frequent elements: all tests passed");
