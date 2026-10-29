/**
 * teeAsyncIterable(source, branches)
 *
 * Split one async iterable into N independent async iterators. Values are read
 * from the source only as consumers request them and buffered only for slower
 * branches. When every branch is closed, the upstream iterator is closed too.
 *
 * Note: buffering can grow without bound if one branch stops consuming while
 * other branches continue; callers should close unused branches.
 */
"use strict";
const assert = require("node:assert/strict");

function teeAsyncIterable(source, branches = 2) {
  if (source == null || typeof source[Symbol.asyncIterator] !== "function") {
    throw new TypeError("source must be an async iterable");
  }
  if (!Number.isInteger(branches) || branches < 1) {
    throw new RangeError("branches must be a positive integer");
  }
  const upstream = source[Symbol.asyncIterator]();
  const queues = Array.from({ length: branches }, () => []);
  const active = Array(branches).fill(true);
  let ended = false, failure = null, pulling = null, cursor = 0;

  async function closeUpstream() {
    if (ended) return;
    ended = true;
    if (typeof upstream.return === "function") await upstream.return();
  }

  async function pull() {
    if (pulling) return pulling;
    pulling = (async () => {
      try {
        const result = await upstream.next();
        if (result.done) ended = true;
        else {
          for (let i = 0; i < branches; i++) if (active[i]) queues[i].push(result.value);
        }
      } catch (error) {
        failure = error;
        ended = true;
      } finally {
        pulling = null;
      }
    })();
    return pulling;
  }

  function makeBranch(id) {
    return {
      async next() {
        if (!active[id]) return { done: true, value: undefined };
        while (queues[id].length === 0 && !ended) await pull();
        if (queues[id].length) return { done: false, value: queues[id].shift() };
        active[id] = false;
        if (!active.some(Boolean)) await closeUpstream();
        if (failure) throw failure;
        return { done: true, value: undefined };
      },
      async return() {
        if (active[id]) {
          active[id] = false;
          queues[id] = [];
          if (!active.some(Boolean)) await closeUpstream();
        }
        return { done: true, value: undefined };
      },
      [Symbol.asyncIterator]() { return this; }
    };
  }

  // Stable branch order is represented by the returned array.
  return Array.from({ length: branches }, (_, id) => makeBranch(id));
}

async function collect(iterable) {
  const values = [];
  for await (const value of iterable) values.push(value);
  return values;
}

(async () => {
  async function* source() { yield 1; yield 2; yield 3; }
  const [a, b] = teeAsyncIterable(source(), 2);
  assert.deepEqual(await Promise.all([collect(a), collect(b)]), [[1, 2, 3], [1, 2, 3]]);

  const [c, d, e] = teeAsyncIterable(source(), 3);
  assert.deepEqual(await collect(d), [1, 2, 3]);
  assert.deepEqual(await collect(c), [1, 2, 3]);
  assert.deepEqual(await collect(e), [1, 2, 3]);

  assert.throws(() => teeAsyncIterable(source(), 0), RangeError);
  assert.throws(() => teeAsyncIterable([], 2), TypeError);
})().catch(error => {
  // Make asynchronous assertion failures visible to Node's test runner.
  process.nextTick(() => { throw error; });
});

module.exports = { teeAsyncIterable };
