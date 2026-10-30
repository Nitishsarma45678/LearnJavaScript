'use strict';

/**
 * FIFO asynchronous token-bucket rate limiter.
 * Capacity controls burst size; refillPerSecond controls sustained throughput.
 * Tasks begin as soon as a token is available and may then run concurrently.
 * Queued requests support AbortSignal cancellation; close() rejects the queue.
 */
class TokenBucketLimiter {
  constructor({ capacity, refillPerSecond, now = () => performance.now() } = {}) {
    if (!Number.isFinite(capacity) || capacity < 1) throw new RangeError('capacity must be >= 1');
    if (!Number.isFinite(refillPerSecond) || refillPerSecond <= 0) {
      throw new RangeError('refillPerSecond must be > 0');
    }
    if (typeof now !== 'function') throw new TypeError('now must be a function');
    this.capacity = capacity;
    this.refillPerSecond = refillPerSecond;
    this.now = now;
    this.tokens = capacity;
    this.lastRefill = now();
    this.queue = [];
    this.timer = null;
    this.closed = false;
  }

  schedule(task, { signal } = {}) {
    if (typeof task !== 'function') return Promise.reject(new TypeError('task must be a function'));
    if (this.closed) return Promise.reject(new Error('limiter is closed'));
    if (signal && signal.aborted) return Promise.reject(abortError(signal.reason));

    return new Promise((resolve, reject) => {
      const job = { task, resolve, reject, signal, onAbort: null };
      if (signal) {
        job.onAbort = () => {
          const index = this.queue.indexOf(job);
          if (index === -1) return; // Already admitted; cancellation does not stop running work.
          this.queue.splice(index, 1);
          signal.removeEventListener('abort', job.onAbort);
          reject(abortError(signal.reason));
          this.pump();
        };
        signal.addEventListener('abort', job.onAbort, { once: true });
      }
      this.queue.push(job);
      this.pump();
    });
  }

  refill() {
    const current = this.now();
    if (!Number.isFinite(current) || current < this.lastRefill) {
      throw new RangeError('clock must return a finite, non-decreasing value');
    }
    const elapsedSeconds = (current - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillPerSecond);
    this.lastRefill = current;
  }

  pump() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.closed) return;
    this.refill();

    while (this.queue.length && this.tokens >= 1) {
      const job = this.queue.shift();
      if (job.signal) {
        job.signal.removeEventListener('abort', job.onAbort);
        if (job.signal.aborted) {
          job.reject(abortError(job.signal.reason));
          continue;
        }
      }
      this.tokens -= 1;
      Promise.resolve().then(job.task).then(job.resolve, job.reject);
    }

    if (this.queue.length) {
      const waitMs = Math.max(1, Math.ceil((1 - this.tokens) / this.refillPerSecond * 1000));
      this.timer = setTimeout(() => {
        this.timer = null;
        this.pump();
      }, waitMs);
    }
  }

  close(reason = new Error('limiter is closed')) {
    if (this.closed) return;
    this.closed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    for (const job of this.queue.splice(0)) {
      if (job.signal) job.signal.removeEventListener('abort', job.onAbort);
      job.reject(reason);
    }
  }
}

function abortError(reason) {
  if (reason instanceof Error) return reason;
  const error = new Error(reason === undefined ? 'The operation was aborted' : String(reason));
  error.name = 'AbortError';
  return error;
}

// ------------------------------- Tests -------------------------------
if (require.main === module) {
  const assert = require('node:assert/strict');
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  (async () => {
    const limiter = new TokenBucketLimiter({ capacity: 2, refillPerSecond: 25 });
    const starts = [];
    const tasks = Array.from({ length: 4 }, (_, index) => limiter.schedule(async () => {
      starts.push(Date.now());
      await delay(2);
      return index;
    }));
    assert.deepEqual(await Promise.all(tasks), [0, 1, 2, 3]);
    assert.equal(starts.length, 4);
    assert.ok(starts[2] - starts[0] >= 25, `expected refill delay, got ${starts[2] - starts[0]}ms`);

    const gated = new TokenBucketLimiter({ capacity: 1, refillPerSecond: 1 });
    let releaseFirst;
    const first = gated.schedule(() => new Promise(resolve => { releaseFirst = resolve; }));
    const controller = new AbortController();
    let secondStarted = false;
    const second = gated.schedule(() => { secondStarted = true; }, { signal: controller.signal });
    controller.abort('cancel queued request');
    await assert.rejects(second, error => error.name === 'AbortError');
    releaseFirst('done');
    assert.equal(await first, 'done');
    assert.equal(secondStarted, false);

    gated.close();
    await assert.rejects(gated.schedule(() => 1), /closed/);
    limiter.close();
    console.log('Token bucket limiter tests passed');
  })().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { TokenBucketLimiter };
