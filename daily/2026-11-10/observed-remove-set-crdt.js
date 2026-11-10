'use strict';

/**
 * A small observed-remove set (OR-Set) CRDT for primitive values.
 * Adds receive globally unique replica/counter tags. A remove only tombstones
 * tags it has observed, so a concurrent unseen add survives a merge.
 */
function validateValue(value) {
  const type = typeof value;
  if (value !== null && !['string', 'boolean', 'number'].includes(type)) {
    throw new TypeError('OR-Set values must be primitive strings, booleans, finite numbers, or null');
  }
  if (type === 'number' && !Number.isFinite(value)) throw new TypeError('numbers must be finite');
  return Object.is(value, -0) ? 0 : value;
}

class ObservedRemoveSet {
  constructor(replicaId) {
    if (typeof replicaId !== 'string' || replicaId.length === 0) {
      throw new TypeError('replicaId must be a non-empty string');
    }
    this.replicaId = replicaId;
    this.counter = 0;
    this.adds = new Map(); // value -> Set<tag>
    this.removed = new Set();
  }

  add(rawValue) {
    const value = validateValue(rawValue);
    const tag = JSON.stringify([this.replicaId, this.counter++]);
    let tags = this.adds.get(value);
    if (!tags) this.adds.set(value, tags = new Set());
    tags.add(tag);
    return tag;
  }

  has(rawValue) {
    const value = validateValue(rawValue);
    const tags = this.adds.get(value);
    return Boolean(tags && [...tags].some(tag => !this.removed.has(tag)));
  }

  remove(rawValue) {
    const value = validateValue(rawValue);
    const tags = this.adds.get(value);
    if (!tags) return 0;
    let count = 0;
    for (const tag of tags) {
      if (!this.removed.has(tag)) {
        this.removed.add(tag);
        count += 1;
      }
    }
    return count;
  }

  get size() {
    let count = 0;
    for (const value of this.adds.keys()) if (this.has(value)) count += 1;
    return count;
  }

  values() {
    const result = [];
    for (const value of this.adds.keys()) if (this.has(value)) result.push(value);
    return result;
  }

  merge(other) {
    const snapshot = other instanceof ObservedRemoveSet ? other.snapshot() : other;
    if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.adds) || !Array.isArray(snapshot.removed)) {
      throw new TypeError('invalid OR-Set snapshot');
    }
    for (const record of snapshot.adds) {
      if (!record || !Array.isArray(record.tags)) throw new TypeError('invalid add record');
      const value = validateValue(record.value);
      let tags = this.adds.get(value);
      if (!tags) this.adds.set(value, tags = new Set());
      for (const tag of record.tags) {
        if (typeof tag !== 'string') throw new TypeError('tags must be strings');
        tags.add(tag);
      }
    }
    for (const tag of snapshot.removed) {
      if (typeof tag !== 'string') throw new TypeError('removed tags must be strings');
      this.removed.add(tag);
    }
    return this;
  }

  snapshot() {
    return {
      version: 1,
      adds: [...this.adds].map(([value, tags]) => ({ value, tags: [...tags].sort() })),
      removed: [...this.removed].sort()
    };
  }
}

function runTests() {
  const assert = require('node:assert/strict');
  const alice = new ObservedRemoveSet('alice');
  const bob = new ObservedRemoveSet('bob');
  alice.add('shared');
  bob.merge(alice); // Bob has observed Alice's first tag.
  alice.remove('shared');
  bob.add('shared'); // A concurrent add unknown to Alice.
  alice.merge(bob);
  bob.merge(alice);
  assert.equal(alice.has('shared'), true);
  assert.deepEqual(alice.values(), bob.values());

  const first = new ObservedRemoveSet('first');
  const second = new ObservedRemoveSet('second');
  first.add('x');
  second.add('y');
  first.merge(second).merge(second); // idempotence
  const reverse = new ObservedRemoveSet('reverse').merge(second).merge(first);
  assert.deepEqual(first.values().sort(), reverse.values().sort());

  first.remove('x');
  assert.equal(first.has('x'), false);
  first.add('x');
  assert.equal(first.has('x'), true);
  assert.equal(first.size, 2);
  assert.throws(() => first.add({ nested: true }), /primitive/);
  assert.throws(() => first.add(Infinity), /finite/);

  // Randomized merge-order convergence across three replicas.
  let seed = 0xdecafbad;
  const replicas = [new ObservedRemoveSet('r1'), new ObservedRemoveSet('r2'), new ObservedRemoveSet('r3')];
  for (let i = 0; i < 300; i += 1) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    const replica = replicas[seed % 3];
    const value = `v${(seed >>> 8) % 9}`;
    if ((seed & 3) === 0) replica.remove(value);
    else replica.add(value);
    if ((seed & 7) === 1) {
      const other = replicas[(seed >>> 4) % 3];
      replica.merge(other);
    }
  }
  const merged = new ObservedRemoveSet('final');
  for (const replica of replicas) merged.merge(replica);
  for (const replica of replicas) replica.merge(merged);
  const expected = merged.values().sort();
  for (const replica of replicas) assert.deepEqual(replica.values().sort(), expected);
  console.log('Observed-remove set: all tests passed (300 randomized operations).');
}

if (require.main === module) runTests();
module.exports = { ObservedRemoveSet };
