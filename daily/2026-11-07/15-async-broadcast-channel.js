'use strict';

/**
 * Exercise: implement a bounded asynchronous broadcast channel.
 *
 * Requirements:
 * - Every subscriber has an independent FIFO buffer and async iterator.
 * - Support drop-oldest, drop-newest, and subscriber-local overflow errors.
 * - Resolve waiting readers directly, drain buffered values on close, and support unsubscribe.
 * - Keep one slow consumer from corrupting another consumer's stream.
 *
 * Run: node 15-async-broadcast-channel.js
 */

const assert = require('node:assert/strict');

class AsyncBroadcastChannel {
  constructor() {
    this._subscribers = new Set();
    this._closed = false;
    this._closeError = null;
  }

  subscribe({ capacity = Infinity, overflow = 'drop-oldest' } = {}) {
    if (!(capacity === Infinity || (Number.isInteger(capacity) && capacity > 0))) {
      throw new RangeError('capacity must be a positive integer or Infinity');
    }
    if (!['drop-oldest', 'drop-newest', 'error'].includes(overflow)) {
      throw new TypeError('unsupported overflow policy');
    }

    const state = {
      queue: [],
      readers: [],
      capacity,
      overflow,
      dropped: 0,
      terminal: this._closed ? (this._closeError !== null ? 'error' : 'closed') : null,
      terminalError: this._closeError,
      active: !this._closed
    };
    if (state.active) this._subscribers.add(state);

    const finishReaders = () => {
      if (state.queue.length !== 0 || !state.terminal) return;
      while (state.readers.length) {
        const reader = state.readers.shift();
        if (state.terminal === 'error') reader.reject(state.terminalError);
        else reader.resolve({ value: undefined, done: true });
      }
    };

    const iterator = {
      next: () => {
        if (state.queue.length) {
          const value = state.queue.shift();
          finishReaders();
          return Promise.resolve({ value, done: false });
        }
        if (state.terminal === 'error') return Promise.reject(state.terminalError);
        if (state.terminal === 'closed' || state.terminal === 'returned') {
          return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise((resolve, reject) => state.readers.push({ resolve, reject }));
      },
      return: () => {
        if (state.terminal !== 'returned') {
          state.terminal = 'returned';
          state.queue.length = 0;
          state.active = false;
          this._subscribers.delete(state);
          while (state.readers.length) state.readers.shift().resolve({ value: undefined, done: true });
        }
        return Promise.resolve({ value: undefined, done: true });
      },
      throw: error => {
        state.terminal = 'error';
        state.terminalError = error;
        state.queue.length = 0;
        state.active = false;
        this._subscribers.delete(state);
        while (state.readers.length) state.readers.shift().reject(error);
        return Promise.reject(error);
      },
      [Symbol.asyncIterator]() { return this; },
      get dropped() { return state.dropped; },
      get buffered() { return state.queue.length; },
      get active() { return state.active; }
    };

    state.finishReaders = finishReaders;
    state.iterator = iterator;
    if (state.terminal) finishReaders();
    return iterator;
  }

  publish(value) {
    if (this._closed) throw new Error('cannot publish to a closed channel');
    const result = { subscribers: this._subscribers.size, delivered: 0, dropped: 0, overflowed: 0 };

    for (const state of [...this._subscribers]) {
      if (state.terminal || !state.active) continue;
      if (state.readers.length) {
        state.readers.shift().resolve({ value, done: false });
        result.delivered += 1;
        continue;
      }
      if (state.queue.length < state.capacity) {
        state.queue.push(value);
        result.delivered += 1;
        continue;
      }

      if (state.overflow === 'drop-oldest') {
        state.queue.shift();
        state.queue.push(value);
        state.dropped += 1;
        result.delivered += 1;
        result.dropped += 1;
      } else if (state.overflow === 'drop-newest') {
        state.dropped += 1;
        result.dropped += 1;
      } else {
        const error = new RangeError('subscriber buffer capacity exceeded');
        state.terminal = 'error';
        state.terminalError = error;
        state.active = false;
        this._subscribers.delete(state);
        state.finishReaders();
        result.overflowed += 1;
      }
    }
    return result;
  }

  close(error = null) {
    if (this._closed) return false;
    this._closed = true;
    this._closeError = error;
    for (const state of [...this._subscribers]) {
      state.terminal = error !== null ? 'error' : 'closed';
      state.terminalError = error;
      state.active = false;
      state.finishReaders();
    }
    this._subscribers.clear();
    return true;
  }

  get subscriberCount() {
    return this._subscribers.size;
  }

  get closed() {
    return this._closed;
  }
}

async function collect(iterator) {
  const values = [];
  for await (const value of iterator) values.push(value);
  return values;
}

async function runTests() {
  const channel = new AsyncBroadcastChannel();
  const fast = channel.subscribe({ capacity: 3 });
  const slow = channel.subscribe({ capacity: 2, overflow: 'drop-oldest' });
  const fastPending = fast.next();
  channel.publish('a');
  channel.publish('b');
  channel.publish('c');
  assert.deepEqual(await fastPending, { value: 'a', done: false });
  assert.deepEqual(await fast.next(), { value: 'b', done: false });
  assert.deepEqual(await fast.next(), { value: 'c', done: false });
  assert.equal(slow.dropped, 1);
  assert.deepEqual(await slow.next(), { value: 'b', done: false });
  assert.deepEqual(await slow.next(), { value: 'c', done: false });

  const newestChannel = new AsyncBroadcastChannel();
  const newest = newestChannel.subscribe({ capacity: 1, overflow: 'drop-newest' });
  newestChannel.publish(1);
  newestChannel.publish(2);
  assert.equal(newest.dropped, 1);
  assert.equal((await newest.next()).value, 1);

  const errorChannel = new AsyncBroadcastChannel();
  const fragile = errorChannel.subscribe({ capacity: 1, overflow: 'error' });
  errorChannel.publish('buffered');
  errorChannel.publish('overflow');
  assert.equal(errorChannel.subscriberCount, 0);
  assert.equal((await fragile.next()).value, 'buffered', 'buffer drains before terminal error');
  await assert.rejects(fragile.next(), /capacity exceeded/);

  const closeChannel = new AsyncBroadcastChannel();
  const draining = closeChannel.subscribe({ capacity: 4 });
  const waiting = draining.next();
  closeChannel.publish('one');
  assert.deepEqual(await waiting, { value: 'one', done: false });
  closeChannel.publish('two');
  closeChannel.close();
  assert.deepEqual(await draining.next(), { value: 'two', done: false });
  assert.deepEqual(await draining.next(), { value: undefined, done: true });
  assert.equal(closeChannel.close(), false);
  assert.throws(() => closeChannel.publish('late'), /closed/);

  const errorClose = new AsyncBroadcastChannel();
  const errorReader = errorClose.subscribe();
  const terminalError = new Error('producer failed');
  errorClose.close(terminalError);
  await assert.rejects(errorReader.next(), error => error === terminalError);
  const lateErrorReader = errorClose.subscribe();
  await assert.rejects(lateErrorReader.next(), error => error === terminalError);

  const multiReaderChannel = new AsyncBroadcastChannel();
  const multiReader = multiReaderChannel.subscribe();
  const firstWaiter = multiReader.next();
  const secondWaiter = multiReader.next();
  multiReaderChannel.publish('first');
  multiReaderChannel.publish('second');
  assert.deepEqual(await firstWaiter, { value: 'first', done: false });
  assert.deepEqual(await secondWaiter, { value: 'second', done: false });

  const unsubscribeChannel = new AsyncBroadcastChannel();
  const unsubscribed = unsubscribeChannel.subscribe();
  const pending = unsubscribed.next();
  await unsubscribed.return();
  assert.deepEqual(await pending, { value: undefined, done: true });
  assert.equal(unsubscribeChannel.subscriberCount, 0);
  assert.equal(unsubscribed.active, false);

  // A consumer can use normal async iteration; one consumer's pace is independent.
  const iterableChannel = new AsyncBroadcastChannel();
  const consumer = iterableChannel.subscribe({ capacity: 5 });
  const gathered = collect(consumer);
  iterableChannel.publish(10);
  iterableChannel.publish(20);
  iterableChannel.close();
  assert.deepEqual(await gathered, [10, 20]);

  const afterClose = iterableChannel.subscribe();
  assert.deepEqual(await afterClose.next(), { value: undefined, done: true });

  console.log('Async broadcast channel tests passed');
}

if (require.main === module) runTests().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
module.exports = { AsyncBroadcastChannel };
