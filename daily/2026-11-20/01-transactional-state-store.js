// Exercise: Build a transactional state store with bounded undo/redo history.
// Run: node daily/2026-11-20/01-transactional-state-store.js
// Requirements: isolated drafts, atomic commits, rollback on exceptions, and no
// history mutation when a transaction fails.

"use strict";
const assert = require("node:assert/strict");

function clone(value) {
  return structuredClone(value);
}

function createTransactionalStore(initialState, historyLimit = 50) {
  if (!initialState || typeof initialState !== "object" || Array.isArray(initialState)) {
    throw new TypeError("initialState must be a non-array object");
  }
  if (!Number.isInteger(historyLimit) || historyLimit < 1) {
    throw new RangeError("historyLimit must be a positive integer");
  }

  let state = clone(initialState);
  let undoStack = [];
  let redoStack = [];
  let inTransaction = false;

  function remember(stack, value) {
    stack.push(clone(value));
    if (stack.length > historyLimit) stack.shift();
  }

  return Object.freeze({
    getState() {
      return clone(state);
    },

    transact(mutator) {
      if (typeof mutator !== "function") throw new TypeError("mutator must be a function");
      if (inTransaction) throw new Error("nested transactions are not supported");

      const draft = clone(state);
      inTransaction = true;
      try {
        const result = mutator(draft);
        if (result && typeof result.then === "function") {
          throw new TypeError("transact accepts synchronous mutators only");
        }
        remember(undoStack, state);
        state = draft;
        redoStack = [];
        return result;
      } finally {
        inTransaction = false;
      }
    },

    undo() {
      if (inTransaction) throw new Error("cannot undo during a transaction");
      if (undoStack.length === 0) return false;
      remember(redoStack, state);
      state = undoStack.pop();
      return true;
    },

    redo() {
      if (inTransaction) throw new Error("cannot redo during a transaction");
      if (redoStack.length === 0) return false;
      remember(undoStack, state);
      state = redoStack.pop();
      return true;
    },

    get historyDepth() {
      return Object.freeze({ undo: undoStack.length, redo: redoStack.length });
    }
  });
}

// Example and tests.
const store = createTransactionalStore({ account: { balance: 100 }, tags: ["new"] }, 3);
store.transact(draft => {
  draft.account.balance -= 25;
  draft.tags.push("paid");
});
assert.deepEqual(store.getState(), { account: { balance: 75 }, tags: ["new", "paid"] });
assert.equal(store.undo(), true);
assert.equal(store.getState().account.balance, 100);
assert.equal(store.redo(), true);
assert.equal(store.getState().account.balance, 75);

assert.throws(() => store.transact(draft => {
  draft.account.balance = -999;
  throw new Error("validation failed");
}), /validation failed/);
assert.equal(store.getState().account.balance, 75, "failed transaction must not leak draft changes");

const snapshot = store.getState();
snapshot.account.balance = 0;
assert.equal(store.getState().account.balance, 75, "callers must not mutate internal state");
assert.equal(store.undo(), true);
store.transact(draft => { draft.account.balance = 120; });
assert.equal(store.redo(), false, "new commit invalidates redo history");
assert.throws(() => createTransactionalStore([], 2), /non-array object/);
assert.throws(() => createTransactionalStore({}, 0), /positive integer/);
console.log("transactional state store: all tests passed");
