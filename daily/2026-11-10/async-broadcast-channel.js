'use strict';

class ChannelClosedError extends Error {
  constructor(message = 'Broadcast channel is closed') {
    super(message);
    this.name = 'ChannelClosedError';
  }
}

/**
 * In-process async broadcast channel with per-subscriber bounded queues.
 *
 * overflow='block' applies backpressure: publish() waits until every active
 * subscriber has room. 'drop-oldest' and 'drop-newest' are lossy alternatives.
 * Each subscriber is an independent AsyncIterator and may be aborted separately.
 */
class AsyncBroadcastChannel {
  constructor({ capacity = 16, overflow = 'block' } = {}) {
    if (!(capacity === Infinity || (Number.isInteger(capacity) && capacity > 0))) {
      throw new RangeError('capacity must be a positive integer or Infinity');
    }
    if (!['block', 'drop-oldest', 'drop-newest'].includes(overflow)) {
      throw new RangeError('overflow must be block, drop-oldest, or drop-newest');
    }
    this.capacity = capacity;
    this.overflow = overflow;
    this.subscribers = new Set();
    this.closed = false;
    this.terminalError = null;
  }

  subscribe({ signal } = {}) {
    const subscriber = { queue: [], readers: [], writers: [], closed: false, error: null, signal, abortHandler: null };
    const channel = this;
    const iterator = {
      next() {
        if (subscriber.queue.length > 0) {
          const value = subscriber.queue.shift();
          channel._promoteWriter(subscriber);
          return Promise.resolve({ value, done: false });
        }
        if (subscriber.writers.length > 0 && !subscriber.closed) {
          const writer = subscriber.writers.shift();
          writer.resolve();
          return Promise.resolve({ value: writer.value, done: false });
        }
        if (subscriber.closed || channel.closed) {
          const error = subscriber.error || channel.terminalError;
          return error ? Promise.reject(error) : Promise.resolve({ value: undefined, done: true });
        }
        return new Promise((resolve, reject) => subscriber.readers.push({ resolve, reject }));
      },
      return() {
        channel._finishSubscriber(subscriber, null, true);
        return Promise.resolve({ value: undefined, done: true });
      },
      throw(error) {
        channel._finishSubscriber(subscriber, error || new Error('Subscriber aborted'), false);
        return Promise.reject(error);
      },
      [Symbol.asyncIterator]() { return this; }
    };
    subscriber.iterator = iterator;

    if (this.closed || (signal && signal.aborted)) {
      subscriber.closed = true;
      subscriber.error = this.terminalError;
    } else {
      this.subscribers.add(subscriber);
      if (signal) {
        subscriber.abortHandler = () => this._finishSubscriber(subscriber, null, true);
        signal.addEventListener('abort', subscriber.abortHandler, { once: true });
      }
    }
    return iterator;
  }

  async publish(value) {
    if (this.closed) throw this.terminalError || new ChannelClosedError();
    const deliveries = [];
    for (const subscriber of this.subscribers) deliveries.push(this._offer(subscriber, value));
    await Promise.all(deliveries);
    return this.subscribers.size;
  }

  _offer(subscriber, value) {
    if (subscriber.closed) return Promise.resolve();
    if (subscriber.readers.length > 0) {
      subscriber.readers.shift().resolve({ value, done: false });
      return Promise.resolve();
    }
    if (subscriber.queue.length < this.capacity) {
      subscriber.queue.push(value);
      return Promise.resolve();
    }
    if (this.overflow === 'drop-oldest') {
      subscriber.queue.shift();
      subscriber.queue.push(value);
      return Promise.resolve();
    }
    if (this.overflow === 'drop-newest') return Promise.resolve();
    return new Promise((resolve, reject) => subscriber.writers.push({ value, resolve, reject }));
  }

  _promoteWriter(subscriber) {
    if (subscriber.closed || subscriber.writers.length === 0) return;
    const writer = subscriber.writers.shift();
    if (subscriber.readers.length > 0) {
      subscriber.readers.shift().resolve({ value: writer.value, done: false });
    } else {
      subscriber.queue.push(writer.value);
    }
    writer.resolve();
  }

  _finishSubscriber(subscriber, error, discardQueue) {
    if (subscriber.closed) return;
    subscriber.closed = true;
    subscriber.error = error;
    this.subscribers.delete(subscriber);
    if (subscriber.signal && subscriber.abortHandler) {
      subscriber.signal.removeEventListener('abort', subscriber.abortHandler);
    }
    if (discardQueue) subscriber.queue.length = 0;
    for (const reader of subscriber.readers.splice(0)) {
      if (error) reader.reject(error);
      else reader.resolve({ value: undefined, done: true });
    }
    for (const writer of subscriber.writers.splice(0)) {
      if (error) writer.reject(error);
      else writer.resolve(); // Subscriber opted out; its pending copy is discarded.
    }
  }

  close(error = null) {
    if (this.closed) return;
    this.closed = true;
    this.terminalError = error;
    for (const subscriber of [...this.subscribers]) {
      this._finishSubscriber(subscriber, error, false);
    }
  }

  get subscriberCount() {
    return this.subscribers.size;
  }
}

async function runTests() {
  const assert = require('node:assert/strict');
  const channel = new AsyncBroadcastChannel({ capacity: 2 });
  const first = channel.subscribe();
  const second = channel.subscribe();
  await channel.publish('alpha');
  await channel.publish('beta');
  assert.deepEqual(await first.next(), { value: 'alpha', done: false });
  assert.deepEqual(await second.next(), { value: 'alpha', done: false });
  assert.deepEqual(await first.next(), { value: 'beta', done: false });
  assert.deepEqual(await second.next(), { value: 'beta', done: false });

  const bounded = new AsyncBroadcastChannel({ capacity: 1, overflow: 'block' });
  const reader = bounded.subscribe();
  await bounded.publish(1);
  let settled = false;
  const blockedPublish = bounded.publish(2).then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false, 'publish must wait while a subscriber queue is full');
  assert.deepEqual(await reader.next(), { value: 1, done: false });
  await blockedPublish;
  assert.equal(settled, true);
  assert.deepEqual(await reader.next(), { value: 2, done: false });

  const lossy = new AsyncBroadcastChannel({ capacity: 2, overflow: 'drop-oldest' });
  const slow = lossy.subscribe();
  await lossy.publish(1); await lossy.publish(2); await lossy.publish(3);
  assert.deepEqual(await slow.next(), { value: 2, done: false });
  assert.deepEqual(await slow.next(), { value: 3, done: false });

  const controller = new AbortController();
  const aborting = new AsyncBroadcastChannel().subscribe({ signal: controller.signal });
  controller.abort();
  assert.deepEqual(await aborting.next(), { value: undefined, done: true });

  const closing = new AsyncBroadcastChannel();
  const draining = closing.subscribe();
  await closing.publish('last');
  closing.close();
  assert.deepEqual(await draining.next(), { value: 'last', done: false });
  assert.deepEqual(await draining.next(), { value: undefined, done: true });
  await assert.rejects(() => closing.publish('late'), ChannelClosedError);

  const failing = new AsyncBroadcastChannel();
  const failedReader = failing.subscribe();
  const reason = new Error('producer failed');
  failing.close(reason);
  await assert.rejects(() => failedReader.next(), /producer failed/);
  console.log('Async broadcast channel: all tests passed.');
}

if (require.main === module) runTests().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { AsyncBroadcastChannel, ChannelClosedError };
