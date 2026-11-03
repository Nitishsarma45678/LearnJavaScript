const assert = require('node:assert/strict');

function abortError() {
  const error = new Error('Resource acquisition aborted');
  error.name = 'AbortError';
  return error;
}
class AsyncResourcePool {
  constructor({ create, destroy = async () => {}, max = 4 }) {
    if (typeof create !== 'function' || typeof destroy !== 'function') throw new TypeError('create and destroy must be functions');
    if (!Number.isInteger(max) || max < 1) throw new RangeError('max must be a positive integer');
    this.create = create; this.destroy = destroy; this.max = max;
    this.idle = []; this.all = new Set(); this.borrowed = new Set();
    this.waiters = []; this.creating = 0; this.closed = false;
  }
  acquire({ signal } = {}) {
    if (this.closed) return Promise.reject(new Error('Pool is closed'));
    if (signal?.aborted) return Promise.reject(abortError());
    if (this.idle.length && !this.waiters.length) {
      const resource = this.idle.pop(); this.borrowed.add(resource);
      return Promise.resolve(resource);
    }
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, signal, state: 'queued', aborted: false, onAbort: null };
      waiter.onAbort = () => {
        if (waiter.state === 'queued') {
          const index = this.waiters.indexOf(waiter);
          if (index !== -1) this.waiters.splice(index, 1);
          this.settle(waiter, reject, abortError());
          this.dispatch();
        } else if (waiter.state === 'creating') waiter.aborted = true;
      };
      signal?.addEventListener('abort', waiter.onAbort, { once: true });
      if (this.waiters.length || this.all.size + this.creating >= this.max) this.waiters.push(waiter);
      else this.createFor(waiter);
    });
  }
  settle(waiter, method, value) {
    if (waiter.state === 'settled') return;
    waiter.state = 'settled';
    waiter.signal?.removeEventListener('abort', waiter.onAbort);
    method(value);
  }
  async createFor(waiter) {
    waiter.state = 'creating'; this.creating++;
    let resource;
    try {
      resource = await this.create();
    } catch (error) {
      this.creating--;
      this.settle(waiter, waiter.reject, error);
      this.dispatch();
      return;
    }
    this.creating--;
    if (this.closed || waiter.aborted || waiter.signal?.aborted) {
      try {
        await this.destroy(resource);
      } catch (error) {
        this.settle(waiter, waiter.reject, error);
        this.dispatch();
        return;
      }
      this.settle(waiter, waiter.reject, this.closed ? new Error('Pool is closed') : abortError());
    } else {
      this.all.add(resource); this.borrowed.add(resource);
      this.settle(waiter, waiter.resolve, resource);
    }
    this.dispatch();
  }
  dispatch() {
    while (!this.closed && this.waiters.length) {
      const waiter = this.waiters[0];
      if (waiter.signal?.aborted) {
        this.waiters.shift(); this.settle(waiter, waiter.reject, abortError()); continue;
      }
      if (this.idle.length) {
        this.waiters.shift();
        const resource = this.idle.pop(); this.borrowed.add(resource);
        this.settle(waiter, waiter.resolve, resource); continue;
      }
      if (this.all.size + this.creating < this.max) {
        this.waiters.shift(); this.createFor(waiter); continue;
      }
      break;
    }
  }
  async release(resource) {
    if (!this.borrowed.has(resource)) throw new Error('Resource is not currently borrowed from this pool');
    this.borrowed.delete(resource);
    if (this.closed) {
      this.all.delete(resource); await this.destroy(resource); return;
    }
    this.idle.push(resource);
    this.dispatch();
  }
  async use(fn, options) {
    const resource = await this.acquire(options);
    try { return await fn(resource); }
    finally { await this.release(resource); }
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) this.settle(waiter, waiter.reject, new Error('Pool is closed'));
    const idle = this.idle.splice(0);
    for (const resource of idle) this.all.delete(resource);
    await Promise.all(idle.map(resource => this.destroy(resource)));
  }
  get stats() {
    return { total: this.all.size + this.creating, idle: this.idle.length,
      borrowed: this.borrowed.size, waiting: this.waiters.length, creating: this.creating, closed: this.closed };
  }
}

(async () => {
  let nextId = 0, destroyed = 0;
  const pool = new AsyncResourcePool({
    max: 1,
    create: async () => ({ id: ++nextId }),
    destroy: async () => { destroyed++; }
  });
  const first = await pool.acquire();
  const secondPromise = pool.acquire();
  assert.equal(pool.stats.waiting, 1);
  await pool.release(first);
  const second = await secondPromise;
  assert.equal(second, first);
  await pool.release(second);
  await assert.rejects(pool.release(second), /not currently borrowed/);
  await pool.use(async resource => resource.id);
  await pool.close();
  assert.equal(destroyed, 1);
  await assert.rejects(pool.acquire(), /closed/);

  const abortPool = new AsyncResourcePool({ max: 1, create: async () => ({}) });
  const held = await abortPool.acquire();
  const controller = new AbortController();
  const waiting = abortPool.acquire({ signal: controller.signal });
  controller.abort();
  await assert.rejects(waiting, error => error.name === 'AbortError');
  await abortPool.release(held);
  await abortPool.close();
  console.log('Async resource pool tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });