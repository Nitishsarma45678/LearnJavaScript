'use strict';

/**
 * Exercise: implement a FIFO weighted semaphore for asynchronous work.
 * Requests reserve integer permits. Strict FIFO ordering prevents starvation,
 * even when a smaller request behind the queue head would fit. Queued requests
 * support AbortSignal cancellation and timeouts. Releases are idempotent;
 * close() rejects waiters but does not revoke permits already held.
 */

class SemaphoreTimeoutError extends Error {
  constructor(message = 'semaphore acquisition timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

function makeAbortError(reason) {
  const error = new Error('semaphore acquisition aborted');
  error.name = 'AbortError';
  if (reason !== undefined) error.cause = reason;
  return error;
}

class WeightedSemaphore {
  constructor(capacity, { maxQueue = Infinity } = {}) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('capacity must be a positive integer');
    if (maxQueue !== Infinity && (!Number.isInteger(maxQueue) || maxQueue < 0)) {
      throw new RangeError('maxQueue must be a non-negative integer or Infinity');
    }
    this.capacity = capacity;
    this.maxQueue = maxQueue;
    this._active = 0;
    this._queue = [];
    this._closedError = null;
  }

  get active() { return this._active; }
  get available() { return this.capacity - this._active; }
  get pending() { return this._queue.length; }
  get closed() { return this._closedError !== null; }

  acquire(weight = 1, { signal, timeoutMs } = {}) {
    if (!Number.isInteger(weight) || weight < 1 || weight > this.capacity) {
      throw new RangeError('weight must be an integer between 1 and capacity');
    }
    if (timeoutMs !== undefined &&
        (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs < 0)) {
      throw new RangeError('timeoutMs must be a finite non-negative number');
    }
    if (this._closedError) return Promise.reject(this._closedError);
    if (signal && signal.aborted) return Promise.reject(makeAbortError(signal.reason));

    if (this._queue.length === 0 && this._active + weight <= this.capacity) {
      this._active += weight;
      return Promise.resolve(this._makeRelease(weight));
    }
    if (this._queue.length >= this.maxQueue) return Promise.reject(new Error('semaphore queue is full'));

    return new Promise((resolve, reject) => {
      const waiter = { weight, resolve, reject, signal, onAbort: null, timer: null, settled: false };
      waiter.onAbort = () => this._rejectWaiter(waiter, makeAbortError(signal.reason));
      if (signal) signal.addEventListener('abort', waiter.onAbort, { once: true });
      if (timeoutMs !== undefined) {
        waiter.timer = setTimeout(() => this._rejectWaiter(waiter, new SemaphoreTimeoutError()), timeoutMs);
      }
      this._queue.push(waiter);
      if (signal && signal.aborted) waiter.onAbort();
      else this._drain();
    });
  }

  async runExclusive(task, weight = 1, options = {}) {
    if (typeof task !== 'function') throw new TypeError('task must be a function');
    const release = await this.acquire(weight, options);
    try { return await task(); }
    finally { release(); }
  }

  close(reason = new Error('semaphore is closed')) {
    if (this._closedError) return false;
    this._closedError = reason instanceof Error ? reason : new Error(String(reason));
    for (const waiter of this._queue.splice(0)) {
      this._cleanup(waiter);
      waiter.settled = true;
      waiter.reject(this._closedError);
    }
    return true;
  }

  _cleanup(waiter) {
    if (waiter.signal && waiter.onAbort) waiter.signal.removeEventListener('abort', waiter.onAbort);
    if (waiter.timer !== null) {
      clearTimeout(waiter.timer);
      waiter.timer = null;
    }
  }

  _rejectWaiter(waiter, error) {
    if (waiter.settled) return;
    const index = this._queue.indexOf(waiter);
    if (index === -1) return;
    this._queue.splice(index, 1);
    waiter.settled = true;
    this._cleanup(waiter);
    waiter.reject(error);
    this._drain();
  }

  _makeRelease(weight) {
    let released = false;
    return () => {
      if (released) return false;
      released = true;
      this._active -= weight;
      if (this._active < 0) throw new Error('semaphore permit invariant violated');
      this._drain();
      return true;
    };
  }

  _grant(waiter) {
    waiter.settled = true;
    this._cleanup(waiter);
    this._active += waiter.weight;
    waiter.resolve(this._makeRelease(waiter.weight));
  }

  _drain() {
    if (this._closedError) return;
    while (this._queue.length > 0) {
      const waiter = this._queue[0];
      if (waiter.signal && waiter.signal.aborted) {
        this._rejectWaiter(waiter, makeAbortError(waiter.signal.reason));
        continue;
      }
      if (this._active + waiter.weight > this.capacity) return;
      this._queue.shift();
      this._grant(waiter);
    }
  }
}

async function runTests() {
  const assert = require('node:assert/strict');

  const semaphore = new WeightedSemaphore(3);
  const releaseOne = await semaphore.acquire(1);
  const order = [];
  const first = semaphore.acquire(3).then(release => { order.push('weight-3'); return release; });
  const second = semaphore.acquire(1).then(release => { order.push('weight-1'); return release; });
  assert.equal(semaphore.pending, 2);
  releaseOne();
  const releaseFirst = await first;
  assert.deepEqual(order, ['weight-3']);
  assert.equal(semaphore.active, 3);
  releaseFirst();
  const releaseSecond = await second;
  assert.deepEqual(order, ['weight-3', 'weight-1']);
  assert.equal(releaseSecond(), true);
  assert.equal(releaseSecond(), false);
  assert.equal(semaphore.active, 0);

  const single = new WeightedSemaphore(1);
  const held = await single.acquire();
  const controller = new AbortController();
  const aborted = single.acquire(1, { signal: controller.signal }).then(() => null, error => error);
  controller.abort('caller left');
  assert.equal((await aborted).name, 'AbortError');
  assert.equal(single.pending, 0);
  held();

  const timeoutSemaphore = new WeightedSemaphore(1);
  const timeoutRelease = await timeoutSemaphore.acquire();
  const timeoutResult = await timeoutSemaphore.acquire(1, { timeoutMs: 5 }).then(
    () => null, error => error
  );
  assert.equal(timeoutResult.name, 'TimeoutError');
  assert.equal(timeoutSemaphore.active, 1);
  timeoutRelease();

  assert.equal(await semaphore.runExclusive(async () => 42, 2), 42);
  let thrown = false;
  try { await semaphore.runExclusive(() => { throw new Error('task failed'); }); }
  catch (error) { thrown = error.message === 'task failed'; }
  assert.equal(thrown, true);
  assert.equal(semaphore.active, 0);

  const closing = new WeightedSemaphore(1);
  const activeRelease = await closing.acquire();
  const queued = closing.acquire().then(() => null, error => error);
  closing.close(new Error('maintenance'));
  assert.equal((await queued).message, 'maintenance');
  const futureError = await closing.acquire().then(() => null, error => error);
  assert.equal(futureError.message, 'maintenance');
  assert.equal(activeRelease(), true);
  assert.equal(closing.active, 0);

  const bounded = new WeightedSemaphore(1, { maxQueue: 0 });
  const boundedRelease = await bounded.acquire();
  const fullError = await bounded.acquire().then(() => null, error => error);
  assert.match(fullError.message, /queue is full/);
  boundedRelease();
  assert.throws(() => new WeightedSemaphore(0), /positive integer/);
  assert.throws(() => semaphore.acquire(4), /between 1 and capacity/);

  return { checks: 25, asyncScenarios: 7 };
}

if (typeof module !== 'undefined') {
  module.exports = { WeightedSemaphore, SemaphoreTimeoutError, runTests };
}
