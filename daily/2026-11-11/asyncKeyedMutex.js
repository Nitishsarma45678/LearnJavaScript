'use strict';

// Fair keyed mutex: independent keys run concurrently; same-key acquisitions
// are FIFO. Queued waiters may abort, releases are idempotent, and withKey
// always releases even when its callback throws. AbortSignal only cancels a
// waiter before grant; owners must release explicitly.
const assert = require('node:assert/strict');

class AsyncKeyedMutex {
  constructor() {
    this.states = new Map();
  }

  _abortError(signal) {
    if (signal && signal.reason instanceof Error) return signal.reason;
    const error = new Error('The lock acquisition was aborted');
    error.name = 'AbortError';
    return error;
  }

  acquire(key, { signal } = {}) {
    if (signal && signal.aborted) return Promise.reject(this._abortError(signal));
    let state = this.states.get(key);
    if (!state) {
      state = { locked: false, queue: [] };
      this.states.set(key, state);
    }
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, signal, onAbort: null, granted: false };
      if (signal) {
        waiter.onAbort = () => {
          if (waiter.granted) return;
          const index = state.queue.indexOf(waiter);
          if (index !== -1) state.queue.splice(index, 1);
          signal.removeEventListener('abort', waiter.onAbort);
          reject(this._abortError(signal));
          this._pump(key, state);
        };
        signal.addEventListener('abort', waiter.onAbort, { once: true });
      }
      state.queue.push(waiter);
      this._pump(key, state);
    });
  }

  async withKey(key, callback, options) {
    if (typeof callback !== 'function') throw new TypeError('callback must be a function');
    const release = await this.acquire(key, options);
    try {
      return await callback();
    } finally {
      release();
    }
  }

  pending(key) {
    return this.states.get(key)?.queue.length || 0;
  }

  isLocked(key) {
    return Boolean(this.states.get(key)?.locked);
  }

  _pump(key, state) {
    if (state.locked) return;
    while (state.queue.length) {
      const waiter = state.queue.shift();
      if (waiter.signal?.aborted) {
        if (waiter.onAbort) waiter.signal.removeEventListener('abort', waiter.onAbort);
        waiter.reject(this._abortError(waiter.signal));
        continue;
      }
      state.locked = true;
      waiter.granted = true;
      if (waiter.onAbort) waiter.signal.removeEventListener('abort', waiter.onAbort);
      let released = false;
      waiter.resolve(() => {
        if (released) return false;
        released = true;
        state.locked = false;
        this._pump(key, state);
        if (!state.locked && state.queue.length === 0) this.states.delete(key);
        return true;
      });
      return;
    }
    if (!state.locked) this.states.delete(key);
  }
}

async function runTests() {
  const mutex = new AsyncKeyedMutex();
  const releaseA = await mutex.acquire('account:A');
  const order = [];
  const first = mutex.acquire('account:A').then(release => {
    order.push('first');
    return release;
  });
  const second = mutex.acquire('account:A').then(release => {
    order.push('second');
    return release;
  });
  assert.equal(mutex.pending('account:A'), 2);

  const releaseB = await mutex.acquire('account:B');
  assert.equal(mutex.isLocked('account:B'), true, 'different keys must not block each other');
  releaseB();
  releaseA();
  const releaseFirst = await first;
  assert.deepEqual(order, ['first']);
  releaseFirst();
  const releaseSecond = await second;
  assert.deepEqual(order, ['first', 'second']);
  releaseSecond();
  assert.equal(mutex.isLocked('account:A'), false);

  const hold = await mutex.acquire('abort-key');
  const controller = new AbortController();
  const aborted = mutex.acquire('abort-key', { signal: controller.signal });
  const later = mutex.acquire('abort-key');
  controller.abort();
  await assert.rejects(aborted, error => error.name === 'AbortError');
  assert.equal(mutex.pending('abort-key'), 1);
  hold();
  const releaseLater = await later;
  releaseLater();

  let entered = 0;
  await assert.rejects(mutex.withKey('exception-key', async () => {
    entered++;
    throw new Error('work failed');
  }), /work failed/);
  assert.equal(entered, 1);
  assert.equal(mutex.isLocked('exception-key'), false);

  const alreadyAborted = new AbortController();
  alreadyAborted.abort();
  await assert.rejects(
    mutex.acquire('never', { signal: alreadyAborted.signal }),
    error => error.name === 'AbortError'
  );

  const once = await mutex.acquire('idempotent');
  assert.equal(once(), true);
  assert.equal(once(), false);
  assert.equal(mutex.isLocked('idempotent'), false);
  assert.equal(mutex.pending('idempotent'), 0);
  console.log('asyncKeyedMutex: all tests passed');
}

if (require.main === module) runTests().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
module.exports = { AsyncKeyedMutex };
