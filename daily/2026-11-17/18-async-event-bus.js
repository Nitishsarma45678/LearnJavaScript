'use strict';

/**
 * Async Event Bus with Deterministic Dispatch
 * -------------------------------------------
 * A small event system with priority ordering, once-listeners, wildcard
 * subscriptions, AbortSignal cleanup, serial/parallel async dispatch, and a
 * Promise-based waitFor helper.
 *
 * Dispatch uses a snapshot: listeners added during an emit start receiving the
 * next event. A listener removed before its turn is skipped. Once-listeners
 * are claimed synchronously when the snapshot is made, so overlapping emits
 * cannot invoke the same once-listener twice.
 */

class AsyncEventBus {
  constructor() {
    this.listeners = new Map();
    this.nextId = 1;
    this.sequence = 1;
  }

  on(eventName, handler, options = {}) {
    if (typeof eventName !== 'string' || eventName.length === 0) throw new TypeError('eventName must be a non-empty string');
    if (typeof handler !== 'function') throw new TypeError('handler must be a function');
    const { priority = 0, once = false, signal } = options;
    if (!Number.isFinite(priority)) throw new TypeError('priority must be finite');
    if (signal && typeof signal.addEventListener !== 'function') throw new TypeError('signal must be an AbortSignal');
    if (signal?.aborted) return () => false;

    const record = {
      id: this.nextId++, eventName, handler, priority, once: Boolean(once),
      sequence: this.sequence++, active: true, signal, abortHandler: null,
    };
    if (!this.listeners.has(eventName)) this.listeners.set(eventName, new Map());
    this.listeners.get(eventName).set(record.id, record);
    const unsubscribe = () => this.#remove(record);
    if (signal) {
      record.abortHandler = unsubscribe;
      signal.addEventListener('abort', unsubscribe, { once: true });
    }
    return unsubscribe;
  }

  #remove(record) {
    if (!record.active) return false;
    record.active = false;
    const group = this.listeners.get(record.eventName);
    group?.delete(record.id);
    if (group?.size === 0) this.listeners.delete(record.eventName);
    if (record.signal && record.abortHandler) {
      record.signal.removeEventListener('abort', record.abortHandler);
    }
    return true;
  }

  listenerCount(eventName) {
    return this.listeners.get(eventName)?.size ?? 0;
  }

  #snapshot(eventName) {
    const specific = [...(this.listeners.get(eventName)?.values() ?? [])];
    const wildcard = eventName === '*' ? [] : [...(this.listeners.get('*')?.values() ?? [])];
    const snapshot = [...specific, ...wildcard]
      .filter((record) => record.active)
      .sort((a, b) => b.priority - a.priority || a.sequence - b.sequence);
    // Claim once-listeners before any handler can await or re-enter emit().
    for (const record of snapshot) if (record.once) this.#remove(record);
    return snapshot;
  }

  async emit(eventName, payload, options = {}) {
    if (typeof eventName !== 'string' || eventName.length === 0) throw new TypeError('eventName must be a non-empty string');
    const { mode = 'serial', stopOnError = false } = options;
    if (mode !== 'serial' && mode !== 'parallel') throw new TypeError("mode must be 'serial' or 'parallel'");
    const snapshot = this.#snapshot(eventName);
    const outcomes = new Array(snapshot.length);

    const invoke = async (record, index) => {
      if (!record.once && !record.active) {
        outcomes[index] = { id: record.id, status: 'skipped' };
        return;
      }
      try {
        const value = record.eventName === '*'
          ? await record.handler(payload, eventName)
          : await record.handler(payload, eventName);
        outcomes[index] = { id: record.id, status: 'fulfilled', value };
      } catch (error) {
        outcomes[index] = { id: record.id, status: 'rejected', reason: error };
      }
    };

    if (mode === 'serial') {
      for (let index = 0; index < snapshot.length; index += 1) {
        await invoke(snapshot[index], index);
        if (stopOnError && outcomes[index].status === 'rejected') break;
      }
      for (let index = 0; index < outcomes.length; index += 1) {
        if (!outcomes[index]) outcomes[index] = { id: snapshot[index].id, status: 'skipped' };
      }
    } else {
      await Promise.all(snapshot.map((record, index) => invoke(record, index)));
    }

    const errors = outcomes.filter((outcome) => outcome.status === 'rejected').map((outcome) => outcome.reason);
    const report = { eventName, delivered: outcomes.filter((outcome) => outcome.status === 'fulfilled').length, outcomes, errors };
    if (stopOnError && errors.length) throw new AggregateError(errors, `one or more handlers failed for ${eventName}`, { cause: errors[0] });
    return report;
  }

  waitFor(eventName, options = {}) {
    const { signal, timeout } = options;
    if (signal?.aborted) return Promise.reject(signal.reason ?? new Error('waitFor aborted'));
    if (timeout !== undefined && (!Number.isFinite(timeout) || timeout < 0)) {
      return Promise.reject(new RangeError('timeout must be a non-negative finite number'));
    }
    return new Promise((resolve, reject) => {
      let timer = null;
      let unsubscribe = () => {};
      const cleanup = () => {
        unsubscribe();
        if (timer !== null) clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      };
      const onAbort = () => {
        cleanup();
        reject(signal.reason ?? new Error('waitFor aborted'));
      };
      unsubscribe = this.on(eventName, (payload, name) => {
        cleanup();
        resolve({ eventName: name, payload });
      }, { once: true });
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      if (timeout !== undefined) {
        timer = setTimeout(() => {
          cleanup();
          reject(new Error(`timed out waiting for ${eventName}`));
        }, timeout);
      }
    });
  }
}

async function runTests() {
  const assert = require('node:assert/strict');
  const bus = new AsyncEventBus();
  const order = [];
  bus.on('job', async () => { order.push('low'); }, { priority: 1 });
  bus.on('job', async () => { order.push('high'); }, { priority: 10 });
  bus.on('*', async (payload, name) => { order.push(`*:${name}:${payload}`); }, { priority: 5 });
  const report = await bus.emit('job', 'x');
  assert.deepEqual(order, ['high', '*:job:x', 'low']);
  assert.equal(report.delivered, 3);

  let onceCalls = 0;
  bus.on('once', async () => { onceCalls += 1; }, { once: true });
  await Promise.all([bus.emit('once', 1), bus.emit('once', 2)]);
  assert.equal(onceCalls, 1);

  const mutationBus = new AsyncEventBus();
  const mutationOrder = [];
  let removeSecond;
  mutationBus.on('change', () => {
    mutationOrder.push('first');
    removeSecond();
    mutationBus.on('change', () => mutationOrder.push('late'));
  }, { priority: 2 });
  removeSecond = mutationBus.on('change', () => mutationOrder.push('second'));
  await mutationBus.emit('change');
  assert.deepEqual(mutationOrder, ['first']);
  await mutationBus.emit('change');
  assert.deepEqual(mutationOrder, ['first', 'first', 'late']);

  const controller = new AbortController();
  const unsubscribe = bus.on('abortable', () => assert.fail('aborted listener ran'), { signal: controller.signal });
  controller.abort();
  assert.equal(unsubscribe(), false);
  assert.equal(bus.listenerCount('abortable'), 0);

  const waiting = bus.waitFor('ready', { timeout: 1000 });
  await bus.emit('ready', { version: 3 });
  assert.deepEqual(await waiting, { eventName: 'ready', payload: { version: 3 } });

  const failures = new AsyncEventBus();
  failures.on('x', () => { throw new Error('handler failed'); });
  failures.on('x', () => 'still-ran');
  const failureReport = await failures.emit('x');
  assert.equal(failureReport.errors.length, 1);
  assert.equal(failureReport.delivered, 1);
  await assert.rejects(failures.emit('x', null, { stopOnError: true }), AggregateError);

  const parallel = new AsyncEventBus();
  const started = [];
  parallel.on('p', async () => { await new Promise((resolve) => setTimeout(resolve, 10)); started.push(1); });
  parallel.on('p', async () => { started.push(2); });
  await parallel.emit('p', null, { mode: 'parallel' });
  assert.deepEqual(started.sort(), [1, 2]);
}

if (require.main === module) {
  runTests().then(() => console.log('Async Event Bus: all tests passed'));
}

module.exports = { AsyncEventBus };
