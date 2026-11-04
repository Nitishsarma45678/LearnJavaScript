"use strict";

const assert = require("node:assert/strict");

/**
 * Educational in-memory Log-Structured Merge Tree.
 *
 * Writes land in a mutable memtable. flush() freezes it into a sorted
 * immutable run; reads select the record with the greatest sequence number.
 * Deletes are represented by tombstones so that older runs cannot resurrect
 * deleted keys. compact() merges every run and can then discard tombstones.
 *
 * Keys are strings. Undefined is reserved to mean "not found".
 */
class LSMTree {
  constructor({ maxMemEntries = 4 } = {}) {
    if (!Number.isInteger(maxMemEntries) || maxMemEntries < 1) {
      throw new RangeError("maxMemEntries must be a positive integer");
    }

    this.maxMemEntries = maxMemEntries;
    this.memtable = new Map();
    this.runs = []; // Newest run first; each run is sorted by key.
    this.sequence = 0;
  }

  _validateKey(key) {
    if (typeof key !== "string") {
      throw new TypeError("keys must be strings");
    }
  }

  put(key, value) {
    this._validateKey(key);
    if (value === undefined) {
      throw new TypeError("undefined is reserved for missing values");
    }

    const sequence = ++this.sequence;
    this.memtable.set(key, { sequence, value, deleted: false });
    if (this.memtable.size >= this.maxMemEntries) this.flush();
    return sequence;
  }

  delete(key) {
    this._validateKey(key);

    const sequence = ++this.sequence;
    this.memtable.set(key, { sequence, value: undefined, deleted: true });
    if (this.memtable.size >= this.maxMemEntries) this.flush();
    return sequence;
  }

  _findInRun(run, key) {
    let low = 0;
    let high = run.length - 1;

    while (low <= high) {
      const middle = (low + high) >> 1;
      const entry = run[middle];

      if (entry.key === key) return entry;
      if (entry.key < key) low = middle + 1;
      else high = middle - 1;
    }

    return undefined;
  }

  _latestRecord(key) {
    let latest = this.memtable.get(key);

    for (const run of this.runs) {
      const candidate = this._findInRun(run, key);
      if (candidate && (!latest || candidate.sequence > latest.sequence)) {
        latest = candidate;
      }
    }

    return latest;
  }

  get(key) {
    this._validateKey(key);
    const record = this._latestRecord(key);
    return !record || record.deleted ? undefined : record.value;
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  flush() {
    if (this.memtable.size === 0) return false;

    const run = Array.from(this.memtable, ([key, record]) => ({
      key,
      sequence: record.sequence,
      value: record.value,
      deleted: record.deleted
    })).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

    this.runs.unshift(run);
    this.memtable.clear();
    return true;
  }

  compact() {
    if (this.runs.length === 0) return false;

    const newestByKey = new Map();
    for (const run of this.runs) {
      for (const entry of run) {
        const previous = newestByKey.get(entry.key);
        if (!previous || entry.sequence > previous.sequence) {
          newestByKey.set(entry.key, entry);
        }
      }
    }

    // All immutable runs are being merged, so no older disk run can require
    // a tombstone after this point. Newer memtable entries remain separate.
    const compacted = Array.from(newestByKey.values())
      .filter(entry => !entry.deleted)
      .sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

    this.runs = compacted.length === 0 ? [] : [compacted];
    return true;
  }

  /**
   * Returns [key, value] pairs in lexicographic key order.
   * start is inclusive; end is exclusive.
   */
  scan({ start, end, limit = Infinity } = {}) {
    if (start !== undefined) this._validateKey(start);
    if (end !== undefined) this._validateKey(end);
    if (!(limit === Infinity || (Number.isInteger(limit) && limit >= 0))) {
      throw new RangeError("limit must be a non-negative integer or Infinity");
    }
    if (limit === 0) return [];

    const keys = new Set(this.memtable.keys());
    for (const run of this.runs) {
      for (const entry of run) keys.add(entry.key);
    }

    const ordered = Array.from(keys)
      .filter(key =>
        (start === undefined || key >= start) &&
        (end === undefined || key < end)
      )
      .sort();

    const result = [];
    for (const key of ordered) {
      const record = this._latestRecord(key);
      if (record && !record.deleted) {
        result.push([key, record.value]);
        if (result.length === limit) break;
      }
    }

    return result;
  }

  stats() {
    return {
      memtableEntries: this.memtable.size,
      runCount: this.runs.length,
      runEntries: this.runs.reduce((sum, run) => sum + run.length, 0),
      sequence: this.sequence
    };
  }
}

// Example workload spanning multiple flushes, overwrites and tombstones.
const store = new LSMTree({ maxMemEntries: 3 });
store.put("alpha", 1);
store.put("beta", 2);
store.put("gamma", 3); // Automatic flush.
assert.equal(store.stats().runCount, 1);

store.put("alpha", 10);
store.delete("beta");
store.put("delta", 4); // A second run.
assert.equal(store.get("alpha"), 10);
assert.equal(store.get("beta"), undefined);
assert.equal(store.get("gamma"), 3);
assert.equal(store.has("delta"), true);

assert.deepEqual(store.scan(), [
  ["alpha", 10],
  ["delta", 4],
  ["gamma", 3]
]);
assert.deepEqual(store.scan({ start: "delta", end: "z" }), [
  ["delta", 4],
  ["gamma", 3]
]);
assert.deepEqual(store.scan({ limit: 1 }), [["alpha", 10]]);

assert.equal(store.compact(), true);
assert.equal(store.stats().runCount, 1);
assert.equal(store.get("beta"), undefined);
assert.deepEqual(store.scan(), [
  ["alpha", 10],
  ["delta", 4],
  ["gamma", 3]
]);

store.delete("gamma");
store.flush();
store.put("gamma", 30); // A newer memtable value shadows the disk tombstone.
assert.equal(store.get("gamma"), 30);
assert.equal(store.flush(), true);
store.compact();
assert.equal(store.get("gamma"), 30);

assert.equal(store.flush(), false);
assert.equal(store.compact(), true);
assert.throws(() => store.put("bad", undefined), TypeError);
assert.throws(() => store.scan({ limit: -1 }), RangeError);

console.log("LSMTree tests passed.");

module.exports = { LSMTree };
