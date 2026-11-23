// Exercise: Adapt an EventTarget-style event source into an async iterator.
// Since EventTarget cannot pause its producer, implement explicit bounded-buffer
// overflow policies: error, drop-oldest, and drop-newest. Always clean up listeners.
//
// Run: node 16-async-event-source-iterator.js
const assert = require("node:assert/strict");

function createAbortError(reason) {
  const error = new Error(reason instanceof Error ? reason.message : "Event stream aborted");
  error.name = "AbortError";
  return error;
}

function fromEventTarget(target, eventName, options = {}) {
  if (!target || typeof target.addEventListener !== "function" ||
      typeof target.removeEventListener !== "function") {
    throw new TypeError("target must implement addEventListener/removeEventListener");
  }
  const highWaterMark = options.highWaterMark ?? 32;
  const overflow = options.overflow ?? "error";
  if (!Number.isInteger(highWaterMark) || highWaterMark < 1) {
    throw new RangeError("highWaterMark must be a positive integer");
  }
  if (!["error", "drop-oldest", "drop-newest"].includes(overflow)) {
    throw new TypeError("unknown overflow policy");
  }

  return {
    [Symbol.asyncIterator]() {
      const queue = [];
      const waiters = [];
      const signal = options.signal;
      let closed = false;
      let failure = null;

      const cleanup = () => {
        target.removeEventListener(eventName, onEvent);
        signal?.removeEventListener("abort", onAbort);
      };

      const close = (error = null) => {
        if (closed) return;
        closed = true;
        failure = error;
        cleanup();
        if (error) queue.length = 0;
        while (waiters.length) {
          const waiter = waiters.shift();
          if (error) waiter.reject(error);
          else waiter.resolve({ value: undefined, done: true });
        }
      };

      const onEvent = (event) => {
        if (closed) return;
        if (waiters.length) {
          waiters.shift().resolve({ value: event, done: false });
          return;
        }
        if (queue.length >= highWaterMark) {
          if (overflow === "drop-newest") return;
          if (overflow === "drop-oldest") queue.shift();
          else {
            close(new RangeError("event buffer exceeded highWaterMark"));
            return;
          }
        }
        queue.push(event);
      };

      const onAbort = () => close(createAbortError(signal.reason));
      target.addEventListener(eventName, onEvent);
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) onAbort();

      return {
        next() {
          if (queue.length) return Promise.resolve({ value: queue.shift(), done: false });
          if (failure) return Promise.reject(failure);
          if (closed) return Promise.resolve({ value: undefined, done: true });
          return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
        },
        return() {
          close();
          return Promise.resolve({ value: undefined, done: true });
        },
        throw(error) {
          close(error);
          return Promise.reject(error);
        },
        [Symbol.asyncIterator]() { return this; }
      };
    }
  };
}

// Example tests
class FakeTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(callback);
  }
  removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
  emit(name, value) {
    for (const callback of this.listeners.get(name) || []) callback({ detail: value });
  }
  listenerCount(name) { return this.listeners.get(name)?.size || 0; }
}

(async () => {
  const target = new FakeTarget();
  const iterator = fromEventTarget(target, "data")[Symbol.asyncIterator]();
  const pending = iterator.next();
  target.emit("data", 7);
  assert.equal((await pending).value.detail, 7);
  await iterator.return();
  assert.equal(target.listenerCount("data"), 0);

  const dropping = fromEventTarget(target, "data", {
    highWaterMark: 1, overflow: "drop-oldest"
  })[Symbol.asyncIterator]();
  target.emit("data", 1);
  target.emit("data", 2);
  assert.equal((await dropping.next()).value.detail, 2);
  await dropping.return();

  const bounded = fromEventTarget(target, "data", {
    highWaterMark: 1, overflow: "error"
  })[Symbol.asyncIterator]();
  target.emit("data", "first");
  target.emit("data", "overflow");
  await assert.rejects(bounded.next(), /exceeded/);
  assert.equal(target.listenerCount("data"), 0);
  console.log("event source iterator tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
