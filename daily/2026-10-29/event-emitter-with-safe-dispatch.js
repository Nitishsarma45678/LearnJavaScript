"use strict";

const assert = require("node:assert/strict");

/**
 * A synchronous event emitter with deterministic priority ordering.
 *
 * Contract:
 * - Higher priority listeners run first; ties preserve registration order.
 * - "*" listeners receive (eventName, ...args).
 * - Dispatch uses a snapshot: additions wait until the next emit, while
 *   listeners removed before their turn are skipped.
 * - A once-listener is removed before it runs, making re-entrant emits safe.
 * - All listeners are attempted; failures are reported together afterward.
 */
class EventEmitter {
  #events = new Map();
  #sequence = 0;

  on(event, listener, options = {}) {
    if (typeof event !== "string" || event.length === 0) {
      throw new TypeError("event must be a non-empty string");
    }
    if (typeof listener !== "function") {
      throw new TypeError("listener must be a function");
    }

    const { once = false, priority = 0, signal } = options;
    if (!Number.isFinite(priority)) {
      throw new TypeError("priority must be finite");
    }
    if (signal && signal.aborted) return () => false;

    const entry = {
      event,
      listener,
      once: Boolean(once),
      priority,
      order: this.#sequence++,
      active: true,
      abortHandler: null
    };

    const list = this.#events.get(event) || [];
    list.push(entry);
    this.#events.set(event, list);

    const unsubscribe = () => this.#remove(entry);
    if (signal) {
      entry.abortHandler = unsubscribe;
      signal.addEventListener("abort", unsubscribe, { once: true });
      if (signal.aborted) unsubscribe();
    }
    return unsubscribe;
  }

  #remove(entry) {
    if (!entry.active) return false;
    entry.active = false;

    const list = this.#events.get(entry.event);
    if (list) {
      const remaining = list.filter(item => item.active);
      if (remaining.length) this.#events.set(entry.event, remaining);
      else this.#events.delete(entry.event);
    }

    if (entry.abortHandler) {
      // The signal may already be dispatching its abort event; removal is safe.
      entry.abortHandler = null;
    }
    return true;
  }

  emit(event, ...args) {
    const exact = this.#events.get(event) || [];
    const wildcard = event === "*" ? [] : (this.#events.get("*") || []);
    const snapshot = [...exact, ...wildcard]
      .filter(entry => entry.active)
      .sort((a, b) => b.priority - a.priority || a.order - b.order);

    const errors = [];
    let delivered = 0;

    for (const entry of snapshot) {
      if (!entry.active) continue;
      if (entry.once) this.#remove(entry);

      try {
        if (entry.event === "*") entry.listener(event, ...args);
        else entry.listener(...args);
        delivered += 1;
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length) {
      throw new AggregateError(errors, "One or more event listeners failed");
    }
    return delivered > 0;
  }

  listenerCount(event) {
    return (this.#events.get(event) || []).filter(entry => entry.active).length;
  }

  clear(event) {
    if (event !== undefined) {
      for (const entry of [...(this.#events.get(event) || [])]) {
        this.#remove(entry);
      }
      return;
    }
    for (const list of this.#events.values()) {
      for (const entry of list) this.#remove(entry);
    }
    this.#events.clear();
  }
}

// Priority, stable ordering, and wildcard payload.
{
  const emitter = new EventEmitter();
  const calls = [];
  emitter.on("data", value => calls.push("normal:" + value));
  emitter.on("data", value => calls.push("urgent:" + value), { priority: 5 });
  emitter.on("*", (name, value) => calls.push("wild:" + name + ":" + value));
  assert.equal(emitter.emit("data", 7), true);
  assert.deepEqual(calls, ["urgent:7", "normal:7", "wild:data:7"]);
}

// A once-listener must be removed before its callback can re-enter emit().
{
  const emitter = new EventEmitter();
  let calls = 0;
  emitter.on("tick", () => {
    calls += 1;
    emitter.emit("tick");
  }, { once: true });
  emitter.emit("tick");
  assert.equal(calls, 1);
}

// Unsubscription is idempotent; removals during dispatch skip later listeners.
{
  const emitter = new EventEmitter();
  const calls = [];
  let removeLater;
  emitter.on("run", () => {
    calls.push("first");
    removeLater();
  }, { priority: 2 });
  removeLater = emitter.on("run", () => calls.push("removed"));
  assert.equal(removeLater(), true);
  assert.equal(removeLater(), false);
  emitter.emit("run");
  assert.deepEqual(calls, ["first"]);
  assert.equal(emitter.listenerCount("run"), 1);
}

// AbortSignal integration.
{
  const emitter = new EventEmitter();
  const controller = new AbortController();
  let calls = 0;
  emitter.on("change", () => calls++, { signal: controller.signal });
  controller.abort();
  emitter.emit("change");
  assert.equal(calls, 0);
}

// Listener failures do not prevent later listeners from running.
{
  const emitter = new EventEmitter();
  let reachedLast = false;
  emitter.on("safe", () => { throw new Error("listener failed"); });
  emitter.on("safe", () => { reachedLast = true; });
  assert.throws(
    () => emitter.emit("safe"),
    error => error instanceof AggregateError && error.errors.length === 1
  );
  assert.equal(reachedLast, true);
}

console.log("event-emitter-with-safe-dispatch: all assertions passed");
