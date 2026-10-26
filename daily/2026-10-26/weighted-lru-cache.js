/**
 * Weighted LRU cache.
 * Evicts least-recently-used entries until total weight fits the budget.
 * Practice: Map ordering, invariants, edge cases, API design.
 */
class WeightedLRUCache {
  constructor(maxWeight, weigh = () => 1) {
    if (!Number.isFinite(maxWeight) || maxWeight < 0) {
      throw new RangeError("maxWeight must be a non-negative finite number");
    }
    if (typeof weigh !== "function") throw new TypeError("weigh must be a function");
    this.maxWeight = maxWeight;
    this.weigh = weigh;
    this.entries = new Map();
    this.totalWeight = 0;
  }

  get(key) {
    if (!this.entries.has(key)) return undefined;
    const entry = this.entries.get(key);
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    const weight = this.weigh(value, key);
    if (!Number.isFinite(weight) || weight < 0) {
      throw new RangeError("entry weight must be a non-negative finite number");
    }

    if (this.entries.has(key)) {
      this.totalWeight -= this.entries.get(key).weight;
      this.entries.delete(key);
    }

    // An entry heavier than the entire budget cannot be retained.
    if (weight > this.maxWeight) {
      this.#evictToBudget();
      return this;
    }

    this.entries.set(key, { value, weight });
    this.totalWeight += weight;
    this.#evictToBudget();
    return this;
  }

  #evictToBudget() {
    while (this.totalWeight > this.maxWeight && this.entries.size > 0) {
      const oldestKey = this.entries.keys().next().value;
      const oldest = this.entries.get(oldestKey);
      this.entries.delete(oldestKey);
      this.totalWeight -= oldest.weight;
    }
  }

  delete(key) {
    const entry = this.entries.get(key);
    if (!entry && !this.entries.has(key)) return false;
    this.entries.delete(key);
    this.totalWeight -= entry.weight;
    return true;
  }

  resize(newMaxWeight) {
    if (!Number.isFinite(newMaxWeight) || newMaxWeight < 0) {
      throw new RangeError("newMaxWeight must be non-negative");
    }
    this.maxWeight = newMaxWeight;
    this.#evictToBudget();
  }

  snapshot() {
    return {
      maxWeight: this.maxWeight,
      totalWeight: this.totalWeight,
      keysLeastToMostRecent: [...this.entries.keys()]
    };
  }
}

// Example tests
const cache = new WeightedLRUCache(5, value => value.length);
cache.set("a", "aa").set("b", "bbb");
console.assert(cache.snapshot().totalWeight === 5);
console.assert(cache.get("a") === "aa"); // a becomes most recent
cache.set("c", "ccc"); // evicts b, then a if necessary
console.assert(cache.snapshot().totalWeight <= 5);
console.assert(cache.snapshot().keysLeastToMostRecent.at(-1) === "c");
cache.set("too-large", "123456");
console.assert(!cache.entries.has("too-large"));
cache.resize(2);
console.assert(cache.snapshot().totalWeight <= 2);
console.log("weighted LRU cache practice passed");
