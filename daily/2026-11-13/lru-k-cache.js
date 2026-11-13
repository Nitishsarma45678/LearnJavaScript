/**
 * Exercise: Implement an LRU-K cache with O(log n) eviction selection.
 *
 * A key is "cold" until it has been accessed K times. Eviction always prefers
 * cold entries, choosing the one whose oldest recorded reference is earliest.
 * If every resident entry is hot, evict the entry with the oldest K-th most
 * recent reference. A min-heap plus versioned lazy invalidation avoids scanning
 * the cache on every eviction.
 */
'use strict';

class MinHeap {
  constructor(compare) { this.items = []; this.compare = compare; }
  get size() { return this.items.length; }
  push(value) {
    const a = this.items; a.push(value); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (this.compare(a[p], value) <= 0) break; a[i] = a[p]; i = p; }
    a[i] = value;
  }
  pop() {
    const a = this.items; if (!a.length) return undefined;
    const root = a[0], last = a.pop();
    if (a.length) {
      let i = 0;
      while (true) {
        let c = i * 2 + 1; if (c >= a.length) break;
        if (c + 1 < a.length && this.compare(a[c + 1], a[c]) < 0) c++;
        if (this.compare(last, a[c]) <= 0) break;
        a[i] = a[c]; i = c;
      }
      a[i] = last;
    }
    return root;
  }
}

class LRUKCache {
  constructor(capacity, k = 2) {
    if (!Number.isInteger(capacity) || capacity < 0) throw new RangeError('capacity must be a non-negative integer');
    if (!Number.isInteger(k) || k < 1) throw new RangeError('k must be a positive integer');
    this.capacity = capacity; this.k = k; this.clock = 0;
    this.entries = new Map(); this.hits = 0; this.misses = 0; this.evictions = 0;
    this.heap = new MinHeap((a, b) => a.tier - b.tier || a.priority - b.priority || a.order - b.order);
  }
  get size() { return this.entries.size; }
  _record(entry) {
    entry.history.push(++this.clock);
    if (entry.history.length > this.k) entry.history.shift();
    entry.version++;
    this.heap.push({ key: entry.key, version: entry.version,
      tier: entry.history.length < this.k ? 0 : 1,
      priority: entry.history[0], order: entry.history.at(-1) });
    this._compactHeap();
  }
  _compactHeap() {
    if (this.heap.size <= this.entries.size * 4 + 32) return;
    const rebuilt = new MinHeap(this.heap.compare);
    for (const entry of this.entries.values()) rebuilt.push({ key: entry.key, version: entry.version,
      tier: entry.history.length < this.k ? 0 : 1,
      priority: entry.history[0], order: entry.history.at(-1) });
    this.heap = rebuilt;
  }
  _evictOne() {
    while (this.heap.size) {
      const candidate = this.heap.pop(), entry = this.entries.get(candidate.key);
      if (!entry || entry.version !== candidate.version) continue;
      this.entries.delete(candidate.key); this.evictions++; return candidate.key;
    }
    return undefined;
  }
  get(key) {
    const entry = this.entries.get(key);
    if (!entry) { this.misses++; return undefined; }
    this.hits++; this._record(entry); return entry.value;
  }
  peek(key) { return this.entries.get(key)?.value; }
  has(key) { return this.entries.has(key); }
  set(key, value) {
    if (this.capacity === 0) return this;
    let entry = this.entries.get(key);
    if (entry) entry.value = value;
    else {
      if (this.entries.size >= this.capacity) this._evictOne();
      entry = { key, value, history: [], version: 0 }; this.entries.set(key, entry);
    }
    this._record(entry);
    return this;
  }
  delete(key) { return this.entries.delete(key); }
  clear() { this.entries.clear(); this.heap = new MinHeap((this.heap.compare); this.hits = this.misses = this.evictions = 0; }
  resize(capacity) {
    if (!Number.isInteger(capacity) || capacity < 0) throw new RangeError('capacity must be a non-negative integer');
    this.capacity = capacity;
    while (this.entries.size > capacity) this._evictOne();
    return this;
  }
  stats() { return { size: this.size, capacity: this.capacity, hits: this.hits, misses: this.misses, evictions: this.evictions }; }
}

// ------------------------------ Tests ------------------------------------
if (require.main === module) {
  const assert = require('node:assert/strict');
  const cache = new LRUKCache(2, 2);
  cache.set('A', 1).set('B', 2);
  assert.equal(cache.get('A'), 1); // A has two references including insertion
  cache.set('C', 3); // B is cold; A is hot
  assert.equal(cache.has('B'), false);
  assert.equal(cache.get('A'), 1);
  assert.equal(cache.get('C'), 3);
  cache.set('D', 4); // C is now hot, A is hot; A has older K-th reference
  assert.equal(cache.has('A'), false);
  assert.equal(cache.peek('C'), 3);
  assert.equal(cache.stats().evictions, 2);

  const cold = new LRUKCache(3, 3);
  cold.set('old', 1).set('middle', 2).set('new', 3).set('x', 4);
  assert.equal(cold.has('old'), false);
  assert.equal(cold.has('middle'), true);
  cold.resize(1);
  assert.equal(cold.size, 1);
  assert.equal(cold.has('x'), true);
  assert.throws(() => new LRUKCache(-1), RangeError);
  assert.throws(() => new LRUKCache(1, 0), RangeError);
  const zero = new LRUKCache(0); zero.set('x', 1); assert.equal(zero.size, 0);
  console.log('LRU-K cache: all tests passed');
}

module.exports = { LRUKCache };
