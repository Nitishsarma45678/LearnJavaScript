'use strict';

// Exercise: implement a closure-backed multi-version store. Transactions read a
// stable snapshot, buffer writes, and commit atomically unless a key they read
// or write has changed since their snapshot.

function createVersionedStore(initial = {}) {
  let version = 0;
  const snapshots = new Map([[0, new Map(Object.entries(initial))]]);
  const keyVersions = new Map(Object.keys(initial).map(key => [key, 0]));

  function begin(atVersion = version) {
    if (!snapshots.has(atVersion)) throw new RangeError('Unknown snapshot version');
    const base = snapshots.get(atVersion);
    const reads = new Set();
    const writes = new Map();
    let finished = false;

    function assertOpen() {
      if (finished) throw new Error('Transaction is already finished');
    }

    return {
      get(key) {
        assertOpen();
        reads.add(key);
        if (writes.has(key)) return writes.get(key);
        return base.get(key);
      },
      has(key) {
        assertOpen();
        reads.add(key);
        return writes.has(key) ? writes.get(key) !== DELETE : base.has(key);
      },
      set(key, value) {
        assertOpen();
        writes.set(key, value);
        return this;
      },
      delete(key) {
        assertOpen();
        writes.set(key, DELETE);
        return this;
      },
      commit() {
        assertOpen();
        finished = true;
        const touched = new Set([...reads, ...writes.keys()]);
        const conflicts = [...touched].filter(key => (keyVersions.get(key) ?? -1) > atVersion);
        if (conflicts.length) return { ok: false, conflicts, version };

        if (writes.size === 0) return { ok: true, version };
        const next = new Map(snapshots.get(version));
        version += 1;
        for (const [key, value] of writes) {
          if (value === DELETE) {
            next.delete(key);
            keyVersions.set(key, version);
          } else {
            next.set(key, value);
            keyVersions.set(key, version);
          }
        }
        snapshots.set(version, next);
        return { ok: true, version };
      },
      rollback() {
        assertOpen();
        finished = true;
        writes.clear();
      }
    };
  }

  const DELETE = Symbol('delete');
  return {
    begin,
    get version() { return version; },
    read(key, atVersion = version) {
      const snapshot = snapshots.get(atVersion);
      if (!snapshot) throw new RangeError('Unknown snapshot version');
      return snapshot.get(key);
    },
    snapshot(atVersion = version) {
      const snapshot = snapshots.get(atVersion);
      if (!snapshot) throw new RangeError('Unknown snapshot version');
      return Object.fromEntries(snapshot);
    }
  };
}

const assert = require('node:assert/strict');
const store = createVersionedStore({ balance: 100, status: 'open' });
const older = store.begin();
const writer = store.begin();
assert.equal(older.get('balance'), 100);
writer.set('balance', 80);
assert.deepEqual(writer.commit(), { ok: true, version: 1 });
older.set('balance', 95);
assert.deepEqual(older.commit(), { ok: false, conflicts: ['balance'], version: 1 });

const left = store.begin();
const right = store.begin();
left.set('status', 'pending');
right.set('note', 'audited');
assert.equal(left.commit().ok, true);
assert.equal(right.commit().ok, true, 'disjoint writes can both commit');
assert.deepEqual(store.snapshot(1), { balance: 80, status: 'open' });
assert.equal(store.read('note'), 'audited');
console.log('MVCC store tests passed');

module.exports = { createVersionedStore };
