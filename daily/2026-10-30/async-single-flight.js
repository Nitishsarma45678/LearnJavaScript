'use strict';

/**
 * Per-key async request coalescer (single-flight).
 * Concurrent callers for the same key share one task, but each caller has an
 * independent AbortSignal. The underlying task is aborted only after every
 * subscriber has cancelled, preventing one impatient caller from cancelling
 * work still needed by others.
 */
function createSingleFlight({ abortWhenUnused = true } = {}) {
  if (typeof abortWhenUnused !== 'boolean') throw new TypeError('abortWhenUnused must be boolean');
  const flights = new Map();

  function run(key, task, { signal } = {}) {
    if (typeof task !== 'function') throw new TypeError('task must be a function');
    if (signal !== undefined && (!signal || typeof signal.addEventListener !== 'function' || typeof signal.aborted !== 'boolean')) {
      throw new TypeError('signal must be an AbortSignal');
    }
    if (signal?.aborted) return Promise.reject(abortError(signal.reason));

    let entry = flights.get(key);
    if (!entry) {
      const controller = new AbortController();
      entry = { controller, subscribers: 0, settled: false, promise: null };
      flights.set(key, entry);
      entry.promise = Promise.resolve().then(() => {
        if (controller.signal.aborted) throw abortError(controller.signal.reason);
        return task(controller.signal);
      }).then(
        value => ({ ok: true, value }),
        error => ({ ok: false, error })
      ).then(outcome => {
        entry.settled = true;
        if (flights.get(key) === entry) flights.delete(key);
        return outcome;
      });
    }

    entry.subscribers += 1;
    return new Promise((resolve, reject) => {
      let active = true;
      const detach = () => {
        if (!active) return false;
        active = false;
        signal?.removeEventListener('abort', onAbort);
        entry.subscribers -= 1;
        if (!entry.settled && entry.subscribers === 0 && abortWhenUnused) {
          entry.controller.abort(new Error('all subscribers cancelled'));
          if (flights.get(key) === entry) flights.delete(key);
        }
        return true;
      };
      const onAbort = () => {
        if (detach()) reject(abortError(signal.reason));
      };

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted) {
          onAbort();
          return;
        }
      }
      entry.promise.then(outcome => {
        if (!detach()) return;
        if (outcome.ok) resolve(outcome.value);
        else reject(outcome.error);
      });
    });
  }

  return {
    run,
    get pendingCount() { return flights.size; }
  };
}

function abortError(reason) {
  if (reason instanceof Error && reason.name === 'AbortError') return reason;
  const error = new Error(reason instanceof Error ? reason.message : reason == null ? 'The operation was aborted' : String(reason));
  error.name = 'AbortError';
  return error;
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };

  (async () => {
    const flight = createSingleFlight();
    const gate = deferred();
    let calls = 0;
    const task = signal => {
      calls += 1;
      assert.equal(signal.aborted, false);
      return gate.promise;
    };
    const firstController = new AbortController();
    const first = flight.run('user:7', task, { signal: firstController.signal });
    const second = flight.run('user:7', task);
    await Promise.resolve();
    assert.equal(calls, 1);
    firstController.abort('caller left');
    await assert.rejects(first, error => error.name === 'AbortError');
    gate.resolve({ id: 7 });
    assert.deepEqual(await second, { id: 7 });
    assert.equal(flight.pendingCount, 0);

    const allCancel = createSingleFlight();
    const started = deferred();
    const c1 = new AbortController();
    const c2 = new AbortController();
    let underlyingSignal;
    const sharedTask = signal => {
      underlyingSignal = signal;
      started.resolve();
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('underlying stopped')), { once: true });
      });
    };
    const p1 = allCancel.run('same', sharedTask, { signal: c1.signal });
    const p2 = allCancel.run('same', sharedTask, { signal: c2.signal });
    await started.promise;
    c1.abort();
    c2.abort();
    await Promise.all([
      assert.rejects(p1, error => error.name === 'AbortError'),
      assert.rejects(p2, error => error.name === 'AbortError')
    ]);
    assert.equal(underlyingSignal.aborted, true);
    assert.equal(allCancel.pendingCount, 0);

    const retry = await allCancel.run('same', async () => 'fresh task');
    assert.equal(retry, 'fresh task');
    assert.equal(allCancel.pendingCount, 0);
    console.log('Async single-flight tests passed');
  })().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { createSingleFlight };
