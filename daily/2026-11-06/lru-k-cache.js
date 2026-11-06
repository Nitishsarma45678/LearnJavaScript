'use strict';

/**
 * LRU-K cache with pinning and lazy TTL expiration.
 * Cold entries (fewer than K references) are evicted before hot entries.
 * Among cold entries, the least recently referenced is removed; among hot
 * entries, the one with the oldest Kth-most-recent reference is removed.
 */
class LRUKCache {
  constructor({ capacity, k = 2, ttlMs = Infinity, clock = () => Date.now() } = {}) {
    if (!Number.isInteger(capacity) || capacity < 0) throw new RangeError('capacity must be a non-negative integer');
    if (!Number.isInteger(k) || k < 1) throw new RangeError('k must be a positive integer');
    if (!(ttlMs === Infinity || (Number.isFinite(ttlMs) && ttlMs >= 0))) {
      throw new RangeError('ttlMs must be non-negative or Infinity');
    }
    if (typeof clock !== 'function') throw new TypeError('clock must be a function');
    this.capacity = capacity;
    this.k = k;
    this.defaultTtl = ttlMs;
    this.clock = clock;
    this.entries = new Map();
    this.sequence = 0;
    this.evictions = 0;
  }

  _record(entry) {
    entry.history.unshift(++this.sequence);
    if (entry.history.length > this.k) entry.history.length = this.k;
  }

  _expired(entry, now = this.clock()) {
    return entry.expiresAt <= now;
  }

  _purgeExpired() {
    const now = this.clock();
    for (const [key, entry] of this.entries) {
      if (this._expired(entry, now)) this.entries.delete(key);
    }
  }

  _victimKey() {
    let victim;
    let found = false;
    let oldestReference = Infinity;
    let victimIsCold = false;
    for (const [key, entry] of this.entries) {
      if (entry.pinned) continue;
      const isCold = entry.history.length < this.k;
      const reference = isCold ? entry.history[0] : entry.history[this.k - 1];
      if (!found || (isCold && !victimIsCold) || (isCold === victimIsCold && reference < oldestReference)) {
        found = true;
        victim = key;
        oldestReference = reference;
        victimIsCold = isCold;
      }
    }
    return { found, key: victim };
  }

  set(key, value, options = {}) {
    const ttlMs = options.ttlMs ?? this.defaultTtl;
    if (!(ttlMs === Infinity || (Number.isFinite(ttlMs) && ttlMs >= 0))) {
      throw new RangeError('ttlMs must be non-negative or Infinity');
    }
    this._purgeExpired();
    const existing = this.entries.get(key);
    if (existing) {
      existing.value = value;
      existing.expiresAt = ttlMs === Infinity ? Infinity : this.clock() + ttlMs;
      this._record(existing);
      return true;
    }
    if (this.capacity === 0) return false;
    if (this.entries.size >= this.capacity) {
      const victim = this._victimKey();
      if (!victim.found) return false;
      this.entries.delete(victim.key);
      this.evictions += 1;
    }
    const entry = {
      value,
      history: [],
      pinned: false,
      expiresAt: ttlMs === Infinity ? Infinity : this.clock() + ttlMs
    };
    this._record(entry);
    this.entries.set(key, entry);
    return true;
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this._expired(entry)) {
      this.entries.delete(key);
      return undefined;
    }
    this._record(entry);
    return entry.value;
  }

  peek(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this._expired(entry)) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  has(key) {
    const entry = this.entries.get(key);
    if (!entry) return false;
    if (this._expired(entry)) {
      this.entries.delete(key);
      return false;
    }
    return true;
  }

  pin(key) {
    const entry = this.entries.get(key);
    if (!entry || this._expired(entry)) {
      if (entry) this.entries.delete(key);
      return false;
    }
    entry.pinned = true;
    return true;
  }

  unpin(key) {
    const entry = this.entries.get(key);
    if (!entry || this._expired(entry)) {
      if (entry) this.entries.delete(key);
      return false;
    }
    entry.pinned = false;
    return true;
  }

  delete(key) {
    return this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
  }

  get size() {
    this._purgeExpired();
    return this.entries.size;
  }

  stats() {
    this._purgeExpired();
    return { size: this.entries.size, capacity: this.capacity, evictions: this.evictions };
  }
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  const cache = new LRUKCache({ capacity: 2, k: 2 });
  assert.equal(cache.set('A', 1), true);
  assert.equal(cache.set('B', 2), true);
  assert.equal(cache.get('A'), 1); // The second reference promotes A to hot status.
  assert.equal(cache.set('C', 3), true);
  assert.equal(cache.has('B'), false); // cold B loses to hot A.
  assert.equal(cache.peek('A'), 1);
  assert.equal(cache.peek('C'), 3); // peek does not promote C to hot status.
  assert.equal(cache.set('D', 4), true); // cold C is evicted before hot A.
  assert.equal(cache.has('C'), false);
  assert.equal(cache.pin('A'), true);
  assert.equal(cache.pin('D'), true);
  assert.equal(cache.set('E', 5), false); // all resident entries are pinned.
  assert.equal(cache.unpin('D'), true);
  assert.equal(cache.set('E', 5), true);
  assert.equal(cache.has('A'), true);
  assert.equal(cache.stats().evictions, 3);

  // When all entries are hot, compare the Kth-most-recent reference.
  const hot = new LRUKCache({ capacity: 2, k: 2 });
  hot.set('older', 'x');
  hot.set('newer', 'y');
  hot.get('older');
  hot.get('newer');
  hot.get('newer');
  hot.set('third', 'z');
  assert.equal(hot.has('older'), false);
  assert.equal(hot.has('newer'), true);

  let now = 100;
  const expiring = new LRUKCache({ capacity: 3, ttlMs: 10, clock: () => now });
  expiring.set('short-lived', 7);
  now = 111;
  assert.equal(expiring.has('short-lived'), false);
  assert.equal(expiring.size, 0);
  assert.equal(new LRUKCache({ capacity: 0 }).set('x', 1), false);
  const nullableKey = new LRUKCache({ capacity: 1 });
  nullableKey.set(null, 'kept');
  assert.equal(nullableKey.set('next', 'value'), true);
  assert.equal(nullableKey.has(null), false);
  console.log('LRU-K cache: all tests passed');
}

module.exports = { LRUKCache };
