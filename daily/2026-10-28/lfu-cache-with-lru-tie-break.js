/**
 * Exercise: implement an O(1)-average LFU cache.
 * Evict the least-frequently-used key; break frequency ties by evicting
 * the least-recently-used key within that frequency bucket.
 */
class CacheNode {
  constructor(key, value, frequency = 1) {
    this.key = key;
    this.value = value;
    this.frequency = frequency;
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
    if (!node || !node.prev || !node.next) {
      throw new Error("Cannot remove a node that is not in a list");
    }
    node.prev.next = node.next;
    node.next.prev = node.prev;
    node.prev = null;
    node.next = null;
    this.size -= 1;
    return node;
  }

  removeLeastRecent() {
    return this.size === 0 ? null : this.remove(this.head.next);
  }
}

class LFUCache {
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity < 0) {
      throw new TypeError("capacity must be a non-negative integer");
    }
    this.capacity = capacity;
    this.nodes = new Map();
    this.frequencyLists = new Map();
    this.minFrequency = 0;
  }

  get size() {
    return this.nodes.size;
  }

  _listFor(frequency) {
    let list = this.frequencyLists.get(frequency);
    if (!list) {
      list = new DoublyLinkedList();
      this.frequencyLists.set(frequency, list);
    }
    return list;
  }

  _touch(node) {
    const oldFrequency = node.frequency;
    const oldList = this.frequencyLists.get(oldFrequency);
    oldList.remove(node);

    if (oldList.size === 0) {
      this.frequencyLists.delete(oldFrequency);
      if (this.minFrequency === oldFrequency) {
        this.minFrequency = oldFrequency + 1;
      }
    }

    node.frequency += 1;
    this._listFor(node.frequency).append(node);
  }

  get(key) {
    const node = this.nodes.get(key);
    if (!node) return -1;
    this._touch(node);
    return node.value;
  }

  put(key, value) {
    if (this.capacity === 0) return;

    const existing = this.nodes.get(key);
    if (existing) {
      existing.value = value;
      this._touch(existing);
      return;
    }

    if (this.nodes.size === this.capacity) {
      const leastFrequentList = this.frequencyLists.get(this.minFrequency);
      const evicted = leastFrequentList.removeLeastRecent();
      this.nodes.delete(evicted.key);
      if (leastFrequentList.size === 0) {
        this.frequencyLists.delete(this.minFrequency);
      }
    }

    const node = new CacheNode(key, value);
    this.nodes.set(key, node);
    this._listFor(1).append(node);
    this.minFrequency = 1;
  }
}

if (require.main === module) {
  const assert = require("node:assert/strict");

  const cache = new LFUCache(2);
  cache.put("a", 1);
  cache.put("b", 2);
  assert.equal(cache.get("a"), 1); // a: frequency 2
  assert.equal(cache.get("b"), 2); // b joins frequency 2 after a
  cache.put("c", 3);               // equal frequency: evict older a
  assert.equal(cache.get("a"), -1);
  assert.equal(cache.get("b"), 2);
  assert.equal(cache.get("c"), 3);

  cache.put("b", 20);              // update also counts as access
  assert.equal(cache.get("b"), 20);
  assert.equal(cache.size, 2);

  const zero = new LFUCache(0);
  zero.put("ignored", 1);
  assert.equal(zero.get("ignored"), -1);
  assert.throws(() => new LFUCache(-1), TypeError);
  console.log("LFUCache tests passed");
}

module.exports = { LFUCache };
