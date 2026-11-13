'use strict';

/*
 * Exercise: Build an asynchronous event bus with bounded buffering.
 *
 * Features: exact and wildcard topics (* matches one segment, ** matches the
 * remaining suffix), priority-ordered subscriptions, once handlers, serial or
 * parallel delivery, handler-error isolation, abortable subscriptions, FIFO
 * blocking backpressure, and explicit overflow policies.
 */

const assert = require('node:assert/strict');

function abortError() {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

function validatePattern(pattern) {
  if (typeof pattern !== 'string' || pattern.length === 0) {
    throw new TypeError('topic pattern must be a non-empty string');
  }
  const parts = pattern.split('.');
  if (parts.some(part => part.length === 0)) {
    throw new TypeError('topic segments must not be empty');
  }
  const doubleStars = parts.filter(part => part === '**').length;
  if (doubleStars > 1 || (doubleStars === 1 && parts[parts.length - 1] !== '**')) {
    throw new TypeError('** is allowed only once, as the final segment');
  }
  if (parts.some(part => part.includes('*') && part !== '*' && part !== '**')) {
    throw new TypeError('wildcards must occupy an entire topic segment');
  }
  return parts;
}

function validateTopic(topic) {
  if (typeof topic !== 'string' || topic.length === 0 ||
      topic.split('.').some(part => part.length === 0 || part.includes('*'))) {
    throw new TypeError('topic must contain non-empty literal segments');
  }
  return topic.split('.');
}

function matches(patternParts, topicParts) {
  let i = 0;
  let j = 0;
  while (i < patternParts.length) {
    const part = patternParts[i];
    if (part === '**') return true;
    if (j >= topicParts.length) return false;
    if (part !== '*' && part !== topicParts[j]) return false;
    i++;
    j++;
  }
  return j === topicParts.length;
}

class AsyncEventBus {
  constructor(options = {}) {
    this.concurrency = options.concurrency === undefined ? 1 : options.concurrency;
    this.maxQueue = options.maxQueue === undefined ? 100 : options.maxQueue;
    this.overflow = options.overflow || 'block';

    if (!Number.isInteger(this.concurrency) || this.concurrency < 1) {
      throw new RangeError('concurrency must be a positive integer');
    }
    if (!Number.isInteger(this.maxQueue) || this.maxQueue < 1) {
      throw new RangeError('maxQueue must be a positive integer');
    }
    if (!['block', 'drop-newest', 'drop-oldest', 'error'].includes(this.overflow)) {
      throw new RangeError('unsupported overflow policy');
    }

    this.subscriptions = new Map();
    this.nextSubscriptionId = 1;
    this.nextEventId = 1;
    this.queue = [];
    this.blocked = [];
    this.active = 0;
    this.closed = false;
    this.closeWaiters = [];
  }

  subscribe(pattern, handler, options = {}) {
    if (this.closed) throw new Error('event bus is closed');
    const patternParts = validatePattern(pattern);
    if (typeof handler !== 'function') throw new TypeError('handler must be a function');
    const priority = options.priority === undefined ? 0 : options.priority;
    if (typeof priority !== 'number' || !Number.isFinite(priority)) {
      throw new TypeError('priority must be a finite number');
    }
    if (options.signal && options.signal.aborted) return () => {};

    const record = {
      id: this.nextSubscriptionId++,
      pattern,
      patternParts,
      handler,
      priority,
      once: Boolean(options.once),
      active: true,
      signal: options.signal || null,
      abortListener: null
    };
    this.subscriptions.set(record.id, record);

    const unsubscribe = () => {
      if (!record.active) return false;
      record.active = false;
      this.subscriptions.delete(record.id);
      if (record.signal && record.abortListener) {
        record.signal.removeEventListener('abort', record.abortListener);
      }
      return true;
    };

    if (record.signal) {
      record.abortListener = unsubscribe;
      record.signal.addEventListener('abort', record.abortListener, { once: true });
    }
    return unsubscribe;
  }

  publish(topic, payload, options = {}) {
    if (this.closed) return Promise.reject(new Error('event bus is closed'));
    const topicParts = validateTopic(topic);
    const delivery = options.delivery || 'parallel';
    if (delivery !== 'parallel' && delivery !== 'serial') {
      return Promise.reject(new RangeError('delivery must be serial or parallel'));
    }

    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const job = {
      id: this.nextEventId++,
      topic,
      topicParts,
      payload,
      delivery,
      resolve,
      reject,
      promise,
      settled: false
    };

    if (this.queue.length < this.maxQueue) {
      this.queue.push(job);
      this._pump();
      return promise;
    }

    if (this.overflow === 'drop-newest') {
      this._settle(job, null, {
        topic,
        dropped: true,
        reason: 'queue-full',
        delivered: 0,
        errors: []
      });
    } else if (this.overflow === 'drop-oldest') {
      const oldest = this.queue.shift();
      if (oldest) {
        this._settle(oldest, null, {
          topic: oldest.topic,
          dropped: true,
          reason: 'queue-full',
          delivered: 0,
          errors: []
        });
        this.queue.push(job);
        this._pump();
      } else {
        this._settle(job, null, {
          topic,
          dropped: true,
          reason: 'queue-full',
          delivered: 0,
          errors: []
        });
      }
    } else if (this.overflow === 'error') {
      this._settle(job, new Error('event queue is full'));
    } else {
      this.blocked.push(job);
    }
    return promise;
  }

  _settle(job, error, value) {
    if (job.settled) return;
    job.settled = true;
    if (error) job.reject(error);
    else job.resolve(value);
  }

  _promoteBlocked() {
    while (this.queue.length < this.maxQueue && this.blocked.length > 0) {
      this.queue.push(this.blocked.shift());
    }
  }

  _pump() {
    this._promoteBlocked();
    while (this.active < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift();
      this.active++;
      this._promoteBlocked();

      Promise.resolve()
        .then(() => this._dispatch(job))
        .then(result => this._settle(job, null, result), error => this._settle(job, error))
        .finally(() => {
          this.active--;
          this._pump();
          this._notifyClosed();
        });
    }
    this._notifyClosed();
  }

  async _dispatch(job) {
    const handlers = Array.from(this.subscriptions.values())
      .filter(record => record.active && matches(record.patternParts, job.topicParts))
      .sort((a, b) => b.priority - a.priority || a.id - b.id);

    const errors = [];
    let delivered = 0;

    const invoke = async record => {
      if (!record.active) return;
      if (record.once) {
        // Remove before invoking so a re-entrant publish cannot see this handler.
        record.active = false;
        this.subscriptions.delete(record.id);
        if (record.signal && record.abortListener) {
          record.signal.removeEventListener('abort', record.abortListener);
        }
      }
      try {
        await record.handler(job.payload, {
          topic: job.topic,
          eventId: job.id,
          subscriptionId: record.id
        });
        delivered++;
      } catch (error) {
        errors.push({ subscriptionId: record.id, error });
      }
    };

    if (job.delivery === 'serial') {
      for (const record of handlers) await invoke(record);
    } else {
      await Promise.all(handlers.map(invoke));
    }

    return {
      topic: job.topic,
      eventId: job.id,
      dropped: false,
      delivered,
      errors
    };
  }

  stats() {
    return {
      active: this.active,
      queued: this.queue.length,
      blocked: this.blocked.length,
      subscriptions: this.subscriptions.size,
      closed: this.closed
    };
  }

  close(options = {}) {
    const drain = options.drain !== false;
    this.closed = true;

    if (!drain) {
      for (const job of this.queue.splice(0)) {
        this._settle(job, null, {
          topic: job.topic,
          dropped: true,
          reason: 'closed',
          delivered: 0,
          errors: []
        });
      }
      for (const job of this.blocked.splice(0)) {
        this._settle(job, null, {
          topic: job.topic,
          dropped: true,
          reason: 'closed',
          delivered: 0,
          errors: []
        });
      }
    }

    for (const record of Array.from(this.subscriptions.values())) {
      record.active = false;
      if (record.signal && record.abortListener) {
        record.signal.removeEventListener('abort', record.abortListener);
      }
    }
    this.subscriptions.clear();

    return new Promise(resolve => {
      this.closeWaiters.push(resolve);
      this._pump();
      this._notifyClosed();
    });
  }

  _notifyClosed() {
    if (!this.closed || this.active > 0 || this.queue.length > 0 || this.blocked.length > 0) {
      return;
    }
    for (const resolve of this.closeWaiters.splice(0)) resolve();
  }
}

async function runTests() {
  const bus = new AsyncEventBus({ concurrency: 2, maxQueue: 8 });
  const order = [];
  bus.subscribe('orders.*', async payload => order.push('wild:' + payload), { priority: 2 });
  bus.subscribe('orders.created', async payload => order.push('exact:' + payload), { priority: 5 });
  bus.subscribe('orders.**', async payload => order.push('deep:' + payload), { priority: 1 });
  const onceUnsubscribe = bus.subscribe('orders.created', () => order.push('once'), { once: true });
  const report = await bus.publish('orders.created', 7, { delivery: 'serial' });
  assert.equal(report.delivered, 4);
  assert.deepEqual(order, ['exact:7', 'once', 'wild:7', 'deep:7']);
  await bus.publish('orders.created', 8, { delivery: 'serial' });
  assert.equal(order.filter(item => item === 'once').length, 1);
  assert.equal(onceUnsubscribe(), false);

  const failures = new AsyncEventBus();
  failures.subscribe('job.done', () => { throw new Error('handler failed'); });
  failures.subscribe('job.done', () => 42);
  const failureReport = await failures.publish('job.done', null, { delivery: 'parallel' });
  assert.equal(failureReport.delivered, 1);
  assert.equal(failureReport.errors.length, 1);
  await failures.close();

  const controller = new AbortController();
  const abortBus = new AsyncEventBus();
  let abortCalls = 0;
  abortBus.subscribe('signal', () => abortCalls++, { signal: controller.signal });
  controller.abort();
  await abortBus.publish('signal', 1);
  assert.equal(abortCalls, 0);
  await abortBus.close();

  // A full queue blocks the third publisher until the first event completes.
  const blocking = new AsyncEventBus({ concurrency: 1, maxQueue: 1, overflow: 'block' });
  let releaseFirst;
  const firstGate = new Promise(resolve => { releaseFirst = resolve; });
  const processed = [];
  blocking.subscribe('work', async value => {
    if (value === 1) await firstGate;
    processed.push(value);
  });
  const first = blocking.publish('work', 1);
  await Promise.resolve();
  const second = blocking.publish('work', 2);
  const third = blocking.publish('work', 3);
  assert.equal(blocking.stats().queued, 1);
  assert.equal(blocking.stats().blocked, 1);
  releaseFirst();
  await Promise.all([first, second, third]);
  assert.deepEqual(processed, [1, 2, 3]);
  await blocking.close();

  // drop-newest resolves immediately with an explicit dropped result.
  const dropping = new AsyncEventBus({
    concurrency: 1,
    maxQueue: 1,
    overflow: 'drop-newest'
  });
  let releaseDrop;
  const dropGate = new Promise(resolve => { releaseDrop = resolve; });
  dropping.subscribe('item', async value => {
    if (value === 'active') await dropGate;
  });
  const active = dropping.publish('item', 'active');
  await Promise.resolve();
  const queued = dropping.publish('item', 'queued');
  const dropped = await dropping.publish('item', 'discard');
  assert.equal(dropped.dropped, true);
  releaseDrop();
  await Promise.all([active, queued]);
  await dropping.close();

  const rejecting = new AsyncEventBus({
    concurrency: 1,
    maxQueue: 1,
    overflow: 'error'
  });
  let releaseReject;
  const rejectGate = new Promise(resolve => { releaseReject = resolve; });
  rejecting.subscribe('slow', async () => rejectGate);
  const inFlight = rejecting.publish('slow', 1);
  await Promise.resolve();
  const waiting = rejecting.publish('slow', 2);
  await assert.rejects(rejecting.publish('slow', 3), /queue is full/);
  releaseReject();
  await Promise.all([inFlight, waiting]);
  await rejecting.close();

  const dropOldest = new AsyncEventBus({
    concurrency: 1,
    maxQueue: 1,
    overflow: 'drop-oldest'
  });
  let releaseOldest;
  const oldestGate = new Promise(resolve => { releaseOldest = resolve; });
  const oldestSeen = [];
  dropOldest.subscribe('x', async value => {
    if (value === 0) await oldestGate;
    oldestSeen.push(value);
  });
  const zero = dropOldest.publish('x', 0);
  await Promise.resolve();
  const replaced = dropOldest.publish('x', 1);
  const newest = dropOldest.publish('x', 2);
  const replacedResult = await replaced;
  assert.equal(replacedResult.dropped, true);
  releaseOldest();
  await Promise.all([zero, newest]);
  assert.deepEqual(oldestSeen, [0, 2]);
  await dropOldest.close();

  const draining = new AsyncEventBus({ concurrency: 1, maxQueue: 2 });
  draining.subscribe('x', async () => {});
  const drainJobs = [draining.publish('x', 1), draining.publish('x', 2)];
  await draining.close({ drain: true });
  await Promise.all(drainJobs);
  await assert.rejects(draining.publish('x', 3), /closed/);

  console.log('AsyncEventBus: all tests passed');
}

if (require.main === module) {
  runTests().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { AsyncEventBus, validatePattern, validateTopic };
