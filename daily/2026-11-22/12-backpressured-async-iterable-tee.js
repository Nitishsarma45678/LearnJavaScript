/**
 * Exercise: Tee one async iterable into multiple independent readers.
 * A fast reader must not force unbounded buffering: when the bounded buffer
 * is full, it waits until every slower active reader advances. A reader may
 * cancel independently; the source is returned when all readers cancel.
 * Run: node 12-backpressured-async-iterable-tee.js
 */
"use strict";
const assert = require("node:assert/strict");

function teeAsyncIterable(source, count = 2, { maxBuffer = 16 } = {}) {
  if (!source || typeof source[Symbol.asyncIterator] !== "function") throw new TypeError("async iterable required");
  if (!Number.isInteger(count) || count < 1) throw new RangeError("count must be positive");
  if (!Number.isInteger(maxBuffer) || maxBuffer < 1) throw new RangeError("maxBuffer must be positive");

  const iterator = source[Symbol.asyncIterator]();
  const readers = Array.from({ length: count }, () => ({ cursor: 0, active: true }));
  let buffer = [], baseIndex = 0, nextIndex = 0, done = false, failure = null, pulling = null;
  let waiters = [];

  const notify = () => {
    const pending = waiters;
    waiters = [];
    for (const resolve of pending) resolve();
  };
  const waitForChange = () => new Promise(resolve => waiters.push(resolve));
  function trim() {
    const active = readers.filter(reader => reader.active);
    if (!active.length) return;
    const minimum = Math.min(...active.map(reader => reader.cursor));
    const removeCount = Math.max(0, minimum - baseIndex);
    if (removeCount) {
      buffer.splice(0, removeCount);
      baseIndex += removeCount;
    }
  }
  async function pullOne() {
    if (pulling) return pulling;
    pulling = (async () => {
      try {
        const item = await iterator.next();
        if (item.done) done = true;
        else { buffer.push(item.value); nextIndex++; }
      } catch (error) {
        failure = error;
        done = true;
      } finally {
        pulling = null;
        notify();
      }
    })();
    return pulling;
  }
  function makeReader(reader) {
    return {
      [Symbol.asyncIterator]() { return this; },
      async next() {
        while (reader.active) {
          if (reader.cursor < nextIndex) {
            const value = buffer[reader.cursor - baseIndex];
            reader.cursor++;
            trim();
            notify();
            return { value, done: false };
          }
          if (failure) throw failure;
          if (done) return { value: undefined, done: true };
          if (buffer.length >= maxBuffer) {
            await waitForChange();
            continue;
          }
          await pullOne();
        }
        return { value: undefined, done: true };
      },
      async return() {
        if (reader.active) {
          reader.active = false;
          trim();
          if (readers.every(item => !item.active) && !done) {
            done = true;
            if (typeof iterator.return === "function") await iterator.return();
          }
          notify();
        }
        return { value: undefined, done: true };
      }
    };
  }
  return readers.map(makeReader);
}

async function collect(iterable) {
  const values = [];
  for await (const value of iterable) values.push(value);
  return values;
}

(async () => {
  async function* numbers() { yield 1; yield 2; yield 3; }
  const [fast, slow] = teeAsyncIterable(numbers(), 2, { maxBuffer: 1 });
  assert.deepEqual(await fast.next(), { value: 1, done: false });
  assert.deepEqual(await slow.next(), { value: 1, done: false });
  assert.deepEqual(await fast.next(), { value: 2, done: false });
  assert.deepEqual(await slow.next(), { value: 2, done: false });
  assert.deepEqual(await collect(fast), [3]);
  assert.deepEqual(await collect(slow), [3]);

  const [readerA, readerB] = teeAsyncIterable(numbers(), 2, { maxBuffer: 2 });
  assert.deepEqual(await readerA.next(), { value: 1, done: false });
  await readerA.return();
  assert.deepEqual(await collect(readerB), [1, 2, 3]);
  console.log("async iterable tee tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });

module.exports = { teeAsyncIterable };
