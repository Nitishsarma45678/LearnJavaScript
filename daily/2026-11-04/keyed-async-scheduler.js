'use strict';

const assert = require('node:assert/strict');

function makeAbortError() {
  const error = new Error('The queued task was aborted');
  error.name = 'AbortError';
  return error;
}

/**
 * Runs at most limit tasks concurrently and never overlaps tasks sharing
 * the same key. Same-key tasks retain FIFO order; blocked keys do not prevent
 * unrelated keys from using free capacity.
 */
class KeyedTaskScheduler {
  constructor(limit) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError('limit must be a positive integer');
    this.limit = limit;
    this.queue = [];
    this.activeKeys = new Set();
    this.running = 0;
    this.closed = false;
    this.idleWaiters = new Set();
  }

  get pendingCount() {
    return this.queue.reduce((count, job) => count + (!job.settled ? 1 : 0), 0);
  }

  schedule(key, task, { signal } = {}) {
    if (typeof task !== 'function') throw new TypeError('task must be a function');
    if (this.closed) return Promise.reject(new Error('scheduler is closed'));
    if (signal && signal.aborted) return Promise.reject(makeAbortError());

    return new Promise((resolve, reject) => {
      const job = {
        key, task, signal, resolve, reject,
        started: false, settled: false, abortListener: null
      };

      if (signal) {
        job.abortListener = () => {
          if (job.started || job.settled) return;
          job.settled = true;
          const index = this.queue.indexOf(job);
          if (index !== -1) this.queue.splice(index, 1);
          this._cleanup(job);
          reject(makeAbortError());
          this._drain();
          this._notifyIdle();
        };
        signal.addEventListener('abort', job.abortListener, { once: true });
      }

      this.queue.push(job);
      this._drain();
    });
  }

  _cleanup(job) {
    if (job.signal && job.abortListener) {
      job.signal.removeEventListener('abort', job.abortListener);
      job.abortListener = null;
    }
  }

  _drain() {
    while (this.running < this.limit) {
      const index = this.queue.findIndex(job =>
        !job.settled && !this.activeKeys.has(job.key)
      );
      if (index === -1) break;

      const [job] = this.queue.splice(index, 1);
      if (job.signal && job.signal.aborted) {
        job.settled = true;
        this._cleanup(job);
        job.reject(makeAbortError());
        continue;
      }

      job.started = true;
      this.running++;
      this.activeKeys.add(job.key);

      Promise.resolve()
        .then(() => job.task(job.signal))
        .then(
          value => { job.settled = true; job.resolve(value); },
          error => { job.settled = true; job.reject(error); }
        )
        .finally(() => {
          this._cleanup(job);
          this.running--;
          this.activeKeys.delete(job.key);
          this._drain();
          this._notifyIdle();
        });
    }
    this._notifyIdle();
  }

  onIdle() {
    if (this.running === 0 && this.pendingCount === 0) return Promise.resolve();
    return new Promise(resolve => this.idleWaiters.add(resolve));
  }

  _notifyIdle() {
    if (this.running !== 0 || this.pendingCount !== 0) return;
    for (const resolve of this.idleWaiters) resolve();
    this.idleWaiters.clear();
  }

  async close({ cancelPending = false } = {}) {
    this.closed = true;
    if (cancelPending) {
      for (const job of [...this.queue]) {
        if (job.settled) continue;
        job.settled = true;
        this._cleanup(job);
        job.reject(makeAbortError());
      }
      this.queue.length = 0;
    } else {
      this._drain();
    }
    await this.onIdle();
  }
}

async function runTests() {
  const scheduler = new KeyedTaskScheduler(2);
  const order = [];
  let releaseFirst, markStarted;
  const firstGate = new Promise(resolve => { releaseFirst = resolve; });
  const firstStarted = new Promise(resolve => { markStarted = resolve; });

  const first = scheduler.schedule('account-A', async () => {
    order.push('first-start');
    markStarted();
    await firstGate;
    order.push('first-end');
    return 'first';
  });
  await firstStarted;

  const second = scheduler.schedule('account-A', async () => {
    order.push('second');
    return 'second';
  });
  const unrelated = scheduler.schedule('account-B', async () => {
    order.push('unrelated');
    return 'unrelated';
  });

  assert.equal(await unrelated, 'unrelated');
  assert.deepEqual(order, ['first-start', 'unrelated']);
  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), ['first', 'second']);
  assert.deepEqual(order, ['first-start', 'unrelated', 'first-end', 'second']);
  await scheduler.onIdle();
  await scheduler.close();
  await assert.rejects(scheduler.schedule('late', async () => 1), /closed/);

  const abortingScheduler = new KeyedTaskScheduler(1);
  let releaseBlocker, blockerStartedResolve;
  const blockerGate = new Promise(resolve => { releaseBlocker = resolve; });
  const blockerStarted = new Promise(resolve => { blockerStartedResolve = resolve; });
  const blocker = abortingScheduler.schedule('blocker', async () => {
    blockerStartedResolve();
    await blockerGate;
    return 'released';
  });
  await blockerStarted;

  const controller = new AbortController();
  let shouldNotRun = false;
  const cancelled = abortingScheduler.schedule('cancel-me', async () => {
    shouldNotRun = true;
  }, { signal: controller.signal });
  controller.abort();
  await assert.rejects(cancelled, error => error.name === 'AbortError');
  releaseBlocker();
  assert.equal(await blocker, 'released');
  await abortingScheduler.close();
  assert.equal(shouldNotRun, false);
}

runTests().then(
  () => console.log('Keyed async scheduler tests passed'),
  error => { console.error(error); process.exitCode = 1; }
);