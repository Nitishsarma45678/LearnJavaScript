// Exercise: Build a selector-based state store with batched notifications.
// Requirements:
// 1. Keep state private inside a closure and expose a read-only getState().
// 2. setState accepts an object patch or updater function; merge by default.
// 3. subscribe(selector, listener, equalityFn) only notifies when the selected
//    value changes. Return an idempotent unsubscribe function.
// 4. batch(fn) supports nesting and publishes one notification pass on exit.
// 5. Updates made by listeners must be processed in a later pass, not lost.
//
// Run: node 01-closure-selector-store-batching.js

const assert = require("node:assert/strict");

function createSelectorStore(initialState) {
  if (initialState === null || typeof initialState !== "object" || Array.isArray(initialState)) {
    throw new TypeError("initialState must be a non-array object");
  }

  let state = { ...initialState };
  let version = 0;
  let batchDepth = 0;
  let dirty = false;
  let flushing = false;
  const subscribers = new Set();

  function getState() {
    return state;
  }

  function setState(update, replace = false) {
    const patch = typeof update === "function" ? update(state) : update;
    if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
      throw new TypeError("state update must produce an object");
    }

    const next = replace ? patch : { ...state, ...patch };
    if (Object.keys(next).length === Object.keys(state).length &&
        Object.keys(next).every((key) => Object.is(next[key], state[key]))) {
      return state;
    }

    state = next;
    version += 1;
    dirty = true;
    if (batchDepth === 0) flush();
    return state;
  }

  function subscribe(selector, listener, equalityFn = Object.is, options = {}) {
    if (typeof selector !== "function" || typeof listener !== "function" ||
        typeof equalityFn !== "function") {
      throw new TypeError("selector, listener and equalityFn must be functions");
    }

    const entry = {
      selector,
      listener,
      equalityFn,
      selected: selector(state),
      active: true
    };
    subscribers.add(entry);

    if (options.immediate) listener(entry.selected, undefined, version);

    return function unsubscribe() {
      if (!entry.active) return false;
      entry.active = false;
      subscribers.delete(entry);
      return true;
    };
  }

  function flush() {
    if (flushing || batchDepth > 0 || !dirty) return;
    flushing = true;
    const errors = [];
    let passes = 0;

    try {
      while (dirty) {
        if (++passes > 1000) {
          throw new Error("notification loop exceeded 1000 passes");
        }
        dirty = false;

        for (const entry of Array.from(subscribers)) {
          if (!entry.active) continue;
          let selected;
          try {
            selected = entry.selector(state);
          } catch (error) {
            errors.push(error);
            continue;
          }

          if (!entry.equalityFn(entry.selected, selected)) {
            const previous = entry.selected;
            entry.selected = selected;
            try {
              entry.listener(selected, previous, version);
            } catch (error) {
              errors.push(error);
            }
          }
        }
      }
    } finally {
      flushing = false;
    }

    if (errors.length) throw new AggregateError(errors, "subscriber notification failed");
  }

  function batch(callback) {
    if (typeof callback !== "function") throw new TypeError("batch expects a function");
    batchDepth += 1;
    try {
      return callback();
    } finally {
      batchDepth -= 1;
      if (batchDepth === 0) flush();
    }
  }

  return Object.freeze({ getState, setState, subscribe, batch, getVersion: () => version });
}

// Example tests
{
  const store = createSelectorStore({ count: 0, theme: "light" });
  const seen = [];
  const unsubscribe = store.subscribe((s) => s.count, (next, previous) => {
    seen.push([next, previous]);
  });

  store.setState({ theme: "dark" }); // unrelated selector: no notification
  store.batch(() => {
    store.setState((s) => ({ count: s.count + 1 }));
    store.batch(() => store.setState({ count: 2 }));
    store.setState({ count: 3 });
  });
  assert.deepEqual(seen, [[3, 0]]);

  assert.equal(unsubscribe(), true);
  assert.equal(unsubscribe(), false);
  store.setState({ count: 4 });
  assert.equal(seen.length, 1);

  const reentrant = createSelectorStore({ value: 0 });
  const values = [];
  reentrant.subscribe((s) => s.value, (value) => {
    values.push(value);
    if (value === 1) reentrant.setState({ value: 2 });
  });
  reentrant.setState({ value: 1 });
  assert.deepEqual(values, [1, 2]);
  assert.equal(reentrant.getVersion(), 2);
}

console.log("selector store tests passed");
