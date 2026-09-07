// Daily JavaScript practice — 2026-09-07
// O(1) LRU cache using a Map and recency promotion.

class LRUCache {
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error("Capacity must be a positive integer");
    }
    this.capacity = capacity;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;

    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.cache.has(key)) this.cache.delete(key);
    this.cache.set(key, value);

    if (this.cache.size > this.capacity) {
      const leastRecentlyUsed = this.cache.keys().next().value;
      this.cache.delete(leastRecentlyUsed);
    }
  }

  has(key) {
    return this.cache.has(key);
  }

  entries() {
    return [...this.cache.entries()];
  }
}

const cache = new LRUCache(3);
cache.set("user:1", { name: "Nitish" });
cache.set("user:2", { name: "A" });
cache.set("user:3", { name: "B" });
cache.get("user:1");
cache.set("user:4", { name: "C" });

console.log(cache.entries());
