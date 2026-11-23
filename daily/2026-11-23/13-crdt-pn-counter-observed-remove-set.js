// Exercise: Implement two state-based CRDTs that converge under merge:
// 1. A PN-counter with per-replica positive and negative components.
// 2. An observed-remove set (OR-Set) with unique add tags and tombstones.
//
// The OR-Set remove operation only removes tags observed by that replica.
// Concurrent additions must survive a remove that did not observe their tags.
//
// Run: node 13-crdt-pn-counter-observed-remove-set.js
const assert = require("node:assert/strict");

class PNCounter {
  constructor(replicaId, positive = new Map(), negative = new Map()) {
    if (typeof replicaId !== "string" || !replicaId) throw new TypeError("replicaId required");
    this.replicaId = replicaId;
    this.positive = new Map(positive);
    this.negative = new Map(negative);
  }

  increment(delta = 1) {
    if (!Number.isSafeInteger(delta)) throw new TypeError("delta must be a safe integer");
    const component = delta >= 0 ? this.positive : this.negative;
    const amount = Math.abs(delta);
    const next = (component.get(this.replicaId) || 0) + amount;
    if (!Number.isSafeInteger(next)) throw new RangeError("counter component overflow");
    component.set(this.replicaId, next);
    return this.value();
  }

  value() {
    const sum = (map) => Array.from(map.values()).reduce((total, n) => total + n, 0);
    return sum(this.positive) - sum(this.negative);
  }

  merge(other) {
    if (!(other instanceof PNCounter)) throw new TypeError("can only merge a PNCounter");
    const mergeMap = (left, right) => {
      const result = new Map(left);
      for (const [replica, count] of right) {
        result.set(replica, Math.max(result.get(replica) || 0, count));
      }
      return result;
    };
    return new PNCounter(
      this.replicaId,
      mergeMap(this.positive, other.positive),
      mergeMap(this.negative, other.negative)
    );
  }
}

function valueKey(value) {
  if (value !== null && !["string", "number", "boolean"].includes(typeof value)) {
    throw new TypeError("OR-Set values must be JSON-like primitives");
  }
  return typeof value + ":" + JSON.stringify(value);
}

class ObservedRemoveSet {
  constructor(replicaId, entries = new Map(), tombstones = new Set(), clock = 0) {
    if (typeof replicaId !== "string" || !replicaId) throw new TypeError("replicaId required");
    this.replicaId = replicaId;
    this.entries = new Map();
    for (const [key, entry] of entries) {
      this.entries.set(key, { value: entry.value, tags: new Set(entry.tags) });
    }
    this.tombstones = new Set(tombstones);
    this.clock = clock;
  }

  add(value) {
    const key = valueKey(value);
    const tag = this.replicaId + "#" + (++this.clock);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { value, tags: new Set() };
      this.entries.set(key, entry);
    }
    entry.tags.add(tag);
    return tag;
  }

  remove(value) {
    const key = valueKey(value);
    const entry = this.entries.get(key);
    if (!entry) return false;
    for (const tag of entry.tags) this.tombstones.add(tag);
    return true;
  }

  has(value) {
    const entry = this.entries.get(valueKey(value));
    return !!entry && Array.from(entry.tags).some((tag) => !this.tombstones.has(tag));
  }

  values() {
    const output = [];
    for (const entry of this.entries.values()) {
      if (Array.from(entry.tags).some((tag) => !this.tombstones.has(tag))) {
        output.push(entry.value);
      }
    }
    return output;
  }

  merge(other) {
    if (!(other instanceof ObservedRemoveSet)) throw new TypeError("can only merge an OR-Set");
    const entries = new Map();
    const keys = new Set([...this.entries.keys(), ...other.entries.keys()]);
    for (const key of keys) {
      const left = this.entries.get(key);
      const right = other.entries.get(key);
      const value = left ? left.value : right.value;
      entries.set(key, {
        value,
        tags: new Set([...(left?.tags || []), ...(right?.tags || [])])
      });
    }
    return new ObservedRemoveSet(
      this.replicaId,
      entries,
      new Set([...this.tombstones, ...other.tombstones]),
      this.clock
    );
  }
}

// Example tests
{
  const a = new PNCounter("A");
  const b = new PNCounter("B");
  a.increment(8);
  a.increment(-2);
  b.increment(5);
  b.increment(-1);

  const mergedAB = a.merge(b);
  const mergedBA = b.merge(a);
  assert.equal(mergedAB.value(), 10);
  assert.equal(mergedBA.value(), 10);
  assert.equal(mergedAB.merge(b).value(), 10); // idempotent merge

  const left = new ObservedRemoveSet("left");
  const right = new ObservedRemoveSet("right");
  left.add("shared");
  right.add("shared"); // concurrent tag not observed by left
  left.remove("shared");
  const converged = left.merge(right);
  assert.equal(converged.has("shared"), true);
  assert.deepEqual(converged.values(), ["shared"]);

  const removed = converged.remove("shared");
  assert.equal(removed, true);
  assert.equal(converged.has("shared"), false);
  assert.equal(converged.merge(right).has("shared"), false); // remove observed both tags before merging again
  assert.equal(converged.merge(left).has("shared"), false);
}
console.log("CRDT tests passed");
