/**
 * LRU cache using Map insertion order.
 * get() refreshes recency; set() evicts the least recently used key.
 */
class LRUCache {
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError("capacity must be >= 1");
    this.capacity = capacity;
    this.map = new Map();
  }
  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.capacity) this.map.delete(this.map.keys().next().value);
  }
  has(key) { return this.map.has(key); }
  keysLeastToMostRecent() { return [...this.map.keys()]; }
}

const cache = new LRUCache(2);
cache.set("a", 1); cache.set("b", 2);
console.assert(cache.get("a") === 1);
cache.set("c", 3);
console.assert(!cache.has("b") && cache.has("a") && cache.has("c"));
console.assert(JSON.stringify(cache.keysLeastToMostRecent()) === '["a","c"]');
console.log("LRU cache practice passed");
