'use strict';

/*
 * Exercise: Implement an observed-remove set (OR-Set) CRDT.
 *
 * Each add receives a unique actor/counter tag. A remove only tombstones tags
 * it has observed, so a concurrent unseen add survives. Merge is a set union
 * over add tags and tombstones, making it idempotent, commutative and
 * associative. compact() is safe only when the supplied stability vector
 * proves every replica has observed the relevant actor counters.
 *
 * Values are restricted to JSON-compatible data so they can be serialized
 * and compared deterministically across replicas.
 */

const assert = require('node:assert/strict');

function canonicalValue(value, seen = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('values must contain finite numbers');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    throw new TypeError('values must be JSON-compatible');
  }
  if (seen.has(value)) throw new TypeError('cyclic values are not supported');
  seen.add(value);

  let result;
  if (Array.isArray(value)) {
    result = '[' + value.map(item => canonicalValue(item, seen)).join(',') + ']';
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('only plain objects and arrays are supported');
    }
    const keys = Object.keys(value).sort();
    result = '{' + keys.map(key =>
      JSON.stringify(key) + ':' + canonicalValue(value[key], seen)
    ).join(',') + '}';
  }
  seen.delete(value);
  return result;
}

function parseTag(tag) {
  const separator = tag.lastIndexOf('#');
  if (separator <= 0) throw new TypeError('invalid CRDT tag: ' + tag);
  const actor = tag.slice(0, separator);
  const counter = Number(tag.slice(separator + 1));
  if (!Number.isSafeInteger(counter) || counter < 1) {
    throw new TypeError('invalid CRDT counter in tag: ' + tag);
  }
  return { actor, counter };
}

class ObservedRemoveSet {
  constructor(actorId) {
    if (typeof actorId !== 'string' || actorId.length === 0) {
      throw new TypeError('actorId must be a non-empty string');
    }
    this.actorId = actorId;
    this.clock = new Map();
    this.adds = new Map();
    this.removed = new Set();
  }

  add(value) {
    const key = canonicalValue(value);
    const cloned = JSON.parse(key);
    const counter = (this.clock.get(this.actorId) || 0) + 1;
    this.clock.set(this.actorId, counter);
    const tag = this.actorId + '#' + counter;

    let entry = this.adds.get(key);
    if (!entry) {
      entry = { value: cloned, tags: new Set() };
      this.adds.set(key, entry);
    }
    entry.tags.add(tag);
    return tag;
  }

  remove(value) {
    const key = canonicalValue(value);
    const entry = this.adds.get(key);
    if (!entry) return 0;

    let newlyRemoved = 0;
    for (const tag of entry.tags) {
      if (!this.removed.has(tag)) {
        this.removed.add(tag);
        newlyRemoved++;
      }
    }
    return newlyRemoved;
  }

  has(value) {
    const entry = this.adds.get(canonicalValue(value));
    return Boolean(entry && Array.from(entry.tags).some(tag => !this.removed.has(tag)));
  }

  values() {
    return Array.from(this.adds.entries())
      .filter(([, entry]) => Array.from(entry.tags).some(tag => !this.removed.has(tag)))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, entry]) => JSON.parse(JSON.stringify(entry.value)));
  }

  get size() {
    let count = 0;
    for (const entry of this.adds.values()) {
      if (Array.from(entry.tags).some(tag => !this.removed.has(tag))) count++;
    }
    return count;
  }

  merge(other) {
    if (!(other instanceof ObservedRemoveSet)) {
      throw new TypeError('merge expects another ObservedRemoveSet');
    }

    for (const [actor, counter] of other.clock) {
      this.clock.set(actor, Math.max(this.clock.get(actor) || 0, counter));
    }
    for (const [key, incoming] of other.adds) {
      let local = this.adds.get(key);
      if (!local) {
        local = { value: JSON.parse(JSON.stringify(incoming.value)), tags: new Set() };
        this.adds.set(key, local);
      }
      for (const tag of incoming.tags) local.tags.add(tag);
    }
    for (const tag of other.removed) this.removed.add(tag);

    // A replica that merges its own actor's history must never reuse a tag.
    this.clock.set(
      this.actorId,
      Math.max(this.clock.get(this.actorId) || 0, other.clock.get(this.actorId) || 0)
    );
    return this;
  }

  vector() {
    const result = Object.fromEntries(this.clock);
    for (const tag of this.removed) {
      const parsed = parseTag(tag);
      result[parsed.actor] = Math.max(result[parsed.actor] || 0, parsed.counter);
    }
    return result;
  }

  compact(stableVector) {
    if (!stableVector || typeof stableVector !== 'object') {
      throw new TypeError('stableVector must be an actor-to-counter object');
    }
    const stable = (tag) => {
      const parsed = parseTag(tag);
      const observed = stableVector[parsed.actor] || 0;
      return Number.isSafeInteger(observed) && observed >= parsed.counter;
    };

    let compacted = 0;
    for (const [key, entry] of this.adds) {
      for (const tag of Array.from(entry.tags)) {
        if (this.removed.has(tag) && stable(tag)) {
          entry.tags.delete(tag);
          this.removed.delete(tag);
          compacted++;
        }
      }
      if (entry.tags.size === 0) this.adds.delete(key);
    }
    for (const tag of Array.from(this.removed)) {
      if (stable(tag)) {
        this.removed.delete(tag);
        compacted++;
      }
    }
    return compacted;
  }

  toJSON() {
    return {
      actorId: this.actorId,
      clock: Object.fromEntries(Array.from(this.clock).sort(([a], [b]) => a.localeCompare(b))),
      adds: Array.from(this.adds.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => ({
          key,
          value: JSON.parse(JSON.stringify(entry.value)),
          tags: Array.from(entry.tags).sort()
        })),
      removed: Array.from(this.removed).sort()
    };
  }

  static fromJSON(snapshot, actorId = snapshot.actorId) {
    if (!snapshot || !Array.isArray(snapshot.adds) || !Array.isArray(snapshot.removed)) {
      throw new TypeError('invalid OR-Set snapshot');
    }
    const set = new ObservedRemoveSet(actorId);
    for (const [actor, counter] of Object.entries(snapshot.clock || {})) {
      if (!Number.isSafeInteger(counter) || counter < 0) {
        throw new TypeError('invalid vector clock');
      }
      set.clock.set(actor, counter);
    }
    for (const item of snapshot.adds) {
      const key = canonicalValue(item.value);
      if (key !== item.key || !Array.isArray(item.tags)) {
        throw new TypeError('invalid add entry');
      }
      const entry = { value: JSON.parse(key), tags: new Set() };
      for (const tag of item.tags) {
        parseTag(tag);
        entry.tags.add(tag);
      }
      set.adds.set(key, entry);
    }
    for (const tag of snapshot.removed) {
      parseTag(tag);
      set.removed.add(tag);
    }
    return set;
  }
}

function runTests() {
  const alice = new ObservedRemoveSet('alice');
  const bob = new ObservedRemoveSet('bob');

  const aliceTag = alice.add('task');
  bob.merge(alice);
  const bobTag = bob.add('task');
  assert.equal(aliceTag, 'alice#1');
  assert.equal(bobTag, 'bob#1');

  // Alice removes only the add she has observed. Bob's concurrent add survives.
  assert.equal(alice.remove('task'), 1);
  bob.merge(alice);
  assert.equal(bob.has('task'), true);
  alice.merge(bob);
  assert.equal(alice.has('task'), true);

  // Once Alice has observed Bob's tag, her next remove removes both tags.
  assert.equal(alice.remove('task'), 1);
  bob.merge(alice);
  assert.equal(bob.has('task'), false);
  assert.equal(bob.size, 0);

  // A later add gets a fresh tag and is not hidden by older tombstones.
  const newTag = bob.add('task');
  assert.equal(newTag, 'bob#2');
  alice.merge(bob);
  assert.deepEqual(alice.values(), ['task']);

  const objectValue = { z: [2, 3], a: true };
  alice.add(objectValue);
  assert.equal(alice.has({ a: true, z: [2, 3] }), true);
  assert.deepEqual(alice.values().find(value => typeof value === 'object'), {
    a: true,
    z: [2, 3]
  });

  // Merge is idempotent and serialization preserves the replicated state.
  const snapshot = alice.toJSON();
  const replica = ObservedRemoveSet.fromJSON(snapshot, 'carol');
  const before = JSON.stringify(replica.toJSON());
  replica.merge(alice);
  assert.equal(JSON.stringify(replica.toJSON()), before);
  assert.deepEqual(replica.values(), alice.values());

  // Commutativity: merging A into B or B into A yields the same visible set.
  const left = new ObservedRemoveSet('left');
  const right = new ObservedRemoveSet('right');
  left.add('shared');
  right.add('shared');
  left.remove('shared');
  const leftFirst = ObservedRemoveSet.fromJSON(left.toJSON(), 'copy-a').merge(right);
  const rightFirst = ObservedRemoveSet.fromJSON(right.toJSON(), 'copy-b').merge(left);
  assert.deepEqual(leftFirst.values(), rightFirst.values());

  // Safe compaction removes stable tombstones, then a new add remains visible.
  const compacted = ObservedRemoveSet.fromJSON(bob.toJSON(), 'compactor');
  compacted.remove('task');
  const stable = compacted.vector();
  assert.ok(compacted.compact(stable) >= 1);
  assert.equal(compacted.has('task'), false);
  compacted.add('task');
  assert.equal(compacted.has('task'), true);

  assert.throws(() => alice.add({ bad: undefined }), TypeError);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => alice.add(cyclic), /cyclic/);
  assert.throws(() => alice.merge({}), TypeError);

  console.log('ObservedRemoveSet: all tests passed');
}

if (require.main === module) runTests();

module.exports = { ObservedRemoveSet, canonicalValue };
