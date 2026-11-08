"use strict";

const assert = require("node:assert/strict");

function abortError(reason) {
  if (reason instanceof Error) return reason;
  const error = new Error(reason === undefined ? "The operation was aborted" : String(reason));
  error.name = "AbortError";
  return error;
}

/**
 * FIFO asynchronous resource pool.
 *
 * The pool creates at most max resources, validates idle resources before
 * reuse, supports AbortSignal cancellation for queued acquisitions, and hands
 * released resources to the oldest live waiter before storing them as idle.
 *
 * A lease must be released exactly once. Repeated release calls are harmless.
 * close() rejects waiters and destroys idle resources; checked-out resources
 * are destroyed when their leases are eventually released.
 */
class AsyncResourcePool {
  constructor({
    max,
    create,
    destroy = async () => {},
    validate = async () => true,
    idleTimeoutMs = Infinity,
    now = () => Date.now()
  } = {}) {
    if (!Number.isInteger(max) || max < 1) {
      throw new RangeError("max must be a positive integer");
    }
    if (typeof create !== "function") throw new TypeError("create must be a function");
    if (typeof destroy !== "function") throw new TypeError("destroy must be a function");
    if (typeof validate !== "function") throw new TypeError("validate must be a function");
    if (!(idleTimeoutMs >= 0) || Number.isNaN(idleTimeoutMs)) {
      throw new RangeError("idleTimeoutMs must be non-negative");
    }
    if (typeof now !== "function") throw new TypeError("now must be a function");

    this.max = max;
    this.create = create;
    this.destroy = destroy;
    this.validate = validate;
    this.idleTimeoutMs = idleTimeoutMs;
    this.now = now;

    this.total = 0; // idle + checked out + currently being created
    this.idle = [];
    this.waiters = [];
    this.closed = false;
    this._draining = null;
  }

  acquire({ signal } = {}) {
    if (this.closed) return Promise.reject(new Error("resource pool is closed"));
    if (signal && signal.aborted) {
      return Promise.reject(abortError(signal.reason));
    }

    return new Promise((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        signal,
        settled: false,
        onAbort: null
      };

      waiter.onAbort = () => {
        if (waiter.settled) return;
        this._settle(waiter, reject, abortError(signal.reason));
        this._pump();
      };

      if (signal) signal.addEventListener("abort", waiter.onAbort, { once: true });
      this.waiters.push(waiter);
      this._pump();
    });
  }

  _settle(waiter, callback, value) {
    if (waiter.settled) return false;
    waiter.settled = true;
    if (waiter.signal) {
      waiter.signal.removeEventListener("abort", waiter.onAbort);
    }
    callback(value);
    return true;
  }

  _makeLease(resource) {
    let released = false;
    return Object.freeze({
      resource,
      release: () => {
        if (released) return Promise.resolve(false);
        released = true;
        return this._release(resource).then(() => true);
      }
    });
  }

  async _destroyResource(resource) {
    try {
      await this.destroy(resource);
    } catch {
      // A failed disposer must not corrupt pool accounting or strand waiters.
    }
  }

  async _release(resource) {
    if (this.closed) {
      this.total--;
      await this._destroyResource(resource);
      return;
    }

    this.idle.push({ resource, idleSince: this.now() });
    this._pump();
  }

  _pump() {
    if (this._draining || this.closed) return;

    this._draining = this._drain().finally(() => {
      this._draining = null;
      if (
        !this.closed &&
        this.waiters.length > 0 &&
        (this.idle.length > 0 || this.total < this.max)
      ) {
        this._pump();
      }
    });
  }

  async _drain() {
    while (!this.closed && this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      if (waiter.settled) continue;

      if (waiter.signal && waiter.signal.aborted) {
        this._settle(waiter, waiter.reject, abortError(waiter.signal.reason));
        continue;
      }

      let delivered = false;
      while (!delivered && !this.closed && !waiter.settled) {
        let resource;
        let cameFromIdle = false;

        if (this.idle.length > 0) {
          const item = this.idle.pop();
          resource = item.resource;
          cameFromIdle = true;

          if (
            Number.isFinite(this.idleTimeoutMs) &&
            this.now() - item.idleSince >= this.idleTimeoutMs
          ) {
            await this._destroyResource(resource);
            this.total--;
            continue;
          }

          let valid = false;
          try {
            valid = await this.validate(resource);
          } catch {
            valid = false;
          }

          if (!valid) {
            await this._destroyResource(resource);
            this.total--;
            continue;
          }
        } else if (this.total < this.max) {
          this.total++;
          try {
            resource = await this.create();
          } catch (error) {
            this.total--;
            this._settle(waiter, waiter.reject, error);
            break;
          }
        } else {
          // Capacity is occupied. Restore this waiter at the head so a later
          // release cannot let a newer acquisition bypass it.
          this.waiters.unshift(waiter);
          return;
        }

        if (this.closed || waiter.settled || (waiter.signal && waiter.signal.aborted)) {
          if (cameFromIdle || resource !== undefined) {
            await this._destroyResource(resource);
            this.total--;
          }
          if (!waiter.settled) {
            this._settle(
              waiter,
              waiter.reject,
              waiter.signal && waiter.signal.aborted
                ? abortError(waiter.signal.reason)
                : new Error("resource pool is closed")
            );
          }
          break;
        }

        delivered = this._settle(waiter, waiter.resolve, this._makeLease(resource));
        if (!delivered) {
          await this._destroyResource(resource);
          this.total--;
        }
      }
    }
  }

  async close() {
    if (this.closed) return;
    this.closed = true;

    const error = new Error("resource pool is closed");
    for (const waiter of this.waiters.splice(0)) {
      this._settle(waiter, waiter.reject, error);
    }

    const idle = this.idle.splice(0);
    for (const item of idle) {
      this.total--;
      await this._destroyResource(item.resource);
    }

    if (this._draining) await this._draining;
  }

  stats() {
    return Object.freeze({
      max: this.max,
      total: this.total,
      idle: this.idle.length,
      waiting: this.waiters.filter(waiter => !waiter.settled).length,
      closed: this.closed
    });
  }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function runTests() {
  let created = 0;
  const destroyed = [];
  const pool = new AsyncResourcePool({
    max: 1,
    create: async () => ({ id: ++created }),
    destroy: async resource => destroyed.push(resource.id)
  });

  const first = await pool.acquire();
  const waiting = pool.acquire();
  await Promise.resolve();
  assert.equal(pool.stats().waiting, 1);

  await first.release();
  const second = await waiting;
  assert.equal(second.resource.id, first.resource.id);
  assert.equal(await first.release(), false);
  await second.release();

  const controller = new AbortController();
  const held = await pool.acquire();
  const cancelled = pool.acquire({ signal: controller.signal });
  await Promise.resolve();
  controller.abort("no longer needed");
  await assert.rejects(cancelled, error => error.name === "AbortError");
  assert.equal(pool.stats().waiting, 0);
  await held.release();

  const invalidPool = new AsyncResourcePool({
    max: 1,
    create: async () => ({ id: ++created }),
    validate: async () => false,
    destroy: async resource => destroyed.push(resource.id)
  });
  const invalidLease = await invalidPool.acquire();
  await invalidLease.release();
  const replacement = await invalidPool.acquire();
  assert.notEqual(replacement.resource.id, invalidLease.resource.id);
  await replacement.release();
  await invalidPool.close();

  let attempts = 0;
  const failingPool = new AsyncResourcePool({
    max: 1,
    create: async () => {
      attempts++;
      if (attempts === 1) throw new Error("factory failed");
      return { id: "recovered" };
    }
  });
  await assert.rejects(failingPool.acquire(), /factory failed/);
  const recovered = await failingPool.acquire();
  assert.equal(recovered.resource.id, "recovered");
  await recovered.release();
  await failingPool.close();

  const closingPool = new AsyncResourcePool({
    max: 1,
    create: async () => ({ id: "active" }),
    destroy: async resource => destroyed.push(resource.id)
  });
  const active = await closingPool.acquire();
  await closingPool.close();
  assert.equal(closingPool.stats().closed, true);
  await active.release();
  assert.ok(destroyed.includes("active"));
  assert.equal(closingPool.stats().total, 0);

  const gate = deferred();
  const creatingPool = new AsyncResourcePool({
    max: 1,
    create: () => gate.promise,
    destroy: async resource => destroyed.push(resource.id)
  });
  const pending = creatingPool.acquire();
  await Promise.resolve();
  await creatingPool.close();
  gate.resolve({ id: "created-after-close" });
  await assert.rejects(pending, /closed/);
  assert.ok(destroyed.includes("created-after-close"));
  assert.equal(creatingPool.stats().total, 0);
}

if (require.main === module) {
  runTests()
    .then(() => console.log("AsyncResourcePool: all tests passed"))
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = { AsyncResourcePool };
