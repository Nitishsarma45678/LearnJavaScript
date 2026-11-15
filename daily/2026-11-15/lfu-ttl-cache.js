/**
 * LFU + TTL Cache
 *
 * Exercise:
 * Build a cache whose eviction policy is least-frequently-used, with LRU as
 * the tie-breaker. Expiration records live in a min-heap and carry versions,
 * so stale heap entries cannot delete a key that has since been refreshed.
 *
 * Frequency-bucket operations are O(1) on average. TTL heap maintenance is
 * O(log n); purging is amortized over expired records.
 */

'use strict';

class MinHeap {
  constructor(compare) { this.items = []; this.compare = compare; }
  get size() { return this.items.length; }
  peek() { return this.items[0]; }
  push(value) {
    const a = this.items;
    a.push(value);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.compare(a[p], value) <= 0) break;
      a[i] = a[p];
      i = p;
    }
    a[i] = value;
  }
  pop() {
    const a = this.items;
    if (!a.length) return undefined;
    const root = a[0];
    const last = a.pop();
    if (a.length) {
      let i = 0;
      while (true) {
        let child = i * 2 + 1;
        if (child >= a.length) break;
        if (child + 1 < a.length && this.compare(a[child + 1], a[child]) < 0) child += 1;
        if (this.compare(last, a[child]) <= 0) break;
        a[i] = a[child];
        i = child;
      }
      a[i] = last;
    }
    return root;
  }
}

class ListNode {
  constructor(key, value, expiresAt, version) {
    this.key = key;
    this.value = value;
    this.freq = 1;
    this.expiresAt = expiresAt;
    this.version = version;
    this.prev = null;
    this.next = null;
  }
}

class DoublyLinkedList {
  constructor() {
    this.head = { next: null, prev: null };
    this.tail = { next: null, prev: this.head };
    this.head.next = this.tail;
    this.size = 0;
  }
  append(node) {
    node.prev = this.tail.prev;
    node.next = this.tail;
    this.tail.prev.next = node;
    this.tail.prev = node;
    this.size += 1;
  }
  remove(node) {
    if (!node.prev || !node.next) throw new Error('Node is not linked');
    node.prev.next = node.next;
    node.next.prev = node.prev;
    node.prev = null;
    node.next = null;
    this.size -= 1;
  }
  removeLeastRecent() {
    if (!this.size) return undefined;
    const node = this.head.next;
    this.remove(node);
    return node;
  }
}

class LFUTTLCache {
  constructor(capacity, { clock = () => Date.now() } = {}) {
    if (!Number.isInteger(capacity) || capacity < 0) {
      throw new RangeError('capacity must be a non-negative integer');
    }
    if (typeof clock !== 'function') throw new TypeError('clock must be a function');
    this.capacity = capacity;
    this.clock = clock;
    this.nodes = new Map();
    this.buckets = new Map();
    this.expirations = new MinHeap((a, b) => a.expiresAt - b.expiresAt);
    this.minFreq = 0;
    this.nextVersion = 1;
  }

  get size() {
    this._purgeExpired();
    return this.nodes.size;
  }

  _bucket(freq) {
    let bucket = this.buckets.get(freq);
    if (!bucket) {
      bucket = new DoublyLinkedList();
      this.buckets.set(freq, bucket);
    }
    return bucket;
  }

  _recomputeMinFreq() {
    let min = Infinity;
    for (const [freq, bucket] of this.buckets) {
      if (bucket.size && freq < min) min = freq;
    }
    this.minFreq = min === Infinity ? 0 : min;
  }

  _removeNode(node) {
    const bucket = this.buckets.get(node.freq);
    bucket.remove(node);
    if (bucket.size === 0) this.buckets.delete(node.freq);
    this.nodes.delete(node.key);
    if (node.freq === this.minFreq) this._recomputeMinFreq();
  }

  _touch(node) {
    const oldFreq = node.freq;
    const oldBucket = this.buckets.get(oldFreq);
    oldBucket.remove(node);
    if (oldBucket.size === 0) this.buckets.delete(oldFreq);
    node.freq += 1;
    this._bucket(node.freq).append(node);
    if (oldFreq === this.minFreq) this._recomputeMinFreq();
  }

  _evictLeastFrequent() {
    const bucket = this.buckets.get(this.minFreq);
    if (!bucket) throw new Error('Cache frequency index is inconsistent');
    const victim = bucket.removeLeastRecent();
    this.nodes.delete(victim.key);
    if (bucket.size === 0) this.buckets.delete(this.minFreq);
    this._recomputeMinFreq();
    return victim;
  }

  _purgeExpired() {
    const now = this.clock();
    while (this.expirations.size && this.expirations.peek().expiresAt <= now) {
      const record = this.expirations.pop();
      const node = this.nodes.get(record.key);
      if (node && node.version === record.version && node.expiresAt === record.expiresAt) {
        this._removeNode(node);
      }
    }
  }

  set(key, value, { ttl = null } = {}) {
    if (ttl !== null && (!Number.isFinite(ttl) || ttl < 0)) {
      throw new RangeError('ttl must be null or a non-negative finite number');
    }
    this._purgeExpired();
    if (this.capacity === 0) return this;
    if (ttl === 0) {
      this.delete(key);
      return this;
    }

    const expiresAt = ttl === null ? Infinity : this.clock() + ttl;
    const version = this.nextVersion++;
    let node = this.nodes.get(key);

    if (node) {
      node.value = value;
      node.expiresAt = expiresAt;
      node.version = version;
      this._touch(node);
    } else {
      if (this.nodes.size >= this.capacity) this._evictLeastFrequent();
      node = new ListNode(key, value, expiresAt, version);
      this.nodes.set(key, node);
      this._bucket(1).append(node);
      this.minFreq = 1;
    }

    if (expiresAt !== Infinity) {
      this.expirations.push({ key, expiresAt, version });
    }
    return this;
  }

  get(key) {
    this._purgeExpired();
    const node = this.nodes.get(key);
    if (!node) return undefined;
    this._touch(node);
    return node.value;
  }

  peek(key) {
    this._purgeExpired();
    const node = this.nodes.get(key);
    return node ? node.value : undefined;
  }

  has(key) {
    this._purgeExpired();
    return this.nodes.has(key);
  }

  delete(key) {
    this._purgeExpired();
    const node = this.nodes.get(key);
    if (!node) return false;
    this._removeNode(node);
    return true;
  }

  clear() {
    this.nodes.clear();
    this.buckets.clear();
    this.expirations = new MinHeap((a, b) => a.expiresAt - b.expiresAt);
    this.minFreq = 0;
  }

  snapshot() {
    this._purgeExpired();
    return [...this.nodes.values()]
      .map(node => ({ key: node.key, value: node.value, frequency: node.freq, expiresAt: node.expiresAt }))
      .sort((a, b) => a.frequency - b.frequency);
  }
}

function runTests() {
  const assert = require('node:assert/strict');
  let now = 0;
  const cache = new LFUTTLCache(2, { clock: () => now });
  cache.set('a', 1, { ttl: 10 }).set('b', 2);
  assert.equal(cache.get('a'), 1);
  cache.set('a', 11, { ttl: 100 });
  now = 11;
  assert.equal(cache.get('a'), 11, 'stale expiration record must not delete refreshed value');
  cache.set('c', 3);
  assert.equal(cache.has('b'), false, 'least-frequent entry is evicted');
  assert.equal(cache.peek('a'), 11);

  now = 101;
  assert.equal(cache.get('a'), undefined);
  assert.equal(cache.size, 1);
  assert.equal(cache.delete('c'), true);
  assert.equal(cache.delete('c'), false);

  const tie = new LFUTTLCache(2, { clock: () => now });
  tie.set('older', 1).set('newer', 2);
  tie.get('older');
  tie.get('newer');
  tie.set('third', 3);
  assert.equal(tie.has('older'), false, 'LRU breaks equal-frequency ties');

  const zero = new LFUTTLCache(0);
  zero.set('x', 1);
  assert.equal(zero.size, 0);
  assert.throws(() => cache.set('bad', 1, { ttl: -1 }), RangeError);
  console.log('LFU TTL cache tests passed');
}

if (require.main === module) runTests();

module.exports = { LFUTTLCache };
