const assert = require('node:assert/strict');

class AsyncBoundedQueue {
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('capacity must be a positive integer');
    }
    this.capacity = capacity;
    this.items = [];
    this.consumers = [];
    this.producers = [];
    this.closed = false;
  }

  enqueue(value) {
    if (this.closed) return Promise.reject(new Error('Queue is closed'));

    if (this.consumers.length > 0) {
      this.consumers.shift()({ value, done: false });
      return Promise.resolve();
    }

    if (this.items.length < this.capacity) {
      this.items.push(value);
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.producers.push({ value, resolve, reject });
    });
  }

  dequeue() {
    if (this.items.length > 0) {
      const value = this.items.shift();
      if (this.producers.length > 0 && !this.closed) {
        const producer = this.producers.shift();
        this.items.push(producer.value);
        producer.resolve();
      }
      return Promise.resolve({ value, done: false });
    }

    if (this.closed) return Promise.resolve({ value: undefined, done: true });
    return new Promise(resolve => this.consumers.push(resolve));
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    const error = new Error('Queue closed before item could be enqueued');
    for (const producer of this.producers.splice(0)) producer.reject(error);
    if (this.items.length === 0) {
      for (const consumer of this.consumers.splice(0)) {
        consumer({ value: undefined, done: true });
      }
    }
  }

  [Symbol.asyncIterator]() {
    return { next: () => this.dequeue() };
  }
}

(async () => {
  const queue = new AsyncBoundedQueue(1);
  await queue.enqueue('first');
  let secondEnqueued = false;
  const producer = queue.enqueue('second').then(() => { secondEnqueued = true; });
  await Promise.resolve();
  assert.equal(secondEnqueued, false, 'second producer must wait while the buffer is full');

  assert.deepEqual(await queue.dequeue(), { value: 'first', done: false });
  await producer;
  assert.equal(secondEnqueued, true);
  assert.deepEqual(await queue.dequeue(), { value: 'second', done: false });

  const waitingConsumer = queue.dequeue();
  queue.close();
  assert.deepEqual(await waitingConsumer, { value: undefined, done: true });
  assert.deepEqual(await queue.dequeue(), { value: undefined, done: true });
  await assert.rejects(queue.enqueue('late'), /closed/);

  const draining = new AsyncBoundedQueue(2);
  await draining.enqueue(1);
  await draining.enqueue(2);
  draining.close();
  assert.deepEqual(await draining.dequeue(), { value: 1, done: false });
  assert.deepEqual(await draining.dequeue(), { value: 2, done: false });
  assert.deepEqual(await draining.dequeue(), { value: undefined, done: true });

  console.log('Async bounded queue tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});