'use strict';

/**
 * Exercise: build a consistent-hashing ring with virtual nodes.
 *
 * Nodes own multiple points on a 32-bit hash circle. A lookup walks clockwise
 * to the first point; replica lookup skips repeated owners. Weights allocate
 * more virtual nodes to higher-capacity machines.
 *
 * Run: node consistent-hash-ring.js
 */

const assert = require('node:assert/strict');

function fnv1a32(value) {
  const text = String(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

class ConsistentHashRing {
  constructor({ virtualNodes = 128, hash = fnv1a32 } = {}) {
    if (!Number.isInteger(virtualNodes) || virtualNodes < 1) {
      throw new RangeError('virtualNodes must be a positive integer');
    }
    if (typeof hash !== 'function') throw new TypeError('hash must be a function');
    this.virtualNodes = virtualNodes;
    this.hash = hash;
    this.ring = [];
    this.nodes = new Map();
  }

  _hash(value) {
    const result = this.hash(String(value));
    if (!Number.isInteger(result) || result < 0 || result > 0xffffffff) {
      throw new RangeError('hash function must return an unsigned 32-bit integer');
    }
    return result >>> 0;
  }

  _compare(a, b) {
    if (a.point !== b.point) return a.point - b.point;
    if (a.owner < b.owner) return -1;
    if (a.owner > b.owner) return 1;
    return a.replica - b.replica;
  }

  _lowerBound(point) {
    let low = 0;
    let high = this.ring.length;
    while (low < high) {
      const mid = low + ((high - low) >> 1);
      if (this.ring[mid].point < point) low = mid + 1;
      else high = mid;
    }
    return low;
  }

  addNode(id, weight = 1) {
    if (typeof id !== 'string' || id.length === 0) throw new TypeError('node id must be a non-empty string');
    if (this.nodes.has(id)) throw new Error('node already exists: ' + id);
    if (!Number.isInteger(weight) || weight < 1 || weight > 10000) {
      throw new RangeError('weight must be an integer from 1 to 10000');
    }

    const tokens = [];
    const count = this.virtualNodes * weight;
    for (let replica = 0; replica < count; replica += 1) {
      tokens.push({
        point: this._hash(id + '#replica-' + replica),
        owner: id,
        replica
      });
    }
    this.nodes.set(id, tokens);
    this.ring.push(...tokens);
    this.ring.sort((a, b) => this._compare(a, b));
    return this;
  }

  removeNode(id) {
    const tokens = this.nodes.get(id);
    if (!tokens) return false;
    this.nodes.delete(id);
    const removed = new Set(tokens);
    this.ring = this.ring.filter(token => !removed.has(token));
    return true;
  }

  getNode(key) {
    if (this.ring.length === 0) return undefined;
    const point = this._hash('key:' + String(key));
    const index = this._lowerBound(point);
    return this.ring[index === this.ring.length ? 0 : index].owner;
  }

  getNodes(key, count = 1) {
    if (!Number.isInteger(count) || count < 0) throw new RangeError('count must be a non-negative integer');
    if (count === 0 || this.ring.length === 0) return [];
    const point = this._hash('key:' + String(key));
    const start = this._lowerBound(point);
    const result = [];
    const seen = new Set();
    for (let step = 0; step < this.ring.length && result.length < count; step += 1) {
      const token = this.ring[(start + step) % this.ring.length];
      if (!seen.has(token.owner)) {
        seen.add(token.owner);
        result.push(token.owner);
      }
    }
    return result;
  }

  distribution(keys) {
    const counts = new Map([...this.nodes.keys()].map(id => [id, 0]));
    for (const key of keys) {
      const owner = this.getNode(key);
      if (owner !== undefined) counts.set(owner, counts.get(owner) + 1);
    }
    return counts;
  }

  get size() {
    return this.ring.length;
  }

  get nodeCount() {
    return this.nodes.size;
  }
}

function runTests() {
  const ring = new ConsistentHashRing({ virtualNodes: 96 });
  assert.equal(ring.getNode('before'), undefined);
  ring.addNode('node-a').addNode('node-b').addNode('node-c').addNode('node-d');
  assert.equal(ring.nodeCount, 4);
  assert.equal(ring.size, 384);
  assert.equal(new Set(ring.getNodes('customer-42', 4)).size, 4);
  assert.equal(ring.getNodes('customer-42', 0).length, 0);
  assert.throws(() => ring.addNode('node-a'), /already exists/);
  assert.throws(() => ring.addNode('bad', 0), /weight/);

  const keys = Array.from({ length: 6000 }, (_, i) => 'account-' + i);
  const before = new Map(keys.map(key => [key, ring.getNode(key)]));
  ring.addNode('node-e');
  let moved = 0;
  for (const key of keys) if (before.get(key) !== ring.getNode(key)) moved += 1;
  assert.ok(moved > 0 && moved < keys.length * 0.42, 'adding one node should move only a minority of keys');

  const afterAdd = new Map(keys.map(key => [key, ring.getNode(key)]));
  assert.equal(ring.removeNode('node-e'), true);
  assert.equal(ring.removeNode('missing'), false);
  for (const key of keys) {
    if (afterAdd.get(key) !== 'node-e') assert.equal(ring.getNode(key), afterAdd.get(key));
  }

  // Deterministic collisions are resolved by owner and replica ordering.
  const collisions = new ConsistentHashRing({ virtualNodes: 2, hash: () => 7 });
  collisions.addNode('zeta').addNode('alpha');
  assert.equal(collisions.getNode('any-key'), 'alpha');
  assert.deepEqual(collisions.getNodes('any-key', 2), ['alpha', 'zeta']);

  const weighted = new ConsistentHashRing({ virtualNodes: 10 });
  weighted.addNode('small').addNode('large', 3);
  assert.equal(weighted.size, 40);
  assert.equal(weighted.getNodes('x', 5).length, 2);
  console.log('Consistent hash ring tests passed; keys moved after add:', moved);
}

if (require.main === module) runTests();

module.exports = { ConsistentHashRing, fnv1a32 };
