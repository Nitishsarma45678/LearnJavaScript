'use strict';

/**
 * Exercise: implement an Adaptive Replacement Cache (ARC).
 *
 * ARC balances recency (T1) and frequency (T2), while B1/B2 ghost lists
 * remember recently evicted keys. The target p adapts the recency/frequency
 * split when a ghost hit reveals which workload deserves more space.
 *
 * Expected complexity: O(1) average time for get/set/delete and O(capacity)
 * space. This implementation stores primitive or object keys by Map identity.
 */
class LRUList {
  constructor() {
    this.nodes = new Map();
    this.head = { next: null, prev: null };
    this.tail = { next: null, prev: null };
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  get size() { return this.nodes.size; }
  has(key) { return this.nodes.has(key); }
  peek(key) { return this.nodes.get(key); }

  _unlink(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
    node.prev = node.next = null;
  }

  _front(node) {
    node.prev = this.head;
    node.next = this.head.next;
    this.head.next.prev = node;
    this.head.next = node;
  }

  set(key, value) {
    let node = this.nodes.get(key);
    if (node) {
      node.value = value;
      this._unlink(node);
    } else {
      node = { key, value, prev: null, next: null };
      this.nodes.set(key, node);
    }
    this._front(node);
    return node;
  }

  get(key) {
    const node = this.nodes.get(key);
    if (!node) return undefined;
    this._unlink(node);
    this._front(node);
    return node.value;
  }

  delete(key) {
    const node = this.nodes.get(key);
    if (!node) return undefined;
    this._unlink(node);
    this.nodes.delete(key);
    return node;
  }

  popLeastRecent() {
    if (!this.size) return undefined;
    return this.delete(this.tail.prev.key);
  }

  keysMostRecentFirst() {
    const keys = [];
    for (let node = this.head.next; node !== this.tail; node = node.next) keys.push(node.key);
    return keys;
  }
}

class AdaptiveReplacementCache {
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('capacity must be a positive integer');
    }
    this.capacity = capacity;
    this.targetRecent = 0; // ARC's adaptive target p for T1.
    this.T1 = new LRUList(); // recently seen resident keys
    this.T2 = new LRUList(); // frequently seen resident keys
    this.B1 = new LRUList(); // ghost history of T1 evictions
    this.B2 = new LRUList(); // ghost history of T2 evictions
  }

  get size() { return this.T1.size + this.T2.size; }

  _evictToGhost(fromRecent) {
    const source = fromRecent ? this.T1 : this.T2;
    const destination = fromRecent ? this.B1 : this.B2;
    const evicted = source.popLeastRecent();
    if (evicted) destination.set(evicted.key, undefined);
    return evicted;
  }

  _replace(incomingFromB2) {
    const chooseT1 = this.T1.size > 0 &&
      (this.T1.size > this.targetRecent ||
       (incomingFromB2 && this.T1.size === this.targetRecent));
    this._evictToGhost(chooseT1);
  }

  get(key) {
    let node = this.T1.delete(key);
    if (node) {
      this.T2.set(key, node.value);
      return node.value;
    }
    return this.T2.get(key);
  }

  has(key) {
    return this.T1.has(key) || this.T2.has(key);
  }

  set(key, value) {
    if (this.T1.has(key)) {
      this.T1.delete(key);
      this.T2.set(key, value);
      return this;
    }
    if (this.T2.has(key)) {
      this.T2.set(key, value);
      return this;
    }

    if (this.B1.has(key)) {
      const delta = Math.max(1, Math.floor(this.B2.size / this.B1.size));
      this.targetRecent = Math.min(this.capacity, this.targetRecent + delta);
      this._replace(false);
      this.B1.delete(key);
      this.T2.set(key, value);
      return this;
    }

    if (this.B2.has(key)) {
      const delta = Math.max(1, Math.floor(this.B1.size / this.B2.size));
      this.targetRecent = Math.max(0, this.targetRecent - delta);
      this._replace(true);
      this.B2.delete(key);
      this.T2.set(key, value);
      return this;
    }

    const c = this.capacity;
    if (this.T1.size + this.B1.size === c) {
      if (this.T1.size < c) {
        this.B1.popLeastRecent();
        this._replace(false);
      } else {
        // T1 already occupies the full resident target and B1 is empty;
        // discard its LRU entry without growing the ghost history.
        this.T1.popLeastRecent();
      }
    } else if (this.T1.size + this.B1.size < c) {
      if (this.T1.size + this.T2.size + this.B1.size + this.B2.size >= c) {
        if (this.T1.size + this.T2.size + this.B1.size + this.B2.size === 2 * c) {
          this.B2.popLeastRecent();
        }
        this._replace(false);
      }
    }

    this.T1.set(key, value);
    this._trimGhosts();
    return this;
  }

  _trimGhosts() {
    while (this.B1.size + this.B2.size > this.capacity) {
      if (this.B2.size > this.B1.size) this.B2.popLeastRecent();
      else this.B1.popLeastRecent();
    }
  }

  delete(key) {
    const a = this.T1.delete(key);
    const b = this.T2.delete(key);
    return Boolean(a || b);
  }

  clear() {
    for (const list of [this.T1, this.T2, this.B1, this.B2]) {
      for (const key of list.nodes.keys()) list.delete(key);
    }
    this.targetRecent = 0;
  }

  snapshot() {
    return {
      targetRecent: this.targetRecent,
      T1: this.T1.keysMostRecentFirst(),
      T2: this.T2.keysMostRecentFirst(),
      B1: this.B1.keysMostRecentFirst(),
      B2: this.B2.keysMostRecentFirst()
    };
  }
}

module.exports = { AdaptiveReplacementCache };

if (require.main === module) {
  const assert = require('node:assert/strict');
  const cache = new AdaptiveReplacementCache(2);
  cache.set('a', 1).set('b', 2);
  assert.equal(cache.get('a'), 1); // a becomes frequent
  cache.set('c', 3);              // b is displaced
  assert.equal(cache.has('b'), false);
  assert.equal(cache.get('a'), 1);
  cache.set('b', 20);             // ghost hit adapts the target
  assert.equal(cache.get('b'), 20);
  assert.equal(cache.size, 2);
  assert.ok(cache.snapshot().targetRecent >= 0);
  assert.equal(cache.delete('missing'), false);
  assert.equal(cache.delete('a'), false); // a is remembered only as a ghost
  assert.equal(cache.delete('b'), true);
  cache.clear();
  assert.equal(cache.size, 0);
  assert.throws(() => new AdaptiveReplacementCache(0), RangeError);

  // Deterministic stress: resident capacity and list membership stay valid.
  for (let i = 0; i < 500; i++) {
    const key = `k${(i * 17) % 23}`;
    if (i % 3 === 0) cache.get(key);
    else cache.set(key, i);
    assert.ok(cache.size <= cache.capacity);
    const snap = cache.snapshot();
    assert.equal(new Set([...snap.T1, ...snap.T2]).size, cache.size);
  }
  console.log('ARC cache tests passed');
}
