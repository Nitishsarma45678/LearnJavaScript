'use strict';

/**
 * Bounded asynchronous resource pool.
 *
 * Features:
 * - lazy resource creation up to a fixed capacity;
 * - FIFO waiter handoff without temporarily idling a released resource;
 * - optional validation, per-resource use limits, queue timeouts and AbortSignal;
 * - withResource() for exception-safe leasing;
 * - graceful close(): queued acquisitions fail immediately, while active leases
 *   are destroyed when returned and close() resolves after every resource ends.
 */

class AsyncResourcePool {
  constructor(options) {
    if (!options || typeof options.create !== 'function') {
      throw new TypeError('create must be a function');
    }
    const max = options.max === undefined ? 4 : options.max;
    if (!Number.isInteger(max) || max < 1) {
      throw new RangeError('max must be a positive integer');
    }

    this.createResource = options.create;
    this.destroyResource = options.destroy || (async () => {});
    this.validateResource = options.validate || (async () => true);
    this.max = max;
    this.maxUses = options.maxUses === undefined ? Infinity : options.maxUses;

    if (!(this.maxUses === Infinity ||
      (Number.isInteger(this.maxUses) && this.maxUses > 0))) {
      throw new RangeError('maxUses must be a positive integer or Infinity');
    }

    this.total = 0;
    this.idle = [];
    this.leased = new Set();
    this.waiters = [];
    this.closed = false;
    this.closePromise = null;
    this.closeResolve = null;
    this.destroyErrors = [];
  }

  async acquire(options = {}) {
    if (this.closed) throw new Error('Resource pool is closed');
    const signal = options.signal;
    if (signal && signal.aborted) {
      throw signal.reason || new Error('Acquisition aborted');
    }

    while (this.idle.length > 0) {
      const record = this.idle.pop();
      let valid = false;
      try {
        valid = await this.validateResource(record.resource);
      } catch {
        valid = false;
      }

      if (!valid || this.closed) {
        await this._destroy(record);
        if (this.closed) throw new Error('Resource pool is closed');
        continue;
      }
      return this._lease(record);
    }

    if (this.total < this.max) {
      const record = await this._createRecord();
      if (this.closed) {
        await this._destroy(record);
        throw new Error('Resource pool is closed');
      }
      return this._lease(record);
    }

    return new Promise((resolve, reject) => {
      this._enqueue({ resolve, reject, signal, timeout: options.timeout });
    });
  }

  async withResource(callback, options = {}) {
    if (typeof callback !== 'function') throw new TypeError('callback must be a function');
    const lease = await this.acquire(options);
    try {
      return await callback(lease.resource);
    } finally {
      await lease.release();
    }
  }

  async close() {
    if (this.closePromise) return this.closePromise;

    this.closed = true;
    this.closePromise = new Promise((resolve) => {
      this.closeResolve = resolve;
    });

    for (const waiter of this.waiters.splice(0)) {
      this._rejectWaiter(waiter, new Error('Resource pool is closed'));
    }

    const idle = this.idle.splice(0);
    await Promise.all(idle.map((record) => this._destroy(record)));
    this._settleClose();
    return this.closePromise;
  }

  _createRecord() {
    this.total += 1;
    return Promise.resolve()
      .then(() => this.createResource())
      .then((resource) => ({ resource, uses: 0, destroyed: false }))
      .catch((error) => {
        this.total -= 1;
        this._drain();
        this._settleClose();
        throw error;
      });
  }

  _lease(record) {
    record.uses += 1;
    this.leased.add(record);
    let released = false;

    return Object.freeze({
      resource: record.resource,
      release: async () => {
        if (released) return false;
        released = true;
        await this._release(record);
        return true;
      }
    });
  }

  async _release(record) {
    if (!this.leased.delete(record)) return;

    if (this.closed || record.uses >= this.maxUses) {
      await this._destroy(record);
      this._drain();
      return;
    }

    const waiter = this._takeWaiter();
    if (waiter) {
      this._resolveWaiter(waiter, this._lease(record));
    } else {
      this.idle.push(record);
    }
    this._drain();
  }

  async _destroy(record) {
    if (!record || record.destroyed) return;
    record.destroyed = true;
    try {
      await this.destroyResource(record.resource);
    } catch (error) {
      this.destroyErrors.push(error);
    } finally {
      this.total -= 1;
      this._settleClose();
      this._drain();
    }
  }

  _enqueue(waiter) {
    if (waiter.timeout !== undefined &&
        (!Number.isFinite(waiter.timeout) || waiter.timeout < 0)) {
      waiter.reject(new RangeError('timeout must be a non-negative finite number'));
      return;
    }

    waiter.settled = false;
    waiter.timer = null;
    waiter.onAbort = null;

    if (waiter.signal) {
      waiter.onAbort = () => {
        this._rejectWaiter(
          waiter,
          waiter.signal.reason || new Error('Acquisition aborted')
        );
        this._drain();
      };
      waiter.signal.addEventListener('abort', waiter.onAbort, { once: true });
    }

    if (waiter.timeout !== undefined) {
      waiter.timer = setTimeout(() => {
        this._rejectWaiter(waiter, new Error('Resource acquisition timed out'));
        this._drain();
      }, waiter.timeout);
    }

    this.waiters.push(waiter);
    this._drain();
  }

  _cleanupWaiter(waiter) {
    if (waiter.timer !== null) clearTimeout(waiter.timer);
    if (waiter.signal && waiter.onAbort) {
      waiter.signal.removeEventListener('abort', waiter.onAbort);
    }
  }

  _rejectWaiter(waiter, error) {
    if (waiter.settled) return;
    waiter.settled = true;
    this._cleanupWaiter(waiter);
    waiter.reject(error);
  }

  _resolveWaiter(waiter, lease) {
    if (waiter.settled) {
      lease.release();
      return;
    }
    waiter.settled = true;
    this._cleanupWaiter(waiter);
    waiter.resolve(lease);
  }

  _takeWaiter() {
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      if (!waiter.settled) return waiter;
    }
    return null;
  }

  _drain() {
    if (this.closed) return;

    while (this.idle.length > 0) {
      const waiter = this._takeWaiter();
      if (!waiter) break;
      this._resolveWaiter(waiter, this._lease(this.idle.pop()));
    }

    while (this.waiters.length > 0 && this.total < this.max) {
      const waiter = this._takeWaiter();
      if (!waiter) break;

      this._createRecord().then((record) => {
        if (this.closed) {
          this._rejectWaiter(waiter, new Error('Resource pool is closed'));
          return this._destroy(record);
        }
        if (waiter.settled) {
          this.idle.push(record);
          this._drain();
          return;
        }
        this._resolveWaiter(waiter, this._lease(record));
      }).catch((error) => {
        this._rejectWaiter(waiter, error);
        this._drain();
      });
    }
  }

  _settleClose() {
    if (this.closed && this.total === 0 && this.closeResolve) {
      const resolve = this.closeResolve;
      this.closeResolve = null;
      resolve();
    }
  }
}

async function runTests() {
  const assert = require('node:assert/strict');
  let created = 0;
  let destroyed = 0;

  const pool = new AsyncResourcePool({
    max: 1,
    maxUses: 3,
    create: async () => ({ id: ++created }),
    destroy: async () => { destroyed += 1; }
  });

  const first = await pool.acquire();
  const waiting = pool.acquire();
  await first.release();
  const second = await waiting;
  assert.equal(second.resource.id, first.resource.id);
  assert.equal(await second.release(), true);
  assert.equal(await second.release(), false);

  const held = await pool.acquire();
  await assert.rejects(pool.acquire({ timeout: 5 }), /timed out/);
  const controller = new AbortController();
  const aborted = pool.acquire({ signal: controller.signal });
  controller.abort(new Error('caller cancelled'));
  await assert.rejects(aborted, /caller cancelled/);
  await held.release();

  const value = await pool.withResource(async (resource) => resource.id * 10);
  assert.equal(value, 10);

  const last = await pool.acquire();
  let closeFinished = false;
  const closing = pool.close().then(() => { closeFinished = true; });
  await Promise.resolve();
  assert.equal(closeFinished, false);
  await last.release();
  await closing;

  assert.equal(pool.total, 0);
  assert.equal(destroyed, created);
  await assert.rejects(pool.acquire(), /closed/);
  assert.throws(() => new AsyncResourcePool({ create() {}, max: 0 }), RangeError);

  console.log('Async resource pool: all tests passed');
}

module.exports = { AsyncResourcePool };

if (require.main === module) {
  runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
