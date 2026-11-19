'use strict';

/**
 * Exercise: Build an O(1) LRU cache using a Map and a doubly linked list.
 *
 * Most-recently-used entries live immediately after the head sentinel;
 * least-recently-used entries live immediately before the tail sentinel.
 * get() refreshes recency, while peek() and has() do not.
 */

class LRUCache {
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity < 0) {
      throw new RangeError('capacity must be a non-negative integer');
    }
    this.capacity = capacity;
    this.nodes = new Map();
    this.head = { prev: null, next: null };
    this.tail = { prev: this.head, next: null };
    this.head.next = this.tail;
  }

  get size() { return this.nodes.size; }

  _detach(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
  }

  _attachAfterHead(node) {
    node.prev = this.head;
    node.next = this.head.next;
    this.head.next.prev = node;
    this.head.next = node;
  }

  _touch(node) {
    this._detach(node);
    this._attachAfterHead(node);
  }

  get(key) {
    const node = this.nodes.get(key);
    if (!node) return undefined;
    this._touch(node);
    return node.value;
  }

  peek(key) {
    const node = this.nodes.get(key);
    return node ? node.value : undefined;
  }

  has(key) {
    return this.nodes.has(key);
  }

  set(key, value) {
    if (this.capacity === 0) return this;
    const existing = this.nodes.get(key);
    if (existing) {
      existing.value = value;
      this._touch(existing);
      return this;
    }

    const node = { key, value, prev: null, next: null };
    this.nodes.set(key, node);
    this._attachAfterHead(node);

    if (this.nodes.size > this.capacity) {
      const leastRecent = this.tail.prev;
      this._detach(leastRecent);
      this.nodes.delete(leastRecent.key);
    }
    return this;
  }

  delete(key) {
    const node = this.nodes.get(key);
    if (!node) return false;
    this._detach(node);
    this.nodes.delete(key);
    return true;
  }

  clear() {
    this.nodes.clear();
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  keysMostRecentFirst() {
    const keys = [];
    for (let node = this.head.next; node !== this.tail; node = node.next) {
      keys.push(node.key);
    }
    return keys;
  }
}

function runTests() {
  const assert = require('node:assert/strict');
  const cache = new LRUCache(2);
  cache.set('a', 1).set('b', 2);
  assert.equal(cache.get('a'), 1);
  cache.set('c', 3);
  assert.equal(cache.has('b'), false, 'b should be the least recently used entry');
  assert.deepEqual(cache.keysMostRecentFirst(), ['c', 'a']);

  cache.set('a', 10);
  assert.equal(cache.peek('a'), 10);
  assert.deepEqual(cache.keysMostRecentFirst(), ['a', 'c']);
  assert.equal(cache.delete('c'), true);
  assert.equal(cache.delete('missing'), false);
  assert.equal(cache.size, 1);

  const zeroCapacity = new LRUCache(0);
  zeroCapacity.set('x', 1);
  assert.equal(zeroCapacity.size, 0);
  cache.clear();
  assert.equal(cache.size, 0);
  assert.deepEqual(cache.keysMostRecentFirst(), []);
  assert.throws(() => new LRUCache(-1), /capacity/);
}

if (require.main === module) {
  runTests();
  console.log('Doubly linked list LRU cache: all tests passed');
}

module.exports = { LRUCache };
