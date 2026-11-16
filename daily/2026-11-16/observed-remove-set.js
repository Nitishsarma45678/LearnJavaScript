'use strict';

/**
 * Exercise: build an add-wins Observed-Remove Set (OR-Set) CRDT.
 *
 * Every add receives a globally unique dot (actor, counter). A remove records
 * only dots it has observed. Concurrent unseen adds therefore survive a
 * merge. State merge is associative, commutative and idempotent.
 *
 * Values are strings, booleans, or finite numbers so snapshots are portable
 * JSON. This is a state-based CRDT: replicas exchange complete snapshots.
 */
function encodeValue(value) {
  if (typeof value === 'string' || typeof value === 'boolean') {
    return `${typeof value}:${JSON.stringify(value)}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `number:${Object.is(value, -0) ? '0' : String(value)}`;
  }
  throw new TypeError('OR-Set values must be strings, booleans, or finite numbers');
}

function dot(actor, counter) {
  return JSON.stringify([actor, counter]);
}

class ObservedRemoveSet {
  constructor(actorId) {
    if (typeof actorId !== 'string' || actorId.length === 0) {
      throw new TypeError('actorId must be a non-empty string');
    }
    this.actorId = actorId;
    this.clock = new Map([[actorId, 0]]);
    this.entries = new Map(); // encoded value -> { value, tags: Set<string> }
    this.removed = new Set(); // tombstoned dots
  }

  _entry(value, create = false) {
    const key = encodeValue(value);
    let entry = this.entries.get(key);
    if (!entry && create) {
      entry = { value, tags: new Set() };
      this.entries.set(key, entry);
    }
    return entry;
  }

  add(value) {
    const entry = this._entry(value, true);
    const next = (this.clock.get(this.actorId) || 0) + 1;
    this.clock.set(this.actorId, next);
    entry.tags.add(dot(this.actorId, next));
    return this;
  }

  has(value) {
    const entry = this._entry(value);
    return Boolean(entry && [...entry.tags].some(tag => !this.removed.has(tag)));
  }

  remove(value) {
    const entry = this._entry(value);
    if (!entry) return this;
    for (const tag of entry.tags) this.removed.add(tag);
    return this;
  }

  values() {
    const result = [];
    for (const entry of this.entries.values()) {
      if ([...entry.tags].some(tag => !this.removed.has(tag))) result.push(entry.value);
    }
    return result;
  }

  get size() { return this.values().length; }

  merge(other) {
    if (!(other instanceof ObservedRemoveSet)) throw new TypeError('merge expects an ObservedRemoveSet');
    for (const [actor, count] of other.clock) {
      this.clock.set(actor, Math.max(this.clock.get(actor) || 0, count));
    }
    for (const [key, incoming] of other.entries) {
      let current = this.entries.get(key);
      if (!current) {
        current = { value: incoming.value, tags: new Set() };
        this.entries.set(key, current);
      }
      for (const tag of incoming.tags) current.tags.add(tag);
    }
    for (const tag of other.removed) this.removed.add(tag);
    return this;
  }

  cloneAs(actorId = this.actorId) {
    return ObservedRemoveSet.fromJSON(this.toJSON(), actorId);
  }

  toJSON() {
    return {
      version: 1,
      clock: [...this.clock].sort(([a], [b]) => a.localeCompare(b)),
      entries: [...this.entries.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, entry.value, [...entry.tags].sort()]),
      removed: [...this.removed].sort()
    };
  }

  static fromJSON(snapshot, actorId) {
    if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.clock) ||
        !Array.isArray(snapshot.entries) || !Array.isArray(snapshot.removed)) {
      throw new TypeError('invalid OR-Set snapshot');
    }
    const inferredActor = actorId || snapshot.clock[0]?.[0];
    const set = new ObservedRemoveSet(inferredActor || 'restored');
    set.clock = new Map(snapshot.clock.map(([actor, count]) => {
      if (typeof actor !== 'string' || !Number.isSafeInteger(count) || count < 0) {
        throw new TypeError('invalid vector clock entry');
      }
      return [actor, count];
    }));
    for (const [key, value, tags] of snapshot.entries) {
      if (encodeValue(value) !== key || !Array.isArray(tags)) throw new TypeError('invalid entry');
      set.entries.set(key, { value, tags: new Set(tags) });
    }
    set.removed = new Set(snapshot.removed);
    return set;
  }
}

module.exports = { ObservedRemoveSet };

if (require.main === module) {
  const assert = require('node:assert/strict');
  const alice = new ObservedRemoveSet('alice');
  const bob = new ObservedRemoveSet('bob');
  alice.add('shared').add(7).add(true);
  bob.merge(alice);
  assert.deepEqual(new Set(bob.values()), new Set(['shared', 7, true]));

  // An observed remove deletes the old dot on every replica after merge.
  alice.remove('shared');
  bob.merge(alice);
  assert.equal(bob.has('shared'), false);

  // A concurrent add not seen by the remover survives: add-wins semantics.
  const left = new ObservedRemoveSet('left');
  const right = new ObservedRemoveSet('right');
  left.add('x');
  right.merge(left);
  left.remove('x');
  right.add('x'); // a new dot unknown to left
  left.merge(right);
  right.merge(left);
  assert.equal(left.has('x'), true);
  assert.equal(right.has('x'), true);
  assert.deepEqual(left.toJSON(), right.toJSON());

  // Merge is idempotent and order-independent for independent snapshots.
  const a = new ObservedRemoveSet('a').add('one');
  const b = new ObservedRemoveSet('b').add('two');
  const c1 = a.cloneAs('c').merge(b);
  const c2 = b.cloneAs('c').merge(a);
  assert.deepEqual(c1.values().sort(), c2.values().sort());
  c1.merge(c1);
  assert.equal(c1.size, 2);

  const restored = ObservedRemoveSet.fromJSON(c1.toJSON(), 'restored');
  restored.add('three');
  assert.equal(restored.has('three'), true);
  assert.throws(() => alice.add({ bad: true }), TypeError);
  assert.throws(() => ObservedRemoveSet.fromJSON({}), TypeError);
  console.log('Observed-Remove Set tests passed');
}
