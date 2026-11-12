'use strict';

/**
 * FIFO sliding-window rate limiter. A permit is a timestamped admission,
 * not a lock: it expires automatically after windowMs. Queued callers may
 * cancel with AbortSignal, and timers/clocks are injectable for deterministic tests.
 */
class SlidingWindowRateLimiter {
  constructor({ limit, windowMs, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError('limit must be a positive integer');
    if (!Number.isFinite(windowMs) || windowMs <= 0) throw new RangeError('windowMs must be positive');
    if (typeof now !== 'function' || typeof setTimer !== 'function' || typeof clearTimer !== 'function') {
      throw new TypeError('clock and timer functions must be callable');
    }
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.timestamps = [];
    this.queue = [];
    this.timer = null;
    this.closed = false;
    this.sequence = 0;
  }

  prune(at = this.now()) {
    const cutoff = at - this.windowMs;
    while (this.timestamps.length && this.timestamps[0] <= cutoff) this.timestamps.shift();
  }

  cleanup(waiter) {
    if (waiter.signal && waiter.abortHandler) {
      waiter.signal.removeEventListener('abort', waiter.abortHandler);
      waiter.abortHandler = null;
    }
  }

  grant(waiter, at) {
    this.cleanup(waiter);
    this.timestamps.push(at);
    waiter.resolve(Object.freeze({ grantedAt: at, sequence: ++this.sequence }));
  }

  acquire({ signal } = {}) {
    if (this.closed) return Promise.reject(new Error('rate limiter is closed'));
    if (signal?.aborted) return Promise.reject(signal.reason ?? new Error('acquisition aborted'));

    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, signal, abortHandler: null };
      if (signal) {
        waiter.abortHandler = () => {
          const index = this.queue.indexOf(waiter);
          if (index === -1) return;
          this.queue.splice(index, 1);
          this.cleanup(waiter);
          reject(signal.reason ?? new Error('acquisition aborted'));
          this.drain();
        };
        signal.addEventListener('abort', waiter.abortHandler, { once: true });
      }
      this.queue.push(waiter);
      this.drain();
    });
  }

  drain() {
    if (this.closed) return;
    const at = this.now();
    this.prune(at);
    while (this.queue.length && this.timestamps.length < this.limit) {
      const waiter = this.queue.shift();
      if (waiter.signal?.aborted) {
        this.cleanup(waiter);
        waiter.reject(waiter.signal.reason ?? new Error('acquisition aborted'));
        continue;
      }
      this.grant(waiter, at);
    }
    this.scheduleWake(at);
  }

  scheduleWake(at = this.now()) {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    if (!this.queue.length || this.closed || this.timestamps.length < this.limit) return;
    const delay = Math.max(0, this.timestamps[0] + this.windowMs - at);
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.drain();
    }, delay);
  }

  close(reason = new Error('rate limiter closed')) {
    if (this.closed) return;
    this.closed = true;
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    for (const waiter of this.queue.splice(0)) {
      this.cleanup(waiter);
      waiter.reject(reason);
    }
  }

  snapshot() {
    this.prune();
    return Object.freeze({
      closed: this.closed,
      requestsInWindow: this.timestamps.length,
      queued: this.queue.length,
      remaining: Math.max(0, this.limit - this.timestamps.length)
    });
  }
}

class FakeClock {
  constructor() { this.time = 0; this.nextId = 1; this.tasks = new Map(); }
  now = () => this.time;
  setTimer = (callback, delay) => {
    const id = this.nextId++;
    this.tasks.set(id, { at: this.time + delay, callback });
    return id;
  };
  clearTimer = id => this.tasks.delete(id);
  advance(milliseconds) {
    const target = this.time + milliseconds;
    while (true) {
      let selectedId = null;
      let selected = null;
      for (const [id, task] of this.tasks) {
        if (task.at <= target && (!selected || task.at < selected.at)) {
          selectedId = id;
          selected = task;
        }
      }
      if (!selected) break;
      this.tasks.delete(selectedId);
      this.time = selected.at;
      selected.callback();
    }
    this.time = target;
  }
}

async function runTests() {
  const assert = require('node:assert/strict');
  const clock = new FakeClock();
  const limiter = new SlidingWindowRateLimiter({
    limit: 2, windowMs: 100,
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer
  });

  const first = await limiter.acquire();
  const second = await limiter.acquire();
  assert.deepEqual([first.sequence, second.sequence], [1, 2]);
  const thirdPromise = limiter.acquire();
  const controller = new AbortController();
  const cancelledPromise = limiter.acquire({ signal: controller.signal });
  const cancelledAssertion = assert.rejects(cancelledPromise, /cancelled/);
  controller.abort(new Error('cancelled by caller'));
  await cancelledAssertion;
  assert.equal(limiter.snapshot().queued, 1);

  clock.advance(100);
  const third = await thirdPromise;
  assert.equal(third.grantedAt, 100);
  assert.equal(third.sequence, 3);
  const fourth = await limiter.acquire();
  assert.equal(fourth.sequence, 4);
  assert.equal(limiter.snapshot().requestsInWindow, 2);

  const fifthPromise = limiter.acquire();
  clock.advance(99);
  assert.equal(limiter.snapshot().queued, 1);
  clock.advance(1);
  const fifth = await fifthPromise;
  assert.equal(fifth.grantedAt, 200);
  await limiter.acquire(); // occupy the second slot in the new window

  const pending = limiter.acquire();
  const closedAssertion = assert.rejects(pending, /maintenance/);
  limiter.close(new Error('maintenance'));
  await closedAssertion;
  await assert.rejects(limiter.acquire(), /closed/);
  assert.equal(limiter.snapshot().closed, true);
  console.log('Async sliding-window rate limiter tests passed');
}

if (require.main === module) runTests().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
module.exports = { SlidingWindowRateLimiter };
