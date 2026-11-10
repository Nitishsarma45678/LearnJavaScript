/**
 * Transactional State Store — atomic updates for JSON-like application state.
 *
 * A transaction edits a private draft. Successful, changed drafts commit once;
 * thrown errors, invalid data and stale expected versions leave state intact.
 * Subscribers receive ordered, immutable change snapshots. Re-entrant writes
 * are queued so every listener sees commits in version order.
 *
 * Run: node transactional-state-store.js
 */

"use strict";

const assert = require("node:assert/strict");

class VersionConflictError extends Error {
  constructor(expected, actual) {
    super("Expected store version " + expected + " but found " + actual);
    this.name = "VersionConflictError";
    this.expectedVersion = expected;
    this.actualVersion = actual;
  }
}

function assertJsonTree(value, seen = new Set(), path = "$") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object") throw new TypeError("Unsupported value at " + path);
  if (seen.has(value)) throw new TypeError("Cycles or shared references are not supported at " + path);
  seen.add(value);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(value, i)) {
        throw new TypeError("Sparse arrays are not supported at " + path);
      }
      assertJsonTree(value[i], seen, path + "[" + i + "]");
    }
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Only plain objects are supported at " + path);
    }
    for (const key of Object.keys(value)) {
      if (key === "__proto__" || key === "prototype" || key === "constructor") {
        throw new TypeError("Unsafe object key at " + path + "." + key);
      }
      assertJsonTree(value[key], seen, path + "." + key);
    }
  }
  seen.delete(value);
}

function cloneTree(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cloneTree);
  const copy = Object.create(Object.getPrototypeOf(value));
  for (const key of Object.keys(value)) {
    Object.defineProperty(copy, key, {
      value: cloneTree(value[key]),
      enumerable: true,
      writable: true,
      configurable: true
    });
  }
  return copy;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    if (keysA[i] !== keysB[i] || !deepEqual(a[keysA[i]], b[keysB[i]])) return false;
  }
  return true;
}

function normalizePath(path) {
  const parts = Array.isArray(path) ? path.slice() :
    typeof path === "string" ? path.split(".") : null;
  if (!parts || parts.length === 0) throw new TypeError("path must be a non-empty string or array");
  for (const part of parts) {
    if (typeof part !== "string" && !Number.isInteger(part)) {
      throw new TypeError("path segments must be strings or integer indices");
    }
    if (part === "" || part === "__proto__" || part === "prototype" || part === "constructor") {
      throw new TypeError("unsafe or empty path segment");
    }
  }
  return parts;
}

function parentAtPath(root, parts) {
  let parent = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!parent || typeof parent !== "object" || !Object.prototype.hasOwnProperty.call(parent, key)) {
      throw new Error("path does not exist before segment " + String(key));
    }
    parent = parent[key];
  }
  if (!parent || typeof parent !== "object") throw new Error("path parent is not an object");
  return { parent, key: parts[parts.length - 1] };
}

function setAtPath(root, path, value) {
  const parts = normalizePath(path);
  const { parent, key } = parentAtPath(root, parts);
  if (Array.isArray(parent) && typeof key === "number" && (key < 0 || key > parent.length)) {
    throw new RangeError("array index would create a sparse array");
  }
  parent[key] = cloneTree(value);
}

function deleteAtPath(root, path) {
  const parts = normalizePath(path);
  const { parent, key } = parentAtPath(root, parts);
  if (!Object.prototype.hasOwnProperty.call(parent, key)) return false;
  if (Array.isArray(parent) && Number.isInteger(Number(key))) {
    parent.splice(Number(key), 1);
  } else {
    delete parent[key];
  }
  return true;
}

function getAtPath(root, path) {
  const parts = normalizePath(path);
  let current = root;
  for (const key of parts) {
    if (!current || typeof current !== "object" ||
        !Object.prototype.hasOwnProperty.call(current, key)) {
      throw new Error("path does not exist: " + parts.join("."));
    }
    current = current[key];
  }
  return current;
}

function createTransactionalStore(initialState) {
  assertJsonTree(initialState);
  let state = cloneTree(initialState);
  let version = 0;
  let active = false;
  let dispatching = false;
  const listeners = new Set();
  const eventQueue = [];
  const listenerErrors = [];

  function publish(event) {
    eventQueue.push(event);
    if (dispatching) return;
    dispatching = true;
    try {
      while (eventQueue.length) {
        const next = eventQueue.shift();
        for (const listener of [...listeners]) {
          try {
            listener(next);
          } catch (error) {
            listenerErrors.push(error);
          }
        }
      }
    } finally {
      dispatching = false;
    }
  }

  function transact(mutator, { expectedVersion, label = "transaction" } = {}) {
    if (typeof mutator !== "function") throw new TypeError("mutator must be a function");
    if (active) throw new Error("nested transactions are not supported");
    if (expectedVersion !== undefined && expectedVersion !== version) {
      throw new VersionConflictError(expectedVersion, version);
    }

    const previous = state;
    const draft = cloneTree(state);
    let result;
    let event = null;
    active = true;
    try {
      result = mutator(draft);
      if (result && typeof result.then === "function") {
        throw new TypeError("transactions must be synchronous");
      }
      assertJsonTree(draft);
      if (!deepEqual(previous, draft)) {
        state = draft;
        version++;
        event = Object.freeze({
          version,
          label,
          previous: deepFreeze(cloneTree(previous)),
          current: deepFreeze(cloneTree(state))
        });
      }
    } finally {
      active = false;
    }

    if (event) publish(event);
    return { committed: Boolean(event), version, result };
  }

  return Object.freeze({
    get version() {
      return version;
    },

    snapshot() {
      return deepFreeze(cloneTree(state));
    },

    get(path) {
      return deepFreeze(cloneTree(getAtPath(state, path)));
    },

    transact,

    compareAndSwap(expectedVersion, mutator, label = "compare-and-swap") {
      return transact(mutator, { expectedVersion, label });
    },

    set(path, value, label = "set") {
      return transact(draft => setAtPath(draft, path, value), { label });
    },

    delete(path, label = "delete") {
      let deleted = false;
      const result = transact(draft => {
        deleted = deleteAtPath(draft, path);
      }, { label });
      return { ...result, deleted };
    },

    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("listener must be a function");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    takeListenerErrors() {
      return listenerErrors.splice(0);
    }
  });
}

function runTests() {
  const store = createTransactionalStore({
    profile: { name: "Ada", tags: ["math"] },
    count: 0
  });
  const events = [];
  const unsubscribe = store.subscribe(event => events.push(event));

  const first = store.set(["profile", "name"], "Grace", "rename");
  assert.equal(first.committed, true);
  assert.equal(store.version, 1);
  assert.equal(store.get("profile.name"), "Grace");
  assert.equal(events.length, 1);
  assert.equal(events[0].label, "rename");
  assert.equal(Object.isFrozen(events[0].current.profile), true);

  const noOp = store.transact(draft => { draft.count = 0; });
  assert.equal(noOp.committed, false);
  assert.equal(store.version, 1);

  assert.throws(() => store.transact(draft => {
    draft.profile.name = "Changed";
    draft.count = 99;
    throw new Error("abort transaction");
  }), /abort transaction/);
  assert.equal(store.get("profile.name"), "Grace");
  assert.equal(store.get("count"), 0);
  assert.equal(store.version, 1);

  assert.throws(() => store.compareAndSwap(0, draft => { draft.count++; }), VersionConflictError);
  const cas = store.compareAndSwap(1, draft => { draft.count++; }, "increment");
  assert.equal(cas.committed, true);
  assert.equal(store.get("count"), 1);

  const beforeInvalid = store.snapshot();
  assert.throws(() => store.transact(draft => { draft.bad = () => {}; }), /Unsupported value/);
  assert.deepEqual(store.snapshot(), beforeInvalid);
  assert.throws(() => store.set("profile.__proto__.polluted", true), /unsafe/);
  assert.throws(() => store.transact(async draft => { draft.count++; }), /synchronous/);

  const ordered = [];
  const reentrant = createTransactionalStore({ value: 0 });
  reentrant.subscribe(event => {
    ordered.push("A" + event.version);
    if (event.version === 1) reentrant.set("value", 2, "reentrant");
  });
  reentrant.subscribe(event => ordered.push("B" + event.version));
  reentrant.set("value", 1);
  assert.deepEqual(ordered, ["A1", "B1", "A2", "B2"]);
  assert.equal(reentrant.get("value"), 2);
  assert.equal(reentrant.version, 2);

  const list = createTransactionalStore({ items: ["a", "b", "c"] });
  assert.equal(list.delete(["items", 1]).deleted, true);
  assert.deepEqual(list.get("items"), ["a", "c"]);
  unsubscribe();
  assert.equal(store.takeListenerErrors().length, 0);

  console.log("TransactionalStateStore: all tests passed");
}

module.exports = {
  createTransactionalStore,
  VersionConflictError,
  assertJsonTree,
  setAtPath,
  deleteAtPath
};

if (require.main === module) runTests();
