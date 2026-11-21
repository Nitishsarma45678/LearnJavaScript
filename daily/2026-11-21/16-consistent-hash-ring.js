// Exercise: Implement a consistent-hashing ring with virtual nodes.
// Adding or removing a physical node should remap only keys whose successor changes.

function hash32(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

class ConsistentHashRing {
  constructor(replicas = 100) {
    if (!Number.isInteger(replicas) || replicas < 1) {
      throw new RangeError("replicas must be a positive integer");
    }
    this.replicas = replicas;
    this.nodes = new Set();
    this.points = [];
  }

  addNode(node) {
    if (typeof node !== "string" || node.length === 0) {
      throw new TypeError("node must be a non-empty string");
    }
    if (this.nodes.has(node)) return false;
    this.nodes.add(node);
    for (let replica = 0; replica < this.replicas; replica++) {
      const token = node + "#" + replica;
      this.points.push({ hash: hash32(token), token, node });
    }
    this.points.sort((a, b) => a.hash - b.hash || a.token.localeCompare(b.token));
    return true;
  }

  removeNode(node) {
    if (!this.nodes.delete(node)) return false;
    this.points = this.points.filter(point => point.node !== node);
    return true;
  }

  getNode(key) {
    if (this.points.length === 0) return null;
    const hash = hash32(String(key));
    let low = 0;
    let high = this.points.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.points[middle].hash < hash) low = middle + 1;
      else high = middle;
    }
    return this.points[low % this.points.length].node;
  }
}

// Tests
const assert = require("node:assert/strict");
const ring = new ConsistentHashRing(64);
assert.equal(ring.getNode("user:1"), null);
ring.addNode("node-a");
ring.addNode("node-b");
ring.addNode("node-c");
assert.equal(ring.addNode("node-a"), false);

const keys = Array.from({ length: 500 }, (_, index) => "user:" + index);
const before = new Map(keys.map(key => [key, ring.getNode(key)]));
ring.addNode("node-d");
let remapped = 0;
for (const key of keys) {
  const owner = ring.getNode(key);
  assert.ok(["node-a", "node-b", "node-c", "node-d"].includes(owner));
  if (owner !== before.get(key)) remapped++;
}
assert.ok(remapped > 0 && remapped < keys.length);
assert.equal(ring.removeNode("node-b"), true);
assert.equal(ring.removeNode("missing"), false);
for (const key of keys) assert.notEqual(ring.getNode(key), "node-b");
console.log("consistent hashing tests passed");
