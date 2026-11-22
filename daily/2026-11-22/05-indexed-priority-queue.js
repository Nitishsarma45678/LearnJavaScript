/**
 * Exercise: Build an indexed min-priority queue.
 * Required: insert, peek, extractMin, decreaseKey, updatePriority, and remove.
 * Each operation is O(log n), except key lookup which is O(1).
 * Run: node 05-indexed-priority-queue.js
 */
"use strict";
const assert = require("node:assert/strict");

class IndexedPriorityQueue {
  constructor(compare = (a, b) => a - b) {
    this.heap = [];
    this.index = new Map();
    this.compare = compare;
  }
  get size() { return this.heap.length; }
  has(key) { return this.index.has(key); }
  swap(i, j) {
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
    this.index.set(this.heap[i].key, i);
    this.index.set(this.heap[j].key, j);
  }
  higher(i, j) {
    const order = this.compare(this.heap[i].priority, this.heap[j].priority);
    return order < 0 || (order === 0 && String(this.heap[i].key) < String(this.heap[j].key));
  }
  siftUp(i) {
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (!this.higher(i, p)) break;
      this.swap(i, p); i = p;
    }
  }
  siftDown(i) {
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let best = i;
      if (l < this.size && this.higher(l, best)) best = l;
      if (r < this.size && this.higher(r, best)) best = r;
      if (best === i) return;
      this.swap(i, best); i = best;
    }
  }
  insert(key, priority, value = key) {
    if (this.has(key)) throw new Error("duplicate key");
    if (Number.isNaN(priority)) throw new TypeError("priority cannot be NaN");
    this.heap.push({ key, priority, value });
    this.index.set(key, this.size - 1);
    this.siftUp(this.size - 1);
  }
  peek() { return this.heap.length ? { ...this.heap[0] } : null; }
  extractMin() {
    if (!this.size) return null;
    const result = this.heap[0];
    this.removeAt(0);
    return { ...result };
  }
  remove(key) {
    const i = this.index.get(key);
    if (i === undefined) return null;
    const result = this.heap[i];
    this.removeAt(i);
    return { ...result };
  }
  removeAt(i) {
    const removed = this.heap[i], last = this.heap.pop();
    this.index.delete(removed.key);
    if (i < this.heap.length) {
      this.heap[i] = last;
      this.index.set(last.key, i);
      const p = Math.floor((i - 1) / 2);
      if (i > 0 && this.higher(i, p)) this.siftUp(i);
      else this.siftDown(i);
    }
  }
  updatePriority(key, priority) {
    const i = this.index.get(key);
    if (i === undefined) throw new Error("unknown key");
    if (Number.isNaN(priority)) throw new TypeError("priority cannot be NaN");
    const old = this.heap[i].priority;
    this.heap[i].priority = priority;
    const order = this.compare(priority, old);
    if (order < 0) this.siftUp(i);
    else if (order > 0) this.siftDown(i);
  }
  decreaseKey(key, priority) {
    const i = this.index.get(key);
    if (i === undefined) throw new Error("unknown key");
    if (this.compare(priority, this.heap[i].priority) > 0) {
      throw new RangeError("new priority is not smaller");
    }
    this.updatePriority(key, priority);
  }
}

const q = new IndexedPriorityQueue();
q.insert("compile", 8);
q.insert("test", 12);
q.insert("lint", 5);
q.decreaseKey("test", 2);
assert.equal(q.peek().key, "test");
assert.equal(q.extractMin().key, "test");
assert.equal(q.remove("compile").priority, 8);
assert.equal(q.extractMin().key, "lint");
assert.equal(q.extractMin(), null);
assert.equal(q.size, 0);
assert.throws(() => q.decreaseKey("missing", 1), /unknown key/);
console.log("indexed priority queue tests passed");
module.exports = { IndexedPriorityQueue };
