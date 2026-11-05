"use strict";

/*
 * Exercise: implement a hierarchical event emitter with topic patterns:
 *   - "orders.created" matches one exact topic,
 *   - "orders.*" matches exactly one segment after "orders",
 *   - "orders.**" matches zero or more trailing segments,
 *   - "**.failed" matches any topic ending in "failed".
 *
 * Dispatch is priority-descending and registration-stable. A dispatch uses a
 * snapshot: new listeners wait until the next emission, while listeners
 * removed during dispatch are skipped. Once-listeners are removed before
 * invocation, making recursive emissions safe.
 */

function splitSegments(value, allowWildcards) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("Topic and pattern must be non-empty strings");
  }
  const segments = value.split(".");
  if (segments.some(segment => segment.length === 0)) {
    throw new TypeError("Topic segments cannot be empty");
  }
  if (!allowWildcards && segments.some(segment => segment === "*" || segment === "**")) {
    throw new TypeError("Emitted topic names cannot contain wildcards");
  }
  if (allowWildcards && segments.some(segment => segment.includes("*") && segment !== "*" && segment !== "**")) {
    throw new TypeError("Wildcards must occupy an entire segment");
  }
  return segments;
}

function patternMatches(pattern, topic) {
  const memo = Array.from(
    { length: pattern.length + 1 },
    () => new Array(topic.length + 1)
  );

  function visit(patternIndex, topicIndex) {
    const cached = memo[patternIndex][topicIndex];
    if (cached !== undefined) return cached;

    let result;
    if (patternIndex === pattern.length) {
      result = topicIndex === topic.length;
    } else if (pattern[patternIndex] === "**") {
      result =
        visit(patternIndex + 1, topicIndex) ||
        (topicIndex < topic.length && visit(patternIndex, topicIndex + 1));
    } else if (topicIndex === topic.length) {
      result = false;
    } else {
      result =
        (pattern[patternIndex] === "*" || pattern[patternIndex] === topic[topicIndex]) &&
        visit(patternIndex + 1, topicIndex + 1);
    }

    memo[patternIndex][topicIndex] = result;
    return result;
  }

  return visit(0, 0);
}

function createTopicEmitter() {
  const listeners = new Set();
  let nextId = 1;

  function remove(entry) {
    if (!entry.active) return false;
    entry.active = false;
    listeners.delete(entry);
    if (entry.signal && entry.abortHandler) {
      entry.signal.removeEventListener("abort", entry.abortHandler);
    }
    return true;
  }

  function select(topic) {
    const topicSegments = splitSegments(topic, false);
    return [...listeners]
      .filter(entry => entry.active && patternMatches(entry.patternSegments, topicSegments))
      .sort((a, b) => b.priority - a.priority || a.id - b.id);
  }

  function on(pattern, listener, options = {}) {
    const patternSegments = splitSegments(pattern, true);
    if (typeof listener !== "function") throw new TypeError("listener must be a function");

    const priority = options.priority ?? 0;
    if (!Number.isFinite(priority)) throw new TypeError("priority must be finite");

    const signal = options.signal;
    if (signal != null &&
        (typeof signal.addEventListener !== "function" || typeof signal.removeEventListener !== "function")) {
      throw new TypeError("signal must be an AbortSignal");
    }

    if (signal?.aborted) return () => false;

    const entry = {
      id: nextId++,
      pattern,
      patternSegments,
      listener,
      priority,
      once: Boolean(options.once),
      signal,
      abortHandler: null,
      active: true
    };

    const unsubscribe = () => remove(entry);
    if (signal) {
      entry.abortHandler = unsubscribe;
      signal.addEventListener("abort", entry.abortHandler, { once: true });
    }
    listeners.add(entry);
    return unsubscribe;
  }

  function off(pattern, listener) {
    splitSegments(pattern, true);
    let removed = 0;
    for (const entry of [...listeners]) {
      if (entry.pattern === pattern && entry.listener === listener && remove(entry)) {
        removed += 1;
      }
    }
    return removed;
  }

  function emit(topic, ...args) {
    const snapshot = select(topic);
    const results = [];
    const errors = [];

    for (const entry of snapshot) {
      if (!entry.active) continue;
      if (entry.once) remove(entry);

      try {
        results.push(entry.listener(...args));
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, "One or more listeners failed for topic " + topic);
    }
    return results;
  }

  async function emitAsync(topic, ...args) {
    const snapshot = select(topic);
    const results = [];
    const errors = [];

    for (const entry of snapshot) {
      if (!entry.active) continue;
      if (entry.once) remove(entry);

      try {
        results.push(await entry.listener(...args));
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, "One or more async listeners failed for topic " + topic);
    }
    return results;
  }

  function listenerCount(topic) {
    if (topic === undefined) return listeners.size;
    return select(topic).length;
  }

  function clear() {
    let removed = 0;
    for (const entry of [...listeners]) {
      if (remove(entry)) removed += 1;
    }
    return removed;
  }

  return Object.freeze({ on, off, emit, emitAsync, listenerCount, clear });
}

if (require.main === module) {
  const assert = require("node:assert/strict");

  async function run() {
    const emitter = createTopicEmitter();
    const calls = [];

    emitter.on("orders.*", id => calls.push("single:" + id), { priority: 2 });
    emitter.on("orders.**", id => calls.push("deep:" + id), { priority: 1, once: true });
    emitter.on("**", id => calls.push("all:" + id), { priority: -1 });

    emitter.emit("orders.created", "A");
    emitter.emit("orders.cancelled", "B");
    assert.deepEqual(calls, [
      "single:A", "deep:A", "all:A",
      "single:B", "all:B"
    ]);

    const reentrant = createTopicEmitter();
    let onceCalls = 0;
    reentrant.on("ping", () => {
      onceCalls += 1;
      reentrant.emit("ping");
    }, { once: true });
    reentrant.emit("ping");
    assert.equal(onceCalls, 1);

    const removal = createTopicEmitter();
    const removalCalls = [];
    let removeLater;
    removal.on("task.done", () => removalCalls.push("first"), { priority: 2 });
    removal.on("task.done", () => {
      removalCalls.push("remover");
      removeLater();
    }, { priority: 1 });
    removeLater = removal.on("task.done", () => removalCalls.push("removed"));
    removal.emit("task.done");
    assert.deepEqual(removalCalls, ["first", "remover"]);

    const controller = new AbortController();
    let abortedCalls = 0;
    emitter.on("worker.failed", () => abortedCalls++, { signal: controller.signal });
    controller.abort();
    emitter.emit("worker.failed");
    assert.equal(abortedCalls, 0);

    const asyncEmitter = createTopicEmitter();
    const asyncOrder = [];
    asyncEmitter.on("job.finished", async value => {
      await Promise.resolve();
      asyncOrder.push("one:" + value);
      return 1;
    });
    asyncEmitter.on("job.finished", value => {
      asyncOrder.push("two:" + value);
      return 2;
    });
    assert.deepEqual(await asyncEmitter.emitAsync("job.finished", 7), [1, 2]);
    assert.deepEqual(asyncOrder, ["one:7", "two:7"]);

    assert.equal(emitter.listenerCount("orders"), 1); // "**" matches zero segments
    assert.equal(emitter.clear(), 1);
    assert.equal(emitter.listenerCount(), 0);
    assert.throws(() => emitter.emit("orders..created"), TypeError);
    assert.throws(() => emitter.on("orders.*.bad*", () => {}), TypeError);

    console.log("Wildcard topic event emitter: all tests passed.");
  }

  run().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { createTopicEmitter, patternMatches };
