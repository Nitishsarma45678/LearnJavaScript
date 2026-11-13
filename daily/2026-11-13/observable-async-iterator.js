/**
 * Observable Async Iterator
 * -------------------------
 * Adapt push-based event sources to the AsyncIterator protocol while keeping
 * memory bounded. Consumers pull with for-await; producers push independently.
 *
 * Overflow policies:
 *   - "drop-oldest": discard the oldest buffered item and retain the new one.
 *   - "drop-newest": retain the buffer and discard the new item.
 *   - "error": fail the iterator and reject pending/future reads.
 *
 * Closing drains already-buffered values. Failing discards them immediately.
 */

function createAsyncQueue({
  capacity = 32,
  overflow = "error",
  signal,
  onClose
} = {}) {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError("capacity must be a positive integer");
  }
  if (!["drop-oldest", "drop-newest", "error"].includes(overflow)) {
    throw new RangeError("unknown overflow policy");
  }

  const buffer = [];
  const readers = [];
  let closed = false;
  let failure = null;
  let cleanupCalled = false;

  const cleanup = () => {
    if (cleanupCalled) return;
    cleanupCalled = true;
    if (signal) signal.removeEventListener("abort", onAbort);
    if (typeof onClose === "function") onClose();
  };

  const abortError = () => {
    const error = new Error("The async iterator was aborted");
    error.name = "AbortError";
    return error;
  };

  const onAbort = () => fail(abortError());

  function push(value) {
    if (closed) return false;

    while (readers.length > 0) {
      const reader = readers.shift();
      if (!reader.cancelled) {
        reader.resolve({ value, done: false });
        return true;
      }
    }

    if (buffer.length < capacity) {
      buffer.push(value);
      return true;
    }

    if (overflow === "drop-newest") return false;
    if (overflow === "drop-oldest") {
      buffer.shift();
      buffer.push(value);
      return true;
    }

    fail(new RangeError("Async iterator buffer capacity exceeded"));
    return false;
  }

  function close() {
    if (closed) return;
    closed = true;
    cleanup();
    while (readers.length > 0) {
      const reader = readers.shift();
      if (!reader.cancelled) reader.resolve({ value: undefined, done: true });
    }
  }

  function fail(error) {
    if (closed) return;
    if (!(error instanceof Error)) error = new Error(String(error));
    closed = true;
    failure = error;
    buffer.length = 0;
    cleanup();
    while (readers.length > 0) {
      const reader = readers.shift();
      if (!reader.cancelled) reader.reject(error);
    }
  }

  const iterator = {
    push,
    close,
    fail,

    get size() {
      return buffer.length;
    },

    get closed() {
      return closed;
    },

    next() {
      if (failure) return Promise.reject(failure);
      if (buffer.length > 0) {
        return Promise.resolve({ value: buffer.shift(), done: false });
      }
      if (closed) return Promise.resolve({ value: undefined, done: true });

      return new Promise((resolve, reject) => {
        readers.push({ resolve, reject, cancelled: false });
      });
    },

    return() {
      close();
      return Promise.resolve({ value: undefined, done: true });
    },

    throw(error) {
      fail(error);
      return Promise.reject(error);
    },

    [Symbol.asyncIterator]() {
      return this;
    }
  };

  if (signal) {
    if (signal.aborted) fail(abortError());
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  return iterator;
}

/**
 * Subscribe to a DOM-style EventTarget and expose its events as an async
 * iterator. mapEvent can transform an event; throwing from it fails the queue.
 * Calling iterator.return(), close(), fail(), or aborting the signal detaches
 * the event listener.
 */
function fromEventTarget(target, eventName, {
  capacity = 32,
  overflow = "error",
  signal,
  mapEvent = event => event
} = {}) {
  if (!target || typeof target.addEventListener !== "function" ||
      typeof target.removeEventListener !== "function") {
    throw new TypeError("target must implement addEventListener/removeEventListener");
  }
  if (typeof mapEvent !== "function") {
    throw new TypeError("mapEvent must be a function");
  }

  let detach = () => {};
  const queue = createAsyncQueue({
    capacity,
    overflow,
    signal,
    onClose: () => detach()
  });

  if (queue.closed) return queue;

  const listener = event => {
    try {
      queue.push(mapEvent(event));
    } catch (error) {
      queue.fail(error);
    }
  };

  target.addEventListener(eventName, listener);
  detach = () => target.removeEventListener(eventName, listener);
  return queue;
}

// ------------------------------ Example tests ------------------------------
if (require.main === module) {
  const assert = require("node:assert/strict");

  (async () => {
    const queue = createAsyncQueue({ capacity: 1, overflow: "drop-oldest" });
    assert.equal(queue.push("first"), true);
    assert.equal(queue.push("second"), true);
    assert.equal(queue.size, 1);
    assert.deepEqual(await queue.next(), { value: "second", done: false });
    queue.close();
    assert.deepEqual(await queue.next(), { value: undefined, done: true });

    const dropNewest = createAsyncQueue({
      capacity: 1, overflow: "drop-newest"
    });
    assert.equal(dropNewest.push(1), true);
    assert.equal(dropNewest.push(2), false);
    assert.equal((await dropNewest.next()).value, 1);
    await dropNewest.return();

    const waiting = createAsyncQueue();
    const pendingRead = waiting.next();
    waiting.push({ id: 7 });
    assert.deepEqual(await pendingRead, {
      value: { id: 7 }, done: false
    });
    waiting.close();

    const overflowing = createAsyncQueue({ capacity: 1 });
    overflowing.push("kept");
    overflowing.push("overflow");
    await assert.rejects(overflowing.next(), /capacity exceeded/);

    const draining = createAsyncQueue({ capacity: 2 });
    draining.push("a");
    draining.push("b");
    draining.close();
    assert.equal((await draining.next()).value, "a");
    assert.equal((await draining.next()).value, "b");
    assert.equal((await draining.next()).done, true);

    const controller = new AbortController();
    const aborted = createAsyncQueue({ signal: controller.signal });
    controller.abort();
    await assert.rejects(aborted.next(), error => error.name === "AbortError");

    // Minimal EventTarget test double also verifies listener cleanup.
    const listeners = new Map();
    const target = {
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(fn);
      },
      removeEventListener(type, fn) {
        listeners.get(type)?.delete(fn);
      },
      emit(type, detail) {
        for (const fn of listeners.get(type) || []) fn({ detail });
      }
    };
    const events = fromEventTarget(target, "message", {
      capacity: 2,
      mapEvent: event => event.detail
    });
    target.emit("message", 42);
    assert.equal((await events.next()).value, 42);
    await events.return();
    assert.equal(listeners.get("message").size, 0);

    const badMap = fromEventTarget(target, "bad", {
      mapEvent() { throw new Error("mapping failed"); }
    });
    target.emit("bad", null);
    await assert.rejects(badMap.next(), /mapping failed/);

    console.log("observable-async-iterator: all tests passed");
  })().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { createAsyncQueue, fromEventTarget };
