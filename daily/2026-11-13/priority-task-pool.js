/**
 * Exercise: Build an asynchronous task pool with priorities and aging.
 *
 * Queued tasks are selected by effectivePriority = basePriority + age steps.
 * FIFO sequence numbers break ties. External cancellation rejects the caller
 * immediately; a running task keeps its slot until it actually settles, even
 * when it ignores AbortSignal, so the configured concurrency is never lied about.
 */
'use strict';

class TaskPool {
  constructor({ concurrency = 3, agingMs = 1000, now = () => Date.now() } = {}) {
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError('concurrency must be >= 1');
    if (!(agingMs > 0)) throw new RangeError('agingMs must be > 0');
    this.concurrency = concurrency; this.agingMs = agingMs; this.now = now;
    this.queue = []; this.running = new Set(); this.sequence = 0; this.closed = false; this.idleWaiters = [];
  }
  get activeCount() { return this.running.size; }
  get pendingCount() { return this.queue.length; }

  run(task, { priority = 0, signal } = {}) {
    if (typeof task !== 'function') return Promise.reject(new TypeError('task must be a function'));
    if (!Number.isFinite(priority)) return Promise.reject(new TypeError('priority must be finite'));
    if (this.closed) return Promise.reject(new Error('TaskPool is closed'));
    if (signal?.aborted) return Promise.reject(abortError(signal.reason));

    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const record = { task, priority, enqueuedAt: this.now(), sequence: this.sequence++, controller,
        resolve, reject, signal, status: 'queued', settled: false, onAbort: null };
      record.onAbort = () => this._cancel(record, signal.reason);
      signal?.addEventListener('abort', record.onAbort, { once: true });
      this.queue.push(record);
      this._pump();
    });
  }

  _settle(record, error, value) {
    if (record.settled) return;
    record.settled = true;
    record.signal?.removeEventListener('abort', record.onAbort);
    if (error) record.reject(error); else record.resolve(value);
  }

  _cancel(record, reason) {
    const error = abortError(reason);
    record.controller.abort(reason);
    if (record.status === 'queued') {
      const index = this.queue.indexOf(record);
      if (index >= 0) this.queue.splice(index, 1);
      record.status = 'cancelled'; this._settle(record, error);
      this._notifyIdle(); this._pump();
    } else if (record.status === 'running') {
      // Keep the active slot until the task's promise settles.
      this._settle(record, error);
    }
  }

  _next() {
    const now = this.now();
    this.queue.sort((a, b) => {
      const pa = a.priority + Math.floor(Math.max(0, now - a.enqueuedAt) / this.agingMs);
      const pb = b.priority + Math.floor(Math.max(0, now - b.enqueuedAt) / this.agingMs);
      return pb - pa || a.sequence - b.sequence;
    });
    return this.queue.shift();
  }

  _pump() {
    while (!this.closed && this.running.size < this.concurrency && this.queue.length) {
      const record = this._next();
      if (record.settled || record.controller.signal.aborted) continue;
      record.status = 'running'; this.running.add(record);
      Promise.resolve().then(() => record.task(record.controller.signal))
        .then(value => this._settle(record, null, value), error => this._settle(record, error))
        .finally(() => {
          record.status = 'done'; this.running.delete(record);
          this._pump(); this._notifyIdle();
        });
    }
    this._notifyIdle();
  }

  close({ abortRunning = false, reason = 'TaskPool closed' } = {}) {
    if (this.closed) return;
    this.closed = true;
    for (const record of this.queue.splice(0)) {
      record.status = 'cancelled'; record.controller.abort(reason); this._settle(record, abortError(reason));
    }
    if (abortRunning) for (const record of this.running) this._cancel(record, reason);
    this._notifyIdle();
  }

  onIdle() {
    if (this.queue.length === 0 && this.running.size === 0) return Promise.resolve();
    return new Promise(resolve => this.idleWaiters.push(resolve));
  }

  _notifyIdle() {
    if (this.queue.length || this.running.size) return;
    for (const resolve of this.idleWaiters.splice(0)) resolve();
  }
}

function abortError(reason) {
  if (reason instanceof Error) return reason;
  const error = new Error(reason == null ? 'The operation was aborted' : String(reason));
  error.name = 'AbortError'; return error;
}

// ------------------------------- Tests ------------------------------------
if (require.main === module) {
  const assert = require('node:assert/strict');
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  (async () => {
    const pool = new TaskPool({ concurrency: 1, agingMs: 10000 });
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const order = [];
    const first = pool.run(async () => { order.push('first'); await gate; return 1; });
    await Promise.resolve();
    const low = pool.run(() => { order.push('low'); return 2; }, { priority: 0 });
    const high = pool.run(() => { order.push('high'); return 3; }, { priority: 10 });
    release();
    assert.deepEqual(await Promise.all([first, low, high]), [1, 2, 3]);
    assert.deepEqual(order, ['first', 'high', 'low']);
    await pool.onIdle();

    const controller = new AbortController();
    let unblock;
    const blocker = new Promise(resolve => { unblock = resolve; });
    const blockerTask = pool.run(() => blocker);
    await Promise.resolve();
    const cancelled = pool.run(() => 'must not run', { signal: controller.signal });
    controller.abort('not needed');
    await assert.rejects(cancelled, { name: 'AbortError' });
    unblock('done'); await blockerTask; await pool.onIdle();

    const closing = new TaskPool({ concurrency: 1 });
    let finish;
    const running = closing.run(() => new Promise(resolve => { finish = resolve; }));
    await Promise.resolve();
    const queued = closing.run(() => 9);
    closing.close();
    await assert.rejects(queued, /TaskPool closed/);
    finish(7); assert.equal(await running, 7); await closing.onIdle();
    await assert.rejects(closing.run(() => 1), /closed/);

    const bounded = new TaskPool({ concurrency: 2 });
    let active = 0, maximum = 0;
    await Promise.all(Array.from({ length: 12 }, (_, i) => bounded.run(async () => {
      active++; maximum = Math.max(maximum, active); await delay(2); active--; return i;
    })));
    assert.equal(maximum, 2);
    console.log('Priority task pool: all tests passed');
  })().catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { TaskPool };
