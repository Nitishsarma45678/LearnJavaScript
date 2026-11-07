'use strict';

/**
 * Exercise: Coordinate staggered replica requests (hedged requests).
 *
 * Launch the primary immediately, start later replicas after hedgeDelayMs,
 * and launch the next replica immediately when one fails. The first success
 * wins; losing replicas are aborted. Caller cancellation and aggregate failure
 * are propagated without leaving timers or event listeners behind.
 */

function makeAbortError(reason) {
  if (reason instanceof Error) return reason;
  const error = new Error(reason === undefined ? 'The operation was aborted' : String(reason));
  error.name = 'AbortError';
  return error;
}

function createHedgedRequest(replicas, { hedgeDelayMs = 40 } = {}) {
  if (!Array.isArray(replicas) || replicas.length === 0 || replicas.some((fn) => typeof fn !== 'function')) {
    throw new TypeError('replicas must be a non-empty array of functions');
  }
  if (!Number.isFinite(hedgeDelayMs) || hedgeDelayMs < 0) {
    throw new RangeError('hedgeDelayMs must be a non-negative finite number');
  }

  return function execute({ signal } = {}) {
    if (signal !== undefined && (!signal || typeof signal.addEventListener !== 'function')) {
      return Promise.reject(new TypeError('signal must be an AbortSignal'));
    }

    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(makeAbortError(signal.reason));
        return;
      }

      let nextReplica = 0;
      let active = 0;
      let settled = false;
      let hedgeTimer = null;
      const controllers = new Map();
      const errors = new Array(replicas.length);

      function clearHedgeTimer() {
        if (hedgeTimer !== null) {
          clearTimeout(hedgeTimer);
          hedgeTimer = null;
        }
      }

      function abortReplicas(exceptIndex = -1, reason = makeAbortError()) {
        for (const [index, controller] of controllers) {
          if (index !== exceptIndex && !controller.signal.aborted) controller.abort(reason);
        }
      }

      function cleanup() {
        clearHedgeTimer();
        if (signal) signal.removeEventListener('abort', onCallerAbort);
      }

      function onCallerAbort() {
        if (settled) return;
        settled = true;
        cleanup();
        const error = makeAbortError(signal.reason);
        abortReplicas(-1, error);
        reject(error);
      }

      function scheduleHedge() {
        if (settled || hedgeTimer !== null || nextReplica >= replicas.length) return;
        hedgeTimer = setTimeout(() => {
          hedgeTimer = null;
          launchNext();
        }, hedgeDelayMs);
      }

      function failIfExhausted() {
        if (!settled && nextReplica === replicas.length && active === 0) {
          settled = true;
          cleanup();
          reject(new AggregateError(errors, `All ${replicas.length} replicas failed`));
        }
      }

      function launchNext() {
        if (settled || nextReplica >= replicas.length) return;
        const index = nextReplica++;
        const controller = new AbortController();
        controllers.set(index, controller);
        active++;

        Promise.resolve()
          .then(() => replicas[index](controller.signal))
          .then((value) => {
            active--;
            if (settled) return;
            settled = true;
            cleanup();
            abortReplicas(index);
            resolve(value);
          }, (error) => {
            active--;
            errors[index] = error;
            if (settled) return;
            // A failure should not wait for the next hedge interval.
            if (nextReplica < replicas.length) launchNext();
            scheduleHedge();
            failIfExhausted();
          });

        scheduleHedge();
      }

      if (signal) signal.addEventListener('abort', onCallerAbort, { once: true });
      // Close the race between the initial check and listener registration.
      if (signal?.aborted) { onCallerAbort(); return; }
      launchNext();
    });
  };
}

function delay(ms, signal, value, shouldReject = false) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(makeAbortError(signal.reason)); return; }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      shouldReject ? reject(value) : resolve(value);
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(makeAbortError(signal.reason));
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

if (require.main === module) {
  const assert = require('node:assert/strict');

  (async () => {
    let backupStarted = false;
    const primaryWins = createHedgedRequest([
      async () => 'primary',
      async () => { backupStarted = true; return 'backup'; },
    ], { hedgeDelayMs: 20 });
    assert.equal(await primaryWins(), 'primary');
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(backupStarted, false, 'a completed primary must prevent later launches');

    const failover = createHedgedRequest([
      async () => { throw new Error('replica 0 unavailable'); },
      async () => 'replica 1',
    ], { hedgeDelayMs: 100 });
    assert.equal(await failover(), 'replica 1', 'failure should trigger immediate failover');

    let primarySignal;
    const hedgeWins = createHedgedRequest([
      (signal) => { primarySignal = signal; return delay(100, signal, 'slow primary'); },
      (signal) => delay(2, signal, 'hedge winner'),
    ], { hedgeDelayMs: 5 });
    assert.equal(await hedgeWins(), 'hedge winner');
    assert.equal(primarySignal.aborted, true, 'losing primary must be aborted');

    const caller = new AbortController();
    let launched = 0;
    const cancellable = createHedgedRequest([
      (signal) => { launched++; return delay(100, signal, 'never'); },
      (signal) => { launched++; return delay(100, signal, 'also never'); },
    ], { hedgeDelayMs: 2 });
    const pending = cancellable({ signal: caller.signal });
    await new Promise((resolve) => setTimeout(resolve, 8));
    caller.abort('client disconnected');
    await assert.rejects(pending, (error) => error.name === 'AbortError' && /client disconnected/.test(error.message));
    assert.equal(launched, 2);

    const allFail = createHedgedRequest([
      async () => { throw new Error('first'); },
      async () => { throw new Error('second'); },
      async () => { throw new Error('third'); },
    ], { hedgeDelayMs: 100 });
    await assert.rejects(allFail(), (error) => {
      assert.equal(error.name, 'AggregateError');
      assert.equal(error.errors.length, 3);
      assert.deepEqual(error.errors.map((item) => item.message), ['first', 'second', 'third']);
      return true;
    });

    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    await assert.rejects(primaryWins({ signal: alreadyAborted.signal }), { name: 'AbortError' });
    assert.throws(() => createHedgedRequest([]), /non-empty/);
    assert.throws(() => createHedgedRequest([() => 1], { hedgeDelayMs: -1 }), /non-negative/);
    console.log('hedged-request-coordinator: all tests passed');
  })().catch((error) => { console.error(error); process.exitCode = 1; });
}

module.exports = { createHedgedRequest };
