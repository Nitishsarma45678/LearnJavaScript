"use strict";

const assert = require("node:assert/strict");

/**
 * In-process asynchronous broadcast channel.
 *
 * Every subscriber has an independent bounded queue. Overflow policies:
 * - drop-oldest: retain the newest values in that subscriber's queue.
 * - drop-newest: preserve queued values and discard the incoming value.
 * - block: make publish() wait until that subscriber frees queue capacity.
 *
 * Publishers are serialized so that a blocked publish cannot be overtaken
 * by a later publish. The channel also supports bounded replay and close.
 */
class AsyncBroadcastChannel {
  constructor({
    capacity = 16,
    overflow = "drop-oldest",
    historySize = 0
  } = {}) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError("capacity must be a positive integer");
    }
    if (!["drop-oldest", "drop-newest", "block"].includes(overflow)) {
      throw new TypeError("unsupported overflow policy");
    }
    if (
      !Number.isInteger(historySize) ||
      historySize < 0 ||
      historySize > capacity
    ) {
      throw new RangeError("historySize must be between 0 and capacity");
    }

    this.capacity = capacity;
    this.overflow = overflow;
    this.historySize = historySize;
    this.history = [];
    this.subscribers = new Set();
    this.closed = false;
    this.closeError = null;
    this.publishTail = Promise.resolve();
  }

  subscribe({ replay = 0 } = {}) {
    if (!Number.isInteger(replay) || replay < 0 || replay > this.historySize) {
      throw new RangeError("replay must be between 0 and historySize");
    }

    const subscriber = {
      queue: this.history.slice(-replay),
      readers: [],
      spaceWaiters: [],
      closed: this.closed,
      error: this.closeError
    };

    if (!this.closed) this.subscribers.add(subscriber);

    const channel = this;
    return {
      next() {
        return channel._next(subscriber);
      },
      return() {
        channel._remove(subscriber);
        return Promise.resolve({ value: undefined, done: true });
      },
      [Symbol.asyncIterator]() {
        return this;
      }
    };
  }

  _next(subscriber) {
    if (subscriber.queue.length > 0) {
      const value = subscriber.queue.shift();
      const waiter = subscriber.spaceWaiters.shift();
      if (waiter) waiter();
      return Promise.resolve({ value, done: false });
    }

    if (subscriber.error) {
      return Promise.reject(subscriber.error);
    }
    if (subscriber.closed) {
      return Promise.resolve({ value: undefined, done: true });
    }

    return new Promise((resolve, reject) => {
      subscriber.readers.push({ resolve, reject });
    });
  }

  async _deliver(subscriber, value) {
    if (subscriber.closed) return;

    if (subscriber.readers.length > 0) {
      subscriber.readers.shift().resolve({ value, done: false });
      return;
    }

    if (subscriber.queue.length < this.capacity) {
      subscriber.queue.push(value);
      return;
    }

    if (this.overflow === "drop-oldest") {
      subscriber.queue.shift();
      subscriber.queue.push(value);
      return;
    }

    if (this.overflow === "drop-newest") {
      return;
    }

    // In block mode only one publisher can be inside _deliver at a time.
    await new Promise(resolve => subscriber.spaceWaiters.push(resolve));
    if (subscriber.closed) return;

    if (subscriber.readers.length > 0) {
      subscriber.readers.shift().resolve({ value, done: false });
    } else {
      subscriber.queue.push(value);
    }
  }

  publish(value) {
    const operation = this.publishTail.then(() => this._publish(value));
    this.publishTail = operation.catch(() => {});
    return operation;
  }

  async _publish(value) {
    if (this.closed) {
      throw new Error("cannot publish to a closed channel");
    }

    if (this.historySize > 0) {
      this.history.push(value);
      if (this.history.length > this.historySize) this.history.shift();
    }

    for (const subscriber of this.subscribers) {
      await this._deliver(subscriber, value);
    }

    return true;
  }

  _settleReaders(subscriber) {
    while (subscriber.readers.length > 0) {
      const reader = subscriber.readers.shift();
      if (subscriber.error) reader.reject(subscriber.error);
      else reader.resolve({ value: undefined, done: true });
    }
  }

  _remove(subscriber) {
    if (subscriber.closed) return;
    subscriber.closed = true;
    this.subscribers.delete(subscriber);
    this._settleReaders(subscriber);
    while (subscriber.spaceWaiters.length > 0) {
      subscriber.spaceWaiters.shift()();
    }
  }

  close(error = null) {
    if (this.closed) return;
    if (error !== null && !(error instanceof Error)) {
      throw new TypeError("close error must be an Error or null");
    }

    this.closed = true;
    this.closeError = error;

    for (const subscriber of this.subscribers) {
      subscriber.closed = true;
      subscriber.error = error;
      this._settleReaders(subscriber);
      while (subscriber.spaceWaiters.length > 0) {
        subscriber.spaceWaiters.shift()();
      }
    }
    this.subscribers.clear();
  }
}

// Drop-oldest, replay, and independent subscriber queues.
async function runTests() {
  const channel = new AsyncBroadcastChannel({
    capacity: 2,
    overflow: "drop-oldest",
    historySize: 2
  });
  const first = channel.subscribe();

  await channel.publish(1);
  await channel.publish(2);
  await channel.publish(3);

  assert.deepEqual(await first.next(), { value: 2, done: false });
  assert.deepEqual(await first.next(), { value: 3, done: false });

  const late = channel.subscribe({ replay: 2 });
  assert.deepEqual(await late.next(), { value: 2, done: false });
  assert.deepEqual(await late.next(), { value: 3, done: false });

  // Drop-newest preserves the oldest queued item when full.
  const dropping = new AsyncBroadcastChannel({
    capacity: 1,
    overflow: "drop-newest"
  });
  const droppingReader = dropping.subscribe();
  await dropping.publish("kept");
  await dropping.publish("discarded");
  assert.deepEqual(await droppingReader.next(), {
    value: "kept",
    done: false
  });

  // Block mode applies backpressure until the slow reader consumes an item.
  const blocking = new AsyncBroadcastChannel({
    capacity: 1,
    overflow: "block"
  });
  const blockingReader = blocking.subscribe();
  await blocking.publish("first");

  let secondFinished = false;
  const secondPublish = blocking.publish("second").then(() => {
    secondFinished = true;
  });
  await Promise.resolve();
  assert.equal(secondFinished, false);

  assert.deepEqual(await blockingReader.next(), {
    value: "first",
    done: false
  });
  await secondPublish;
  assert.deepEqual(await blockingReader.next(), {
    value: "second",
    done: false
  });

  blocking.close();
  assert.deepEqual(await blockingReader.next(), {
    value: undefined,
    done: true
  });
  await assert.rejects(
    blocking.publish("after-close"),
    /closed channel/
  );

  const failure = new Error("stream failed");
  const failing = new AsyncBroadcastChannel();
  const failingReader = failing.subscribe();
  failing.close(failure);
  await assert.rejects(failingReader.next(), /stream failed/);

  await first.return();
  await late.return();
  await droppingReader.return();

  assert.throws(
    () => new AsyncBroadcastChannel({ capacity: 0 }),
    RangeError
  );
  assert.throws(
    () => channel.subscribe({ replay: 3 }),
    RangeError
  );
}

runTests()
  .then(() => console.log("AsyncBroadcastChannel tests passed."))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });

module.exports = { AsyncBroadcastChannel };
