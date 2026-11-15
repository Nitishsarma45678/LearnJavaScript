'use strict';

/**
 * Bounded asynchronous channel with FIFO sender/receiver queues.
 * Producers await capacity instead of growing an unbounded queue. Closing the
 * channel rejects blocked sends, drains buffered values, then ends iteration.
 */
class AsyncChannel {
  constructor(capacity = 1) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('capacity must be a positive integer');
    this.capacity = capacity;
    this.buffer = [];
    this.senders = [];
    this.receivers = [];
    this.closed = false;
    this.closeError = null;
  }

  _take(queue) {
    while (queue.length) {
      const item = queue.shift();
      if (item.active) return item;
    }
    return null;
  }

  _wait(queue, signal, kind, extra = {}) {
    if (signal?.aborted) return Promise.reject(signal.reason ?? new Error(`${kind} aborted`));
    return new Promise((resolve, reject) => {
      const item = { active: true, resolve, reject, signal, abort: null, ...extra };
      const settle = (fn, value) => {
        if (!item.active) return;
        item.active = false;
        if (signal && item.abort) signal.removeEventListener('abort', item.abort);
        fn(value);
      };
      item.resolve = value => settle(resolve, value);
      item.reject = error => settle(reject, error);
      if (signal) {
        item.abort = () => item.reject(signal.reason ?? new Error(`${kind} aborted`));
        signal.addEventListener('abort', item.abort, { once: true });
        if (signal.aborted) item.abort();
      }
      if (item.active) queue.push(item);
    });
  }

  send(value, { signal } = {}) {
    if (signal?.aborted) return Promise.reject(signal.reason ?? new Error('send aborted'));
    if (this.closed) return Promise.reject(new Error('channel is closed'));
    const receiver = this._take(this.receivers);
    if (receiver) {
      receiver.resolve({ value, done: false });
      return Promise.resolve();
    }
    if (this.buffer.length < this.capacity) {
      this.buffer.push(value);
      return Promise.resolve();
    }
    return this._wait(this.senders, signal, 'send', { value });
  }

  receive({ signal } = {}) {
    if (signal?.aborted) return Promise.reject(signal.reason ?? new Error('receive aborted'));
    if (this.buffer.length) {
      const value = this.buffer.shift();
      const sender = this._take(this.senders);
      if (sender) {
        this.buffer.push(sender.value);
        sender.resolve();
      }
      return Promise.resolve({ value, done: false });
    }
    const sender = this._take(this.senders);
    if (sender) {
      sender.resolve();
      return Promise.resolve({ value: sender.value, done: false });
    }
    if (this.closed) return this.closeError ? Promise.reject(this.closeError) : Promise.resolve({ value: undefined, done: true });
    return this._wait(this.receivers, signal, 'receive');
  }

  close(error = null) {
    if (this.closed) return false;
    this.closed = true;
    this.closeError = error instanceof Error ? error : error == null ? null : new Error(String(error));
    for (const sender of this.senders.splice(0)) sender.reject(new Error('channel closed before send completed'));
    if (this.buffer.length === 0) {
      for (const receiver of this.receivers.splice(0)) {
        if (this.closeError) receiver.reject(this.closeError);
        else receiver.resolve({ value: undefined, done: true });
      }
    }
    return true;
  }

  get pendingSenders() { return this.senders.reduce((count, item) => count + Number(item.active), 0); }
  get pendingReceivers() { return this.receivers.reduce((count, item) => count + Number(item.active), 0); }
  get buffered() { return this.buffer.length; }

  [Symbol.asyncIterator]() { return this; }
  next() { return this.receive(); }
  return() {
    this.close();
    return Promise.resolve({ value: undefined, done: true });
  }
}

async function runTests() {
  const assert = require('node:assert/strict');
  const channel = new AsyncChannel(1);
  await channel.send('first');
  let secondSettled = false;
  const secondSend = channel.send('second').then(() => { secondSettled = true; });
  await Promise.resolve();
  assert.equal(secondSettled, false, 'second producer is backpressured');
  assert.deepEqual(await channel.receive(), { value: 'first', done: false });
  await secondSend;
  assert.deepEqual(await channel.receive(), { value: 'second', done: false });

  const direct = new AsyncChannel(2);
  const pendingReceive = direct.receive();
  await direct.send(42);
  assert.deepEqual(await pendingReceive, { value: 42, done: false });

  const cancelled = new AsyncChannel(1);
  await cancelled.send('occupy');
  const controller = new AbortController();
  const blocked = cancelled.send('never', { signal: controller.signal });
  controller.abort(new Error('producer cancelled'));
  await assert.rejects(blocked, /producer cancelled/);
  assert.equal(cancelled.pendingSenders, 0);
  await assert.rejects(cancelled.send('already aborted', { signal: controller.signal }), /producer cancelled/);
  assert.deepEqual(await cancelled.receive(), { value: 'occupy', done: false });

  const closed = new AsyncChannel(2);
  await closed.send('drain-me');
  assert.equal(closed.close(), true);
  assert.equal(closed.close(), false);
  assert.deepEqual(await closed.receive(), { value: 'drain-me', done: false });
  assert.deepEqual(await closed.receive(), { value: undefined, done: true });
  await assert.rejects(closed.send('late'), /closed/);

  const failed = new AsyncChannel(1);
  const failure = new Error('consumer failed');
  failed.close(failure);
  await assert.rejects(failed.receive(), error => error === failure);

  const iterated = new AsyncChannel(3);
  await iterated.send(1); await iterated.send(2); iterated.close();
  const values = [];
  for await (const value of iterated) values.push(value);
  assert.deepEqual(values, [1, 2]);
  console.log('Async bounded channel tests passed');
}

if (require.main === module) runTests().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { AsyncChannel };
