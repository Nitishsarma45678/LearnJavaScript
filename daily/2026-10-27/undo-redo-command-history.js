"use strict";
// A small command-history engine. Commands return new state objects, so snapshots
// remain stable at the top level; executing after undo discards the redo branch.
const assert = require("node:assert/strict");

function createHistory(initialState) {
  if (!initialState || typeof initialState !== "object" || Array.isArray(initialState)) {
    throw new TypeError("initialState must be a plain object-like state");
  }
  let state = { ...initialState };
  const past = [];
  const future = [];

  function validate(command) {
    if (!command || typeof command.apply !== "function" || typeof command.undo !== "function") {
      throw new TypeError("command must provide apply(state) and undo(state)");
    }
  }

  return {
    getState() { return state; },
    execute(command) {
      validate(command);
      const next = command.apply(state);
      if (!next || typeof next !== "object" || Array.isArray(next)) {
        throw new TypeError("command.apply must return a state object");
      }
      state = next;
      past.push(command);
      future.length = 0;
      return state;
    },
    undo() {
      if (!past.length) return false;
      const command = past.pop();
      try {
        state = command.undo(state);
        future.push(command);
        return true;
      } catch (error) {
        past.push(command);
        throw error;
      }
    },
    redo() {
      if (!future.length) return false;
      const command = future.pop();
      try {
        state = command.apply(state);
        past.push(command);
        return true;
      } catch (error) {
        future.push(command);
        throw error;
      }
    },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    get historyDepth() { return past.length; }
  };
}

function setKey(key, value) {
  let hadBefore = false;
  let before;
  return {
    apply(state) {
      hadBefore = Object.hasOwn(state, key);
      before = state[key];
      return { ...state, [key]: value };
    },
    undo(state) {
      const next = { ...state };
      if (hadBefore) next[key] = before;
      else delete next[key];
      return next;
    }
  };
}

function incrementKey(key, amount = 1) {
  if (!Number.isFinite(amount)) throw new TypeError("amount must be finite");
  return {
    apply(state) {
      const current = Object.hasOwn(state, key) ? state[key] : 0;
      if (typeof current !== "number" || !Number.isFinite(current)) {
        throw new TypeError("increment target must be a finite number");
      }
      return { ...state, [key]: current + amount };
    },
    undo(state) {
      const current = state[key];
      const next = { ...state };
      const previous = current - amount;
      if (previous === 0 && !Object.hasOwn(state, key)) delete next[key];
      else next[key] = previous;
      return next;
    }
  };
}

// Example tests
const history = createHistory({ title: "Draft", count: 1 });
const original = history.getState();
history.execute(setKey("title", "Published"));
history.execute(incrementKey("count", 4));
assert.deepEqual(history.getState(), { title: "Published", count: 5 });
assert.equal(history.undo(), true);
assert.deepEqual(history.getState(), { title: "Published", count: 1 });
assert.equal(history.canRedo, true);
assert.equal(history.redo(), true);
assert.deepEqual(history.getState(), { title: "Published", count: 5 });
history.undo();
history.execute(setKey("status", "new branch"));
assert.equal(history.canRedo, false);
assert.deepEqual(history.getState(), { title: "Published", count: 1, status: "new branch" });
assert.deepEqual(original, { title: "Draft", count: 1 });
assert.equal(history.undo(), true);
assert.equal(history.undo(), true);
assert.equal(history.undo(), false);
assert.equal(history.redo(), true);
assert.throws(() => history.execute({ apply: () => null, undo: () => ({}) }), /state object/);
console.log("Command history tests passed");
