"use strict";

const assert = require("node:assert/strict");

/**
 * Coalesce bursts of calls into one async invocation using the latest
 * arguments and receiver. Every call in a burst settles with the same result.
 *
 * wait: quiet-period delay in milliseconds.
 * maxWait: maximum delay from the first call in a burst (Infinity disables it).
 *
 * The returned function has cancel(reason), flush(), and pending() methods.
 */
function debounceAsync(fn, { wait = 100, maxWait = Infinity } = {}) {
  if (typeof fn !== "function") throw new TypeError("fn must be a function");
  if (!Number.isFinite(wait) || wait < 0) {
    throw new TypeError("wait must be a finite non-negative number");
  }
  if (!(maxWait === Infinity || (Number.isFinite(maxWait) && maxWait >= 0))) {
    throw new TypeError("maxWait must be non-negative or Infinity");
  }

  let batch = null;
  let waitTimer = null;
  let maxTimer = null;

  function clearTimers() {
    if (waitTimer !== null) clearTimeout(waitTimer);
    if (maxTimer !== null) clearTimeout(maxTimer);
    waitTimer = null;
    maxTimer = null;
  }

  function invoke() {
    if (batch === null) return Promise.resolve(undefined);

    const current = batch;
    batch = null;
    clearTimers();

    const resultPromise = Promise.resolve().then(() =>
      fn.apply(current.context, current.args)
    );
    resultPromise.then(
      value => current.waiters.forEach(waiter => waiter.resolve(value)),
      error => current.waiters.forEach(waiter => waiter.reject(error))
    );
    return resultPromise;
  }

  function debounced(...args) {
    if (batch === null) {
      batch = { context: this, args, waiters: [] };
      if (Number.isFinite(maxWait)) {
        maxTimer = setTimeout(() => { void invoke(); }, maxWait);
      }
    } else {
      batch.context = this;
      batch.args = args;
    }

    if (waitTimer !== null) clearTimeout(waitTimer);
    waitTimer = setTimeout(() => { void invoke(); }, wait);

    return new Promise((resolve, reject) => {
      batch.waiters.push({ resolve, reject });
    });
  }

  debounced.cancel = function cancel(reason = new Error("Debounced call cancelled")) {
    if (batch === null) return false;
    const current = batch;
    batch = null;
    clearTimers();
    current.waiters.forEach(waiter => waiter.reject(reason));
    return true;
  };

  debounced.flush = function flush() {
    return batch === null ? Promise.resolve(undefined) : invoke();
  };

  debounced.pending = function pending() {
    return batch !== null;
  };

  return debounced;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runTests() {
  let calls = 0;
  const debounced = debounceAsync(async value => {
    calls += 1;
    return value * 2;
  }, { wait: 15, maxWait: 60 });

  const first = debounced(1);
  await sleep(5);
  const second = debounced(2);
  await sleep(5);
  const third = debounced(3);
  assert.equal(debounced.pending(), true);
  assert.deepEqual(await Promise.all([first, second, third]), [6, 6, 6]);
  assert.equal(calls, 1);
  assert.equal(debounced.pending(), false);

  // flush() invokes immediately and resolves both the returned promise and
  // the promise from the call that was waiting for the debounce timer.
  const waiting = debounced(4);
  assert.equal(await debounced.flush(), 8);
  assert.equal(await waiting, 8);
  assert.equal(calls, 2);
  assert.equal(await debounced.flush(), undefined);

  // Cancellation rejects every caller in the current burst.
  const cancelledA = debounced(5);
  const cancelledB = debounced(6);
  assert.equal(debounced.cancel(new Error("test cancellation")), true);
  const settled = await Promise.allSettled([cancelledA, cancelledB]);
  assert.deepEqual(settled.map(item => item.status), ["rejected", "rejected"]);
  assert.equal(debounced.cancel(), false);

  // maxWait bounds a stream of calls that keeps resetting the quiet timer.
  const bounded = debounceAsync(value => value, { wait: 30, maxWait: 45 });
  const started = Date.now();
  const promises = [];
  for (let value = 0; value < 5; value++) {
    promises.push(bounded(value));
    await sleep(10);
  }
  assert.deepEqual(await Promise.all(promises), [4, 4, 4, 4, 4]);
  assert.ok(Date.now() - started < 100, "maxWait should prevent indefinite postponement");

  const failing = debounceAsync(() => { throw new Error("boom"); }, { wait: 1 });
  await assert.rejects(failing(), /boom/);
  assert.throws(() => debounceAsync(null), TypeError);
  assert.throws(() => debounceAsync(() => {}, { wait: -1 }), TypeError);

  console.log("async-debounce-with-max-wait: all assertions passed");
}

runTests().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
