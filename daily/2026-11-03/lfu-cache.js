const assert = require('node:assert/strict');

// O(1) average get/put. Among equally frequent keys, evict the least recently used.
class LFUCache {
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity < 0) {
      throw new RangeError('capacity must be a non-negative integer');
    }
    this.capacity = capacity;
    this.entries = new Map();       // key -> { value, frequency }
    this.buckets = new Map();       // frequency -> insertion-ordered Set of keys
    this.minFrequency = 0;
  }

  _bucket(frequency) {
    if (!this.buckets.has(frequency)) this.buckets.set(frequency, new Set());
    return this.buckets.get(frequency);
  }

  _touch(key, entry) {
    const oldFrequency = entry.frequency;
    const oldBucket = this.buckets.get(oldFrequency);
    oldBucket.delete(key);
    if (oldBucket.size === 0) {
      this.buckets.delete(oldFrequency);
      if (this.minFrequency === oldFrequency) this.minFrequency++;
    }
    entry.frequency++;
    this._bucket(entry.frequency).add(key);
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this._touch(key, entry);
    return entry.value;
  }

  put(key, value) {
    if (this.capacity === 0) return;
    const existing = this.entries.get(key);
    if (existing) {
      existing.value = value;
      this._touch(key, existing);
      return;
    }

    if (this.entries.size === this.capacity) {
      const bucket = this.buckets.get(this.minFrequency);
      const victim = bucket.values().next().value;
      bucket.delete(victim);
      if (bucket.size === 0) this.buckets.delete(this.minFrequency);
      this.entries.delete(victim);
    }

    this.entries.set(key, { value, frequency: 1 });
    this._bucket(1).add(key);
    this.minFrequency = 1;
  }

  get size() { return this.entries.size; }
}

const cache = new LFUCache(2);
cache.put('a', 1);
cache.put('b', 2);
assert.equal(cache.get('a'), 1); // a has frequency 2; b has frequency 1
cache.put('c', 3);               // evicts b
assert.equal(cache.get('b'), undefined);
assert.equal(cache.get('c'), 3);
cache.put('a', 10);              // updating also counts as access
assert.equal(cache.get('a'), 10);
assert.equal(cache.size, 2);

const tie = new LFUCache(2);
tie.put('first', 1);
tie.put('second', 2);
tie.get('first');
tie.put('third', 3);             // second is least frequent
assert.equal(tie.get('second'), undefined);
assert.equal(new LFUCache(0).size, 0);
assert.throws(() => new LFUCache(-1), RangeError);
console.log('LFU cache tests passed');
