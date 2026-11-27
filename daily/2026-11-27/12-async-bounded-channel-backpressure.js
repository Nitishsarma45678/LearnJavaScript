'use strict';

// Exercise: build a bounded asynchronous channel. Producers wait when the
// buffer is full; consumers wait when it is empty. close() drains buffered
// values, while fail() rejects pending and future operations.

class BoundedChannel {
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('capacity must be positive');
    this.capacity = capacity;
    this.buffer = [];
    this.senders = [];
    this.receivers = [];
    this.closed = false;
    this.failure = null;
  }

  send(value) {
    if (this.failure) return Promise.reject(this.failure);
    if (this.closed) return Promise.reject(new Error('Channel is closed'));
    if (this.receivers.length) {
      this.receivers.shift().resolve({ done: false, value });
      return Promise.resolve();
    }
    if (this.buffer.length < this.capacity) {
      this.buffer.push(value);
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => this.senders.push({ value, resolve, reject }));
  }

  receive() {
    if (this.failure) return Promise.reject(this.failure);
    if (this.buffer.length) {
      const value = this.buffer.shift();
      this.#promoteSender();
      return Promise.resolve({ done: false, value });
    }
    if (this.senders.length) {
      const sender = this.senders.shift();
      sender.resolve();
      return Promise.resolve({ done: false, value: sender.value });
    }
    if (this.closed) return Promise.resolve({ done: true, value: undefined });
    return new Promise((resolve, reject) => this.receivers.push({ resolve, reject }));
  }

  close() {
    if (this.closed || this.failure) return;
    this.closed = true;
    for (const sender of this.senders.splice(0)) sender.reject(new Error('Channel is closed'));
    if (!this.buffer.length) {
      for (const receiver of this.receivers.splice(0)) receiver.resolve({ done: true, value: undefined });
    }
  }

  fail(error) {
    if (this.closed || this.failure) return;
    this.failure = error instanceof Error ? error : new Error(String(error));
    this.buffer.length = 0;
    for (const sender of this.senders.splice(0)) sender.reject(this.failure);
    for (const receiver of this.receivers.splice(0)) receiver.reject(this.failure);
  }

  async #promoteSender() {
    if (this.senders.length && !this.closed && !this.failure) {
      const sender = this.senders.shift();
      if (this.receivers.length) this.receivers.shift().resolve({ done: false, value: sender.value });
      else this.buffer.push(sender.value);
      sender.resolve();
    }
  }

  [Symbol.asyncIterator]() { return this; }
  next() { return this.receive(); }
}

async function collect(channel) {
  const values = [];
  for await (const value of channel) values.push(value);
  return values;
}

const assert = require('node:assert/strict');
(async () => {
  const channel = new BoundedChannel(1);
  await channel.send('first');
  let secondAccepted = false;
  const pending = channel.send('second').then(() => { secondAccepted = true; });
  await Promise.resolve();
  assert.equal(secondAccepted, false, 'second producer must wait for capacity');
  assert.deepEqual(await channel.receive(), { done: false, value: 'first' });
  await pending;
  channel.close();
  assert.deepEqual(await collect(channel), ['second']);

  const failed = new BoundedChannel(1);
  const error = new Error('producer failed');
  failed.fail(error);
  await assert.rejects(failed.receive(), /producer failed/);
  await assert.rejects(failed.send(1), /producer failed/);
  console.log('Bounded channel tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

module.exports = { BoundedChannel, collect };
