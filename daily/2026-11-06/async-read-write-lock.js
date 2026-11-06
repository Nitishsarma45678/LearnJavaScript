'use strict';

const assert = require('node:assert/strict');

function makeAbortError(signal) {
  if (signal && signal.reason instanceof Error) return signal.reason;
  const error = new Error('The lock request was aborted');
  error.name = 'AbortError';
  return error;
}

/**
 * Fair asynchronous readers-writer lock.
 * Requests are FIFO: consecutive readers at the queue head share a phase,
 * but a queued writer prevents later readers from bypassing it.
 */
class AsyncReadWriteLock {
  constructor() {
    this.activeReaders = 0;
    this.writerActive = false;
    this.queue = [];
  }

  acquireRead(options = {}) { return this._acquire('read', options.signal); }
  acquireWrite(options = {}) { return this._acquire('write', options.signal); }

  async withRead(callback, options = {}) {
    if (typeof callback !== 'function') throw new TypeError('callback must be a function');
    const release = await this.acquireRead(options);
    try { return await callback(); } finally { release(); }
  }

  async withWrite(callback, options = {}) {
    if (typeof callback !== 'function') throw new TypeError('callback must be a function');
    const release = await this.acquireWrite(options);
    try { return await callback(); } finally { release(); }
  }

  get pendingCount() { return this.queue.length; }
  get readerCount() { return this.activeReaders; }
  get isWriteLocked() { return this.writerActive; }

  _acquire(kind, signal) {
    if (signal && signal.aborted) return Promise.reject(makeAbortError(signal));
    return new Promise((resolve, reject) => {
      const request = { kind, resolve, reject, signal, onAbort: null };
      if (signal) {
        request.onAbort = () => {
          const index = this.queue.indexOf(request);
          if (index === -1) return; // Already granted or removed.
          this.queue.splice(index, 1);
          signal.removeEventListener('abort', request.onAbort);
          reject(makeAbortError(signal));
          this._drain();
        };
        signal.addEventListener('abort', request.onAbort, { once: true });
        // Covers an abort that happened while the listener was being attached.
        if (signal.aborted) {
          request.onAbort();
          return;
        }
      }
      this.queue.push(request);
      this._drain();
    });
  }

  _grant(request) {
    if (request.signal && request.onAbort) {
      request.signal.removeEventListener('abort', request.onAbort);
    }
    if (request.kind === 'write') this.writerActive = true;
    else this.activeReaders++;
    let released = false;
    request.resolve(() => {
      if (released) return false;
      released = true;
      if (request.kind === 'write') this.writerActive = false;
      else this.activeReaders--;
      this._drain();
      return true;
    });
  }

  _drain() {
    if (this.writerActive) return;
    if (this.activeReaders > 0) {
      // Existing readers may admit only readers already ahead of any writer.
      while (this.queue.length && this.queue[0].kind === 'read') {
        this._grant(this.queue.shift());
      }
      return;
    }
    if (this.queue.length === 0) return;
    if (this.queue[0].kind === 'write') {
      this._grant(this.queue.shift());
      return;
    }
    // No writer is active or ahead: grant the contiguous reader phase.
    while (this.queue.length && this.queue[0].kind === 'read') {
      this._grant(this.queue.shift());
    }
  }
}

async function runTests() {
  const lock = new AsyncReadWriteLock();
  const firstReaderRelease = await lock.acquireRead();
  assert.equal(lock.readerCount, 1);

  const order = [];
  let writerRelease;
  let laterReaderRelease;
  const writerGranted = lock.acquireWrite().then((release) => {
    order.push('writer');
    writerRelease = release;
  });
  const laterReaderGranted = lock.acquireRead().then((release) => {
    order.push('later-reader');
    laterReaderRelease = release;
  });
  assert.equal(lock.pendingCount, 2);
  firstReaderRelease();
  await writerGranted;
  assert.deepEqual(order, ['writer']);
  assert.equal(lock.isWriteLocked, true);
  writerRelease();
  await laterReaderGranted;
  assert.deepEqual(order, ['writer', 'later-reader']);
  assert.equal(lock.readerCount, 1);
  laterReaderRelease();
  assert.equal(laterReaderRelease(), false, 'release must be idempotent');

  // A group of readers at the head can overlap.
  let releaseA, releaseB;
  const both = Promise.all([
    lock.acquireRead().then((release) => { releaseA = release; }),
    lock.acquireRead().then((release) => { releaseB = release; })
  ]);
  await both;
  assert.equal(lock.readerCount, 2);
  releaseA(); releaseB();

  // A queued request can be cancelled without blocking later work.
  const heldWriter = await lock.acquireWrite();
  const controller = new AbortController();
  const cancelled = lock.acquireRead({ signal: controller.signal });
  assert.equal(lock.pendingCount, 1);
  controller.abort(new Error('test cancellation'));
  await assert.rejects(cancelled, /test cancellation/);
  assert.equal(lock.pendingCount, 0);
  heldWriter();

  const value = await lock.withWrite(async () => 42);
  assert.equal(value, 42);
  await assert.rejects(lock.acquireRead({ signal: AbortSignal.abort() }), { name: 'AbortError' });
  assert.equal(lock.readerCount, 0);
  assert.equal(lock.isWriteLocked, false);
  console.log('Async read-write lock: all tests passed');
}

if (require.main === module) runTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
module.exports = { AsyncReadWriteLock };
