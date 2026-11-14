/**
 * MVCC Document Store with Optimistic Serializable Transactions
 * -------------------------------------------------------------
 * A small in-memory key/value store that keeps version histories. Transactions
 * read from a stable snapshot, stage writes, and validate conflicts at commit.
 *
 * Features:
 * - snapshot reads and atomic multi-key commits
 * - read/write conflict detection (optimistic serializability)
 * - prefix scans with phantom-write detection
 * - rollback and history pruning that respects active snapshots
 *
 * Values must be structured-cloneable and must not be undefined.
 * Run: node mvcc-document-store.js
 */

'use strict';

const assert = require('node:assert/strict');

function cloneValue(value) {
  if (typeof structuredClone !== 'function') {
    throw new Error('This exercise requires a runtime with structuredClone');
  }
  return structuredClone(value);
}

function assertKey(key) {
  if (typeof key !== 'string') throw new TypeError('keys must be strings');
}

class TransactionConflictError extends Error {
  constructor(conflicts) {
    super('transaction could not be serialized: ' + conflicts.join(', '));
    this.name = 'TransactionConflictError';
    this.conflicts = conflicts;
  }
}

class MVCCStore {
  constructor() {
    this._version = 0;
    this._history = new Map();
    this._commitLog = [];
    this._nextTransactionId = 1;
    this._activeSnapshots = new Map();
  }

  get version() {
    return this._version;
  }

  begin() {
    const id = this._nextTransactionId++;
    const snapshotVersion = this._version;
    this._activeSnapshots.set(id, snapshotVersion);
    return new Transaction(this, id, snapshotVersion);
  }

  get(key) {
    assertKey(key);
    const entry = this._readAt(key, this._version);
    return entry.deleted ? undefined : cloneValue(entry.value);
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  _readAt(key, version) {
    const history = this._history.get(key);
    if (!history) return { version: 0, deleted: true, value: undefined };

    let low = 0;
    let high = history.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (history[middle].version <= version) low = middle + 1;
      else high = middle;
    }
    if (low === 0) return { version: 0, deleted: true, value: undefined };
    return history[low - 1];
  }

  _latestVersion(key) {
    const history = this._history.get(key);
    return history && history.length ? history[history.length - 1].version : 0;
  }

  _keysAt(version, prefix) {
    const result = [];
    for (const key of this._history.keys()) {
      if (!key.startsWith(prefix)) continue;
      if (!this._readAt(key, version).deleted) result.push(key);
    }
    return result;
  }

  _finish(transactionId) {
    this._activeSnapshots.delete(transactionId);
  }

  _commit(transaction) {
    transaction._assertActive();
    const conflicts = [];

    for (const [key, observedVersion] of transaction._readSet) {
      const latest = this._latestVersion(key);
      if (latest > transaction.snapshotVersion && latest !== observedVersion) {
        conflicts.push('read/write conflict on ' + JSON.stringify(key));
      }
    }

    for (const key of transaction._writeSet.keys()) {
      if (this._latestVersion(key) > transaction.snapshotVersion) {
        conflicts.push('write/write conflict on ' + JSON.stringify(key));
      }
    }

    for (const prefix of transaction._scanPrefixes) {
      for (const commit of this._commitLog) {
        if (
          commit.version > transaction.snapshotVersion &&
          commit.keys.some((key) => key.startsWith(prefix))
        ) {
          conflicts.push('phantom write in prefix ' + JSON.stringify(prefix));
          break;
        }
      }
    }

    if (conflicts.length > 0) {
      transaction._status = 'conflicted';
      this._finish(transaction.id);
      throw new TransactionConflictError([...new Set(conflicts)]);
    }

    if (transaction._writeSet.size === 0) {
      transaction._status = 'committed';
      this._finish(transaction.id);
      return { version: this._version, readOnly: true };
    }

    const commitVersion = this._version + 1;
    const changedKeys = [];

    // Validation is complete before this loop, so no partial write can escape.
    for (const [key, operation] of transaction._writeSet) {
      let history = this._history.get(key);
      if (!history) {
        history = [];
        this._history.set(key, history);
      }
      history.push({
        version: commitVersion,
        deleted: operation.deleted,
        value: operation.deleted ? undefined : cloneValue(operation.value)
      });
      changedKeys.push(key);
    }

    this._version = commitVersion;
    this._commitLog.push({ version: commitVersion, keys: changedKeys });
    transaction._status = 'committed';
    this._finish(transaction.id);
    return { version: commitVersion, readOnly: false };
  }

  pruneHistory() {
    const activeVersions = [...this._activeSnapshots.values()];
    const safeThrough = activeVersions.length
      ? Math.min(...activeVersions)
      : this._version;

    let removedEntries = 0;
    let removedKeys = 0;

    for (const [key, history] of this._history) {
      let lastAtOrBefore = -1;
      for (let i = 0; i < history.length; i += 1) {
        if (history[i].version <= safeThrough) lastAtOrBefore = i;
        else break;
      }

      if (lastAtOrBefore > 0) {
        const kept = history.slice(lastAtOrBefore);
        removedEntries += history.length - kept.length;
        this._history.set(key, kept);
      }

      const currentHistory = this._history.get(key);
      if (
        currentHistory.length === 1 &&
        currentHistory[0].deleted &&
        currentHistory[0].version <= safeThrough
      ) {
        this._history.delete(key);
        removedKeys += 1;
      }
    }

    return { safeThrough, removedEntries, removedKeys };
  }
}

class Transaction {
  constructor(store, id, snapshotVersion) {
    this.store = store;
    this.id = id;
    this.snapshotVersion = snapshotVersion;
    this._status = 'active';
    this._readSet = new Map();
    this._writeSet = new Map();
    this._scanPrefixes = new Set();
  }

  get status() {
    return this._status;
  }

  _assertActive() {
    if (this._status !== 'active') {
      throw new Error('transaction is ' + this._status);
    }
  }

  get(key) {
    this._assertActive();
    assertKey(key);

    if (this._writeSet.has(key)) {
      const staged = this._writeSet.get(key);
      return staged.deleted ? undefined : cloneValue(staged.value);
    }

    const entry = this.store._readAt(key, this.snapshotVersion);
    if (!this._readSet.has(key)) this._readSet.set(key, entry.version);
    return entry.deleted ? undefined : cloneValue(entry.value);
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  set(key, value) {
    this._assertActive();
    assertKey(key);
    if (value === undefined) throw new TypeError('undefined is reserved for missing keys');
    const copied = cloneValue(value);
    this._writeSet.set(key, { deleted: false, value: copied });
    return this;
  }

  delete(key) {
    this._assertActive();
    assertKey(key);
    const existed = this.has(key);
    this._writeSet.set(key, { deleted: true, value: undefined });
    return existed;
  }

  scan(prefix = '') {
    this._assertActive();
    if (typeof prefix !== 'string') throw new TypeError('prefix must be a string');
    this._scanPrefixes.add(prefix);

    const keys = new Set(this.store._keysAt(this.snapshotVersion, prefix));
    for (const key of this._writeSet.keys()) {
      if (key.startsWith(prefix)) keys.add(key);
    }

    const entries = [];
    for (const key of [...keys].sort()) {
      const value = this.get(key);
      if (value !== undefined) entries.push([key, value]);
    }
    return entries;
  }

  commit() {
    return this.store._commit(this);
  }

  rollback() {
    this._assertActive();
    this._status = 'rolled-back';
    this.store._finish(this.id);
  }
}

// ------------------------------ Example tests ------------------------------

function runTests() {
  const store = new MVCCStore();
  let tx = store.begin();
  tx.set('account:1', { balance: 100, tags: ['primary'] });
  tx.set('account:2', { balance: 40 });
  assert.deepEqual(tx.commit(), { version: 1, readOnly: false });

  const snapshot = store.begin();
  const writer = store.begin();
  assert.equal(snapshot.get('account:1').balance, 100);
  writer.set('account:1', { balance: 125, tags: ['primary'] });
  assert.equal(writer.commit().version, 2);
  assert.equal(snapshot.get('account:1').balance, 100);
  snapshot.rollback();
  assert.equal(store.get('account:1').balance, 125);

  const reader = store.begin();
  assert.equal(reader.get('account:2').balance, 40);
  const concurrent = store.begin();
  concurrent.set('account:2', { balance: 41 }).commit();
  reader.set('audit:1', { action: 'read account:2' });
  assert.throws(() => reader.commit(), TransactionConflictError);
  assert.equal(store.get('audit:1'), undefined);

  const scanner = store.begin();
  assert.deepEqual(scanner.scan('user:'), []);
  const inserter = store.begin();
  inserter.set('user:2', { name: 'Ada' }).commit();
  scanner.set('audit:2', { action: 'listed users' });
  assert.throws(() => scanner.commit(), /phantom write/);
  assert.equal(store.get('audit:2'), undefined);

  const atomicA = store.begin();
  const atomicB = store.begin();
  atomicA.set('left', 1).set('right', 1);
  atomicB.set('right', 2).commit();
  assert.throws(() => atomicA.commit(), TransactionConflictError);
  assert.equal(store.get('left'), undefined);
  assert.equal(store.get('right'), 2);

  const longReader = store.begin();
  longReader.get('account:1');
  const updater = store.begin();
  updater.set('account:1', { balance: 130 }).commit();
  const pruning = store.pruneHistory();
  assert.ok(pruning.safeThrough <= longReader.snapshotVersion);
  assert.equal(longReader.get('account:1').balance, 125);
  longReader.rollback();
  store.pruneHistory();

  const readOnly = store.begin();
  assert.equal(readOnly.get('missing'), undefined);
  assert.equal(readOnly.commit().readOnly, true);
  assert.throws(() => readOnly.get('missing'), /committed/);
  assert.throws(() => store.begin().set('bad', undefined), /undefined/);

  console.log('MVCC document store: all tests passed');
}

if (require.main === module) runTests();

module.exports = { MVCCStore, Transaction, TransactionConflictError };
