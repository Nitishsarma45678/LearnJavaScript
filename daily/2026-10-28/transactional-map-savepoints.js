// A small transactional key-value store with nested savepoints.
// commit() keeps the current changes; rollback() restores the latest savepoint.
// Values are stored by reference, so rollback is shallow for object values.
// Run: node daily/2026-10-28/transactional-map-savepoints.js

"use strict";

const assert = require("node:assert/strict");

function createTransactionalMap(initialEntries = []) {
  const data = new Map(initialEntries);
  const savepoints = [];

  function requireSavepoint() {
    if (savepoints.length === 0) {
      throw new Error("no active transaction");
    }
  }

  return Object.freeze({
    get size() {
      return data.size;
    },
    get(key) {
      return data.get(key);
    },
    has(key) {
      return data.has(key);
    },
    set(key, value) {
      data.set(key, value);
      return this;
    },
    delete(key) {
      return data.delete(key);
    },
    entries() {
      return Array.from(data.entries());
    },
    begin() {
      savepoints.push(new Map(data));
      return savepoints.length;
    },
    commit() {
      requireSavepoint();
      savepoints.pop();
      return savepoints.length;
    },
    rollback() {
      requireSavepoint();
      const snapshot = savepoints.pop();
      data.clear();
      for (const [key, value] of snapshot) data.set(key, value);
      return savepoints.length;
    },
    get transactionDepth() {
      return savepoints.length;
    }
  });
}

const store = createTransactionalMap([["balance", 100], ["owner", "Ari"]]);
store.begin();
store.set("balance", 80).set("note", "outer");
store.begin();
store.set("balance", 20).delete("owner");
assert.equal(store.rollback(), 1);
assert.equal(store.get("balance"), 80);
assert.equal(store.get("owner"), "Ari");
assert.equal(store.has("note"), true);
assert.equal(store.commit(), 0);
assert.equal(store.get("balance"), 80);
assert.throws(() => store.rollback(), /no active transaction/);

store.begin();
store.set("temporary", true);
store.rollback();
assert.equal(store.has("temporary"), false);
assert.equal(store.transactionDepth, 0);

console.log("transactional-map-savepoints: all tests passed");
module.exports = { createTransactionalMap };
