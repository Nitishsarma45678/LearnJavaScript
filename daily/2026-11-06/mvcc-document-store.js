'use strict';

// Multi-version document store with snapshot reads, optimistic conflict
// validation, atomic commits and history compaction.
function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error((message || "Values differ") +
    ": expected " + String(expected) + ", got " + String(actual));
}
function deepEqual(actual, expected, message) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error((message || "Objects differ") + ": " + a + " !== " + b);
}
class ConflictError extends Error {
  constructor(key) {
    super("transaction conflict on key " + String(key));
    this.name = "ConflictError"; this.key = key;
  }
}
const DELETE = Symbol("delete");
function cloneDocument(value, ancestors = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object") throw new TypeError("documents must contain JSON-like values");
  if (ancestors.has(value)) throw new TypeError("cyclic documents are not supported");
  const isArray = Array.isArray(value), prototype = Object.getPrototypeOf(value);
  if (!isArray && prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("only plain objects and arrays are supported");
  }
  ancestors.add(value);
  const copy = isArray ? [] : Object.create(prototype);
  for (const key of Object.keys(value)) {
    Object.defineProperty(copy, key, {
      value: cloneDocument(value[key], ancestors),
      enumerable: true, writable: true, configurable: true
    });
  }
  ancestors.delete(value);
  return copy;
}
class MVCCStore {
  constructor() {
    this.revision = 0; this.records = new Map();
    this.activeSnapshots = new Map(); this.nextTransactionId = 1;
  }
  begin() {
    const id = this.nextTransactionId++;
    const tx = new Transaction(this, id, this.revision);
    this.activeSnapshots.set(id, tx.snapshot); return tx;
  }
  get(key) {
    const version = this._readVersion(key, this.revision);
    return version.deleted ? undefined : cloneDocument(version.value);
  }
  _history(key) { return this.records.get(key) || []; }
  _latestVersion(key) {
    const history = this._history(key);
    return history.length ? history[history.length - 1].revision : 0;
  }
  _readVersion(key, snapshot) {
    const history = this._history(key);
    let low = 0, high = history.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (history[mid].revision <= snapshot) low = mid + 1;
      else high = mid;
    }
    if (low === 0) return { revision: 0, deleted: true, value: undefined };
    return history[low - 1];
  }
  _finish(tx) {
    this.activeSnapshots.delete(tx.id); tx.active = false;
  }
  _commit(tx) {
    tx._assertActive();
    for (const [key, observedRevision] of tx.readSet) {
      if (this._latestVersion(key) !== observedRevision) {
        this._finish(tx); throw new ConflictError(key);
      }
    }
    for (const key of tx.writes.keys()) {
      if (this._latestVersion(key) > tx.snapshot) {
        this._finish(tx); throw new ConflictError(key);
      }
    }
    const prepared = [];
    for (const [key, value] of tx.writes) {
      prepared.push({
        key, deleted: value === DELETE,
        value: value === DELETE ? undefined : cloneDocument(value)
      });
    }
    if (!prepared.length) {
      this._finish(tx); return tx.snapshot;
    }
    const revision = ++this.revision;
    for (const item of prepared) {
      const history = this.records.get(item.key) || [];
      history.push({ revision, deleted: item.deleted, value: item.value });
      this.records.set(item.key, history);
    }
    this._finish(tx); return revision;
  }
  compact() {
    const snapshots = Array.from(this.activeSnapshots.values());
    const oldestSnapshot = snapshots.length ? Math.min(...snapshots) : this.revision;
    let removed = 0;
    for (const [key, history] of this.records) {
      let baseline = -1;
      for (let i = 0; i < history.length; i++) {
        if (history[i].revision <= oldestSnapshot) baseline = i;
        else break;
      }
      if (baseline > 0) {
        removed += baseline; this.records.set(key, history.slice(baseline));
      }
    }
    return removed;
  }
}
class Transaction {
  constructor(store, id, snapshot) {
    this.store = store; this.id = id; this.snapshot = snapshot;
    this.readSet = new Map(); this.writes = new Map(); this.active = true;
  }
  _assertActive() {
    if (!this.active) throw new Error("transaction is no longer active");
  }
  get(key) {
    this._assertActive();
    if (this.writes.has(key)) {
      const value = this.writes.get(key);
      return value === DELETE ? undefined : cloneDocument(value);
    }
    const version = this.store._readVersion(key, this.snapshot);
    if (!this.readSet.has(key)) this.readSet.set(key, version.revision);
    return version.deleted ? undefined : cloneDocument(version.value);
  }
  has(key) { return this.get(key) !== undefined; }
  set(key, value) {
    this._assertActive(); this.writes.set(key, cloneDocument(value)); return this;
  }
  delete(key) {
    this._assertActive();
    const existed = this.get(key) !== undefined;
    this.writes.set(key, DELETE); return existed;
  }
  commit() { this._assertActive(); return this.store._commit(this); }
  rollback() { this._assertActive(); this.store._finish(this); }
}
function runTests() {
  const store = new MVCCStore();
  const seed = store.begin();
  seed.set("account", { balance: 100, tags: ["starter"] });
  seed.set("profile", { name: "Ada" });
  equal(seed.commit(), 1);
  const oldSnapshot = store.begin();
  deepEqual(oldSnapshot.get("account"), { balance: 100, tags: ["starter"] });
  const update = store.begin();
  update.set("account", { balance: 125, tags: ["starter", "bonus"] });
  equal(update.commit(), 2);
  deepEqual(oldSnapshot.get("account"), { balance: 100, tags: ["starter"] });
  oldSnapshot.rollback();
  deepEqual(store.get("account"), { balance: 125, tags: ["starter", "bonus"] });
  equal(store.get("missing"), undefined);

  const reader = store.begin(); reader.get("profile");
  const writer = store.begin(); writer.set("profile", { name: "Grace" }); writer.commit();
  reader.set("audit", { action: "read-profile" });
  let readConflict = false;
  try { reader.commit(); } catch (error) { readConflict = error instanceof ConflictError; }
  assert(readConflict); equal(store.get("audit"), undefined);

  const first = store.begin(), second = store.begin();
  first.set("counter", { value: 1 }); first.commit();
  second.set("counter", { value: 2 });
  let writeConflict = false;
  try { second.commit(); } catch (error) { writeConflict = error instanceof ConflictError; }
  assert(writeConflict);

  const deletion = store.begin(); assert(deletion.delete("profile")); deletion.commit();
  equal(store.get("profile"), undefined);
  const beforeCompact = store.records.get("account").length;
  const removed = store.compact();
  assert(removed > 0 && store.records.get("account").length < beforeCompact);
  const bad = store.begin(); let invalidRejected = false;
  try { bad.set("bad", { nested: 1n }); }
  catch (error) { invalidRejected = error instanceof TypeError; }
  assert(invalidRejected); bad.rollback();
  console.log("MVCC document store: all tests passed");
}
if (typeof module !== "undefined" && require.main === module) runTests();
if (typeof module !== "undefined") module.exports = { MVCCStore, Transaction, ConflictError };