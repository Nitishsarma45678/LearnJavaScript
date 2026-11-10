/*
 * MVCC Transactional Key-Value Store
 * ----------------------------------
 * A compact multi-version concurrency control engine. Readers retain a
 * stable snapshot while writers append new versions. Commits use optimistic
 * validation for point reads and writes; range scans use conservative
 * database-version validation to prevent phantom anomalies.
 *
 * Transactions are serializable under this validation policy. A conflicting
 * commit aborts and releases its snapshot. compact() retains the version
 * visible to the oldest active transaction plus every newer version.
 */

"use strict";

const assert = require("node:assert/strict");

class TransactionConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "TransactionConflictError";
  }
}

class MVCCStore {
  constructor() {
    this.version = 0;
    this.history = new Map();
    this.activeSnapshots = new Map();
    this.nextTransactionId = 1;
  }

  begin() {
    const id = this.nextTransactionId++;
    const snapshot = this.version;
    this.activeSnapshots.set(id, snapshot);
    return new MVCCTransaction(this, id, snapshot);
  }

  _latestVersion(key) {
    const list = this.history.get(key);
    return list && list.length ? list[list.length - 1].version : 0;
  }

  _readAt(key, snapshot) {
    const list = this.history.get(key);
    if (!list || list.length === 0) {
      return { found: false, value: undefined, version: 0 };
    }

    let low = 0;
    let high = list.length - 1;
    let answer = -1;

    while (low <= high) {
      const middle = (low + high) >>> 1;
      if (list[middle].version <= snapshot) {
        answer = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    if (answer === -1) {
      return { found: false, value: undefined, version: 0 };
    }

    const record = list[answer];
    return {
      found: !record.tombstone,
      value: record.tombstone ? undefined : record.value,
      version: record.version
    };
  }

  _finish(id) {
    this.activeSnapshots.delete(id);
  }

  compact() {
    const snapshots = Array.from(this.activeSnapshots.values());
    const oldestSnapshot = snapshots.length
      ? Math.min(...snapshots)
      : this.version;

    let removedVersions = 0;
    let removedKeys = 0;

    for (const [key, list] of this.history) {
      let baselineIndex = -1;
      for (let index = 0; index < list.length; index += 1) {
        if (list[index].version <= oldestSnapshot) {
          baselineIndex = index;
        } else {
          break;
        }
      }

      if (baselineIndex === -1) continue;

      const baseline = list[baselineIndex];
      const hasNewerVersions = baselineIndex < list.length - 1;

      if (baseline.tombstone && !hasNewerVersions) {
        removedVersions += list.length;
        removedKeys += 1;
        this.history.delete(key);
        continue;
      }

      if (baselineIndex > 0) {
        removedVersions += baselineIndex;
        this.history.set(key, list.slice(baselineIndex));
      }
    }

    return { removedVersions, removedKeys, oldestSnapshot };
  }

  historyFor(key) {
    return (this.history.get(key) || []).map(record => ({ ...record }));
  }
}

class MVCCTransaction {
  constructor(store, id, snapshot) {
    this.store = store;
    this.id = id;
    this.snapshot = snapshot;
    this.readSet = new Map();
    this.writes = new Map();
    this.rangeRead = false;
    this.closed = false;
  }

  _assertOpen() {
    if (this.closed) throw new Error("Transaction is already closed");
  }

  _assertKey(key) {
    if (typeof key !== "string") {
      throw new TypeError("This store accepts string keys only");
    }
  }

  _read(key) {
    this._assertOpen();
    this._assertKey(key);

    if (this.writes.has(key)) {
      const pending = this.writes.get(key);
      return {
        found: !pending.tombstone,
        value: pending.tombstone ? undefined : pending.value
      };
    }

    const visible = this.store._readAt(key, this.snapshot);
    this.readSet.set(key, visible.version);
    return visible;
  }

  get(key) {
    const result = this._read(key);
    return result.found ? result.value : undefined;
  }

  has(key) {
    return this._read(key).found;
  }

  set(key, value) {
    this._assertOpen();
    this._assertKey(key);
    this.writes.set(key, { value, tombstone: false });
    return this;
  }

  delete(key) {
    this._assertOpen();
    this._assertKey(key);
    this.writes.set(key, { value: undefined, tombstone: true });
    return this;
  }

  scan({ prefix = "", limit = Infinity } = {}) {
    this._assertOpen();
    if (typeof prefix !== "string") {
      throw new TypeError("scan prefix must be a string");
    }
    if (
      limit !== Infinity &&
      (!Number.isInteger(limit) || limit < 0)
    ) {
      throw new RangeError("scan limit must be a non-negative integer");
    }

    this.rangeRead = true;
    if (limit === 0) return [];

    const keys = new Set(this.store.history.keys());
    for (const key of this.writes.keys()) keys.add(key);

    const ordered = Array.from(keys)
      .filter(key => key.startsWith(prefix))
      .sort();

    const result = [];
    for (const key of ordered) {
      const visible = this._read(key);
      if (visible.found) {
        result.push([key, visible.value]);
        if (result.length >= limit) break;
      }
    }
    return result;
  }

  _abortConflict(message) {
    this.closed = true;
    this.store._finish(this.id);
    throw new TransactionConflictError(message);
  }

  commit() {
    this._assertOpen();

    for (const key of this.readSet.keys()) {
      if (this.store._latestVersion(key) > this.snapshot) {
        this._abortConflict("A key in the read set changed: " + key);
      }
    }

    for (const key of this.writes.keys()) {
      if (this.store._latestVersion(key) > this.snapshot) {
        this._abortConflict("A key in the write set changed: " + key);
      }
    }

    if (this.rangeRead && this.store.version > this.snapshot) {
      this._abortConflict("The store changed after a range scan");
    }

    if (this.writes.size === 0) {
      this.closed = true;
      this.store._finish(this.id);
      return this.store.version;
    }

    const commitVersion = this.store.version + 1;
    for (const [key, pending] of this.writes) {
      const list = this.store.history.get(key) || [];
      list.push({
        version: commitVersion,
        value: pending.value,
        tombstone: pending.tombstone
      });
      this.store.history.set(key, list);
    }

    this.store.version = commitVersion;
    this.closed = true;
    this.store._finish(this.id);
    return commitVersion;
  }

  rollback() {
    if (this.closed) return false;
    this.closed = true;
    this.store._finish(this.id);
    this.writes.clear();
    return true;
  }
}

function runTests() {
  const store = new MVCCStore();

  const seed = store.begin();
  seed.set("account:1", { balance: 100 });
  seed.set("account:2", { balance: 40 });
  assert.equal(seed.commit(), 1);

  // A transaction sees its original snapshot after a later commit.
  const oldReader = store.begin();
  assert.deepEqual(oldReader.get("account:1"), { balance: 100 });

  const update = store.begin();
  update.set("account:1", { balance: 125 });
  assert.equal(update.commit(), 2);
  assert.deepEqual(oldReader.get("account:1"), { balance: 100 });
  assert.throws(() => oldReader.commit(), TransactionConflictError);

  // Read/write conflict detection prevents a stale decision from committing.
  const stale = store.begin();
  assert.deepEqual(stale.get("account:1"), { balance: 125 });
  const concurrent = store.begin();
  concurrent.set("account:1", { balance: 150 }).commit();
  stale.set("audit:last-seen", 125);
  assert.throws(() => stale.commit(), /read set changed/);

  // Range validation detects phantoms, including inserts outside the prefix.
  const scanner = store.begin();
  assert.deepEqual(scanner.scan({ prefix: "user:" }), []);
  const inserter = store.begin();
  inserter.set("user:42", { name: "Ada" }).commit();
  scanner.set("audit:scan", true);
  assert.throws(() => scanner.commit(), /range scan/);

  // Snapshot reads survive compaction while the old transaction is active.
  const snapshot = store.begin();
  assert.deepEqual(snapshot.get("account:1"), { balance: 150 });
  const later = store.begin();
  later.set("account:1", { balance: 175 }).commit();

  const compacted = store.compact();
  assert.ok(compacted.removedVersions >= 1);
  assert.deepEqual(snapshot.get("account:1"), { balance: 150 });
  snapshot.rollback();

  // Tombstones hide deleted keys and can be reclaimed after old snapshots end.
  const deletion = store.begin();
  deletion.delete("account:2").commit();
  const reader = store.begin();
  assert.equal(reader.has("account:2"), false);
  reader.rollback();
  store.compact();
  assert.equal(store.history.has("account:2"), false);

  const ownWrites = store.begin();
  ownWrites.set("temporary", undefined);
  assert.equal(ownWrites.has("temporary"), true);
  assert.equal(ownWrites.get("temporary"), undefined);
  ownWrites.rollback();

  assert.throws(() => store.begin().set(7, "bad"), /string keys/);
  assert.equal(store.activeSnapshots.size, 0);

  console.log("MVCCStore: all tests passed");
}

module.exports = {
  MVCCStore,
  MVCCTransaction,
  TransactionConflictError
};

if (require.main === module) {
  runTests();
}