"use strict";

/**
 * Exercise: Build a small MVCC (multi-version concurrency control) key-value
 * store. Transactions read from a stable snapshot and publish all writes at
 * one commit version. Snapshot isolation detects write/write conflicts;
 * serializable mode additionally validates every key read by the transaction.
 *
 * Values must be structured-cloneable. Keys may be any Map key.
 */

const assert = require("node:assert/strict");

class WriteConflictError extends Error {
  constructor(key) {
    super("Concurrent transaction changed key: " + String(key));
    this.name = "WriteConflictError";
    this.key = key;
  }
}

function copy(value) {
  return value === undefined ? undefined : structuredClone(value);
}

class MVCCStore {
  constructor() {
    this._version = 0;
    this._history = new Map();
  }

  get version() {
    return this._version;
  }

  begin({ isolation = "snapshot" } = {}) {
    if (isolation !== "snapshot" && isolation !== "serializable") {
      throw new TypeError("isolation must be 'snapshot' or 'serializable'");
    }
    return new Transaction(this, this._version, isolation);
  }

  _readAt(key, version) {
    const history = this._history.get(key);
    if (!history) return { version: 0, deleted: true, value: undefined };

    // Histories are append-only and ordered by commit version.
    let low = 0;
    let high = history.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (history[mid].version <= version) low = mid + 1;
      else high = mid;
    }

    if (low === 0) return { version: 0, deleted: true, value: undefined };
    const record = history[low - 1];
    return {
      version: record.version,
      deleted: record.deleted,
      value: record.deleted ? undefined : copy(record.value)
    };
  }

  _latestVersion(key) {
    const history = this._history.get(key);
    return history ? history[history.length - 1].version : 0;
  }

  _commit(transaction) {
    const keysToValidate = transaction.isolation === "serializable"
      ? new Set([...transaction._reads.keys(), ...transaction._writes.keys()])
      : new Set(transaction._writes.keys());

    // Validate every key before changing any history: commit is atomic.
    for (const key of keysToValidate) {
      if (this._latestVersion(key) > transaction.snapshotVersion) {
        throw new WriteConflictError(key);
      }
    }

    if (transaction._writes.size === 0) return this._version;

    const commitVersion = ++this._version;
    for (const [key, write] of transaction._writes) {
      let history = this._history.get(key);
      if (!history) {
        history = [];
        this._history.set(key, history);
      }
      history.push({
        version: commitVersion,
        deleted: write.deleted,
        value: write.deleted ? undefined : copy(write.value)
      });
    }
    return commitVersion;
  }

  async runTransaction(work, { isolation = "snapshot", retries = 0 } = {}) {
    if (typeof work !== "function") throw new TypeError("work must be a function");
    if (!Number.isInteger(retries) || retries < 0) {
      throw new RangeError("retries must be a non-negative integer");
    }

    let attempt = 0;
    while (true) {
      const transaction = this.begin({ isolation });
      try {
        const result = await work(transaction);
        const version = transaction.commit();
        return { result, version, attempts: attempt + 1 };
      } catch (error) {
        if (transaction.status === "active") transaction.rollback();
        if (error instanceof WriteConflictError && attempt < retries) {
          attempt++;
          continue;
        }
        throw error;
      }
    }
  }
}

class Transaction {
  constructor(store, snapshotVersion, isolation) {
    this.store = store;
    this.snapshotVersion = snapshotVersion;
    this.isolation = isolation;
    this.status = "active";
    this._reads = new Map();
    this._writes = new Map();
  }

  _assertActive() {
    if (this.status !== "active") {
      throw new Error("Transaction is already " + this.status);
    }
  }

  get(key) {
    this._assertActive();

    if (this._writes.has(key)) {
      const pending = this._writes.get(key);
      return pending.deleted ? undefined : copy(pending.value);
    }

    const record = this.store._readAt(key, this.snapshotVersion);
    this._reads.set(key, record.version);
    return record.deleted ? undefined : record.value;
  }

  has(key) {
    this._assertActive();

    if (this._writes.has(key)) return !this._writes.get(key).deleted;
    const record = this.store._readAt(key, this.snapshotVersion);
    this._reads.set(key, record.version);
    return !record.deleted;
  }

  set(key, value) {
    this._assertActive();
    this._writes.set(key, { deleted: false, value: copy(value) });
    return this;
  }

  delete(key) {
    this._assertActive();
    const existed = this.has(key);
    this._writes.set(key, { deleted: true, value: undefined });
    return existed;
  }

  commit() {
    this._assertActive();
    try {
      const version = this.store._commit(this);
      this.status = "committed";
      return version;
    } catch (error) {
      this.status = "aborted";
      throw error;
    }
  }

  rollback() {
    this._assertActive();
    this._writes.clear();
    this.status = "rolled back";
  }
}

async function runTests() {
  const store = new MVCCStore();
  let seed = store.begin();
  seed.set("account", { balance: 100 }).set("flag", false);
  assert.equal(seed.commit(), 1);

  // Snapshot reads do not see commits made after begin().
  const oldSnapshot = store.begin();
  const updater = store.begin();
  updater.set("account", { balance: 125 });
  updater.commit();
  assert.deepEqual(oldSnapshot.get("account"), { balance: 100 });
  oldSnapshot.rollback();

  // A stale writer is rejected.
  const first = store.begin();
  const second = store.begin();
  first.get("account");
  second.set("account", { balance: 140 }).commit();
  first.set("account", { balance: 130 });
  assert.throws(() => first.commit(), WriteConflictError);
  assert.equal(first.status, "aborted");

  // Read-your-writes and deletion of a stored undefined are distinguishable.
  const local = store.begin();
  local.set("temporary", undefined);
  assert.equal(local.has("temporary"), true);
  assert.equal(local.get("temporary"), undefined);
  assert.equal(local.delete("temporary"), true);
  assert.equal(local.has("temporary"), false);
  local.rollback();

  // Validation happens before any write, so a conflict cannot partially commit.
  const atomic = store.begin();
  atomic.set("new-key", "must-not-appear").set("flag", true);
  const competing = store.begin();
  competing.set("flag", "changed elsewhere").commit();
  assert.throws(() => atomic.commit(), WriteConflictError);
  const checkAtomic = store.begin();
  assert.equal(checkAtomic.has("new-key"), false);
  checkAtomic.rollback();

  // Serializable isolation also detects read/write conflicts on read-only keys.
  const reader = store.begin({ isolation: "serializable" });
  assert.equal(reader.get("flag"), "changed elsewhere");
  const flagWriter = store.begin();
  flagWriter.set("flag", "new value").commit();
  reader.set("unrelated", 1);
  assert.throws(() => reader.commit(), WriteConflictError);

  // Retry reruns the callback against a fresh snapshot after a conflict.
  const counterSeed = store.begin();
  counterSeed.set("counter", 0).commit();
  let injected = false;
  let callbackRuns = 0;
  const outcome = await store.runTransaction(async tx => {
    callbackRuns++;
    const value = tx.get("counter");
    if (!injected) {
      injected = true;
      const concurrent = store.begin();
      concurrent.set("counter", value + 1).commit();
    }
    tx.set("counter", value + 1);
    return value + 1;
  }, { retries: 1 });
  assert.equal(callbackRuns, 2);
  assert.equal(outcome.attempts, 2);
  const finalRead = store.begin();
  assert.equal(finalRead.get("counter"), 2);
  finalRead.rollback();

  console.log("MVCC key-value store: all tests passed");
}

module.exports = { MVCCStore, Transaction, WriteConflictError };

if (require.main === module) {
  runTests().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
