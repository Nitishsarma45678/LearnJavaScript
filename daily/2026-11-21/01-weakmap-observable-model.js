// Exercise: Build an observable model whose internal state cannot be accessed directly.
// Requirements: private state, change subscriptions, deletion, snapshots, nested batching,
// and safe handling of listeners that update the model while notifications are being flushed.

const privateState = new WeakMap();

function createObservableModel(initialState = {}) {
  const api = Object.create(null);
  const state = {
    data: { ...initialState },
    listeners: new Set(),
    pending: new Map(),
    batchDepth: 0,
    flushing: false
  };
  privateState.set(api, state);

  function flush() {
    if (state.flushing || state.batchDepth > 0) return;
    state.flushing = true;
    const errors = [];
    try {
      while (state.pending.size > 0) {
        const changes = [...state.pending.entries()];
        state.pending.clear();
        for (const [key, change] of changes) {
          const event = Object.freeze({
            key,
            value: change.value,
            previous: change.previous,
            deleted: change.deleted,
            snapshot: Object.freeze({ ...state.data })
          });
          for (const listener of [...state.listeners]) {
            try {
              listener(event);
            } catch (error) {
              errors.push(error);
            }
          }
        }
      }
    } finally {
      state.flushing = false;
    }
    if (errors.length) throw new AggregateError(errors, "One or more model listeners failed");
  }

  function record(key, previous, value, deleted = false) {
    const existing = state.pending.get(key);
    state.pending.set(key, {
      previous: existing ? existing.previous : previous,
      value,
      deleted
    });
    flush();
  }

  Object.defineProperties(api, {
    get: {
      value(key) {
        return state.data[key];
      }
    },
    has: {
      value(key) {
        return Object.prototype.hasOwnProperty.call(state.data, key);
      }
    },
    set: {
      value(key, value) {
        const previous = state.data[key];
        if (Object.is(previous, value) && this.has(key)) return false;
        state.data[key] = value;
        record(key, previous, value);
        return true;
      }
    },
    delete: {
      value(key) {
        if (!this.has(key)) return false;
        const previous = state.data[key];
        delete state.data[key];
        record(key, previous, undefined, true);
        return true;
      }
    },
    subscribe: {
      value(listener) {
        if (typeof listener !== "function") throw new TypeError("listener must be a function");
        state.listeners.add(listener);
        return () => state.listeners.delete(listener);
      }
    },
    batch: {
      value(callback) {
        if (typeof callback !== "function") throw new TypeError("callback must be a function");
        state.batchDepth++;
        try {
          return callback(this);
        } finally {
          state.batchDepth--;
          flush();
        }
      }
    },
    snapshot: {
      value() {
        return Object.freeze({ ...state.data });
      }
    }
  });

  return Object.freeze(api);
}

// Tests
const assert = require("node:assert/strict");
const model = createObservableModel({ count: 0, label: "draft" });
const events = [];
const unsubscribe = model.subscribe(event => events.push(event));

model.batch(() => {
  model.set("count", 1);
  model.set("count", 2);
  model.set("label", "ready");
});
assert.equal(events.length, 2);
assert.equal(events.find(event => event.key === "count").previous, 0);
assert.equal(events.find(event => event.key === "count").value, 2);

model.set("count", 3);
assert.equal(events.length, 3);
assert.equal(model.snapshot().count, 3);
assert.equal(model.delete("label"), true);
assert.equal(model.has("label"), false);
unsubscribe();
model.set("count", 4);
assert.equal(events.length, 4);

// Re-entrant writes are delivered in a subsequent flush cycle, not lost.
const reentrant = createObservableModel({ value: 0 });
const seen = [];
reentrant.subscribe(({ value }) => {
  seen.push(value);
  if (value === 1) reentrant.set("value", 2);
});
reentrant.set("value", 1);
assert.deepEqual(seen, [1, 2]);

console.log("observable model tests passed");
