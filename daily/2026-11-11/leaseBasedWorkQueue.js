'use strict';

/**
 * Exercise: build a lease-based work queue for at-least-once processing.
 *
 * Workers claim jobs for a visibility interval. Acknowledgements require the
 * current lease token, so an expired worker cannot acknowledge a later retry.
 * Expired and negatively acknowledged jobs return to the FIFO tail until the
 * attempt limit is reached, after which they enter a dead-letter collection.
 *
 * The injected clock makes expiry deterministic and testable without sleeps.
 * Run: node daily/2026-11-11/leaseBasedWorkQueue.js
 */

const assert = require('node:assert/strict');

class LeaseBasedWorkQueue {
  constructor({
    now = () => Date.now(),
    visibilityTimeoutMs = 30_000,
    maxAttempts = 5
  } = {}) {
    if (typeof now !== 'function') throw new TypeError('now must be a function');
    this._validateDuration(visibilityTimeoutMs, 'visibilityTimeoutMs');
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new RangeError('maxAttempts must be a positive integer');
    }

    this.now = now;
    this.visibilityTimeoutMs = visibilityTimeoutMs;
    this.maxAttempts = maxAttempts;
    this.items = new Map();
    this.pending = [];
    this.deadLetters = [];
    this.idSequence = 0;
    this.tokenSequence = 0;
  }

  _validateDuration(value, name) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(name + ' must be a positive finite number');
    }
  }

  enqueue(payload, { id } = {}) {
    if (id === undefined) id = 'job-' + (++this.idSequence);
    if ((typeof id !== 'string' && typeof id !== 'number') || id === '') {
      throw new TypeError('job id must be a non-empty string or number');
    }
    if (this.items.has(id)) throw new Error('job id already exists');

    this.items.set(id, {
      id,
      payload,
      status: 'pending',
      attempts: 0,
      token: null,
      workerId: null,
      leaseUntil: null,
      completedAt: null
    });
    this.pending.push(id);
    return id;
  }

  _deadLetter(item, reason, now) {
    item.status = 'dead';
    item.token = null;
    item.workerId = null;
    item.leaseUntil = null;
    this.deadLetters.push({
      id: item.id,
      payload: item.payload,
      attempts: item.attempts,
      reason,
      deadAt: now
    });
  }

  _reapExpired() {
    const now = this.now();
    for (const item of this.items.values()) {
      if (item.status !== 'leased' || now < item.leaseUntil) continue;

      const expiredToken = item.token;
      item.token = null;
      item.workerId = null;
      item.leaseUntil = null;

      if (item.attempts >= this.maxAttempts) {
        this._deadLetter(item, 'lease expired after maximum attempts', now);
      } else {
        item.status = 'pending';
        item.lastExpiredToken = expiredToken;
        this.pending.push(item.id);
      }
    }
  }

  claim(workerId, { leaseMs = this.visibilityTimeoutMs } = {}) {
    if (typeof workerId !== 'string' || workerId.trim() === '') {
      throw new TypeError('workerId must be a non-empty string');
    }
    this._validateDuration(leaseMs, 'leaseMs');
    this._reapExpired();

    while (this.pending.length > 0) {
      const id = this.pending.shift();
      const item = this.items.get(id);
      if (!item || item.status !== 'pending') continue;

      const now = this.now();
      item.status = 'leased';
      item.attempts += 1;
      item.workerId = workerId;
      item.token = 'lease-' + (++this.tokenSequence);
      item.leaseUntil = now + leaseMs;

      return {
        id: item.id,
        payload: item.payload,
        workerId,
        token: item.token,
        attempt: item.attempts,
        leaseUntil: item.leaseUntil
      };
    }
    return null;
  }

  _currentLease(id, token) {
    this._reapExpired();
    const item = this.items.get(id);
    if (!item || item.status !== 'leased' || item.token !== token) return null;
    return item;
  }

  ack(id, token) {
    const item = this._currentLease(id, token);
    if (!item) return false;
    item.status = 'completed';
    item.completedAt = this.now();
    item.token = null;
    item.workerId = null;
    item.leaseUntil = null;
    return true;
  }

  nack(id, token, { requeue = true, reason = 'worker rejected job' } = {}) {
    const item = this._currentLease(id, token);
    if (!item) return false;

    item.token = null;
    item.workerId = null;
    item.leaseUntil = null;

    if (requeue && item.attempts < this.maxAttempts) {
      item.status = 'pending';
      this.pending.push(item.id);
    } else {
      this._deadLetter(item, reason, this.now());
    }
    return true;
  }

  extend(id, token, additionalMs) {
    this._validateDuration(additionalMs, 'additionalMs');
    const item = this._currentLease(id, token);
    if (!item) return false;
    item.leaseUntil += additionalMs;
    return item.leaseUntil;
  }

  status(id) {
    this._reapExpired();
    const item = this.items.get(id);
    if (!item) return null;
    return {
      id: item.id,
      status: item.status,
      attempts: item.attempts,
      workerId: item.workerId,
      leaseUntil: item.leaseUntil
    };
  }

  stats() {
    this._reapExpired();
    const result = { pending: 0, leased: 0, completed: 0, dead: 0 };
    for (const item of this.items.values()) result[item.status] += 1;
    return result;
  }

  drainDeadLetters() {
    const drained = this.deadLetters.slice();
    this.deadLetters.length = 0;
    return drained;
  }
}

function runTests() {
  let clock = 100;
  const queue = new LeaseBasedWorkQueue({
    now: () => clock,
    visibilityTimeoutMs: 10,
    maxAttempts: 2
  });

  queue.enqueue({ task: 'first' }, { id: 'first' });
  queue.enqueue({ task: 'second' }, { id: 'second' });
  const firstLease = queue.claim('worker-a');
  const secondLease = queue.claim('worker-b', { leaseMs: 40 });
  assert.equal(firstLease.id, 'first');
  assert.equal(secondLease.id, 'second');
  assert.equal(queue.claim('worker-c'), null);
  assert.equal(queue.ack('first', 'wrong-token'), false);

  clock = 111;
  const retry = queue.claim('worker-c');
  assert.equal(retry.id, 'first');
  assert.equal(retry.attempt, 2);
  assert.equal(queue.ack('first', firstLease.token), false);
  assert.equal(queue.nack('first', retry.token, {
    requeue: true,
    reason: 'retry limit reached'
  }), true);
  assert.equal(queue.status('first').status, 'dead');

  const extended = queue.extend('second', secondLease.token, 20);
  assert.equal(extended, 160);
  clock = 125;
  assert.equal(queue.ack('second', secondLease.token), true);
  assert.deepEqual(queue.stats(), { pending: 0, leased: 0, completed: 1, dead: 1 });

  const dead = queue.drainDeadLetters();
  assert.equal(dead.length, 1);
  assert.equal(dead[0].id, 'first');
  assert.equal(dead[0].attempts, 2);
  assert.equal(queue.drainDeadLetters().length, 0);

  queue.enqueue('retry-me', { id: 'retry-me' });
  const attemptOne = queue.claim('worker-x');
  assert.equal(queue.nack('retry-me', attemptOne.token, { requeue: true }), true);
  const attemptTwo = queue.claim('worker-y');
  assert.equal(attemptTwo.attempt, 2);
  assert.equal(queue.ack('retry-me', attemptTwo.token), true);

  queue.enqueue('expire-twice', { id: 'expire-twice' });
  const expiringOne = queue.claim('worker-z');
  clock = 136;
  const expiringTwo = queue.claim('worker-z');
  assert.equal(expiringTwo.id, 'expire-twice');
  assert.equal(expiringTwo.attempt, 2);
  clock = 147;
  assert.equal(queue.claim('worker-z'), null);
  assert.equal(queue.status('expire-twice').status, 'dead');
  assert.equal(queue.ack('expire-twice', expiringOne.token), false);

  assert.throws(() => queue.enqueue('duplicate', { id: 'first' }), /already exists/);
  assert.throws(() => queue.claim(''), /workerId/);
  assert.throws(() => queue.extend('retry-me', 'bad', 0), /positive/);

  return { checks: 22, deadLettersObserved: dead.length + 1 };
}

if (require.main === module) {
  console.log('Lease-based work queue:', runTests());
}

module.exports = { LeaseBasedWorkQueue, runTests };
