'use strict';

// Exercise: Run asynchronous tasks as one structured group with bounded
// concurrency, fail-fast sibling cancellation, parent AbortSignal propagation,
// and LIFO cleanup. The group does not settle until every started task and
// every registered cleanup has settled.
//
// Tasks receive { signal, index, defer(cleanup) }. A task that ignores
// cancellation can delay group completion; this is intentional structured
// concurrency rather than detached background work.

const assert = require('node:assert/strict');

class TaskGroupError extends AggregateError {
  constructor(failures, cleanupErrors) {
    const errors = failures.map(item => item.error).concat(cleanupErrors);
    super(errors, 'One or more tasks in the group failed');
    this.name = 'TaskGroupError';
    this.failures = failures;
    this.cleanupErrors = cleanupErrors;
    if (failures.length) this.cause = failures[0].error;
  }
}

function makeAbortError(reason) {
  if (reason instanceof Error) return reason;
  const error = new Error(reason === undefined ? 'Task group aborted' : String(reason));
  error.name = 'AbortError';
  return error;
}

async function runTaskGroup(tasks, options = {}) {
  if (!Array.isArray(tasks) || tasks.some(task => typeof task !== 'function')) {
    throw new TypeError('tasks must be an array of functions');
  }

  const concurrency = options.concurrency === undefined
    ? Math.max(1, tasks.length)
    : options.concurrency;
  if (concurrency !== Infinity &&
      (!Number.isInteger(concurrency) || concurrency < 1)) {
    throw new RangeError('concurrency must be a positive integer or Infinity');
  }

  const parentSignal = options.signal;
  const failFast = options.failFast !== false;
  const controller = new AbortController();
  const results = new Array(tasks.length);
  const failures = [];
  const cleanups = [];
  let nextIndex = 0;

  function abortFromParent() {
    if (!controller.signal.aborted) controller.abort(parentSignal.reason);
  }

  if (parentSignal) {
    if (parentSignal.aborted) abortFromParent();
    else parentSignal.addEventListener('abort', abortFromParent, { once: true });
  }

  function defer(cleanup) {
    if (typeof cleanup !== 'function') throw new TypeError('cleanup must be a function');
    cleanups.push(cleanup);
  }

  async function worker() {
    while (!controller.signal.aborted) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= tasks.length) return;

      try {
        results[index] = await tasks[index]({
          signal: controller.signal,
          index,
          defer
        });
      } catch (error) {
        failures.push({ index, error });
        if (failFast && !controller.signal.aborted) controller.abort(error);
      }
    }
  }

  const workerCount = Math.min(tasks.length, concurrency === Infinity
    ? tasks.length
    : concurrency);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);

  if (parentSignal) parentSignal.removeEventListener('abort', abortFromParent);

  const cleanupErrors = [];
  for (let i = cleanups.length - 1; i >= 0; i -= 1) {
    try {
      await cleanups[i]();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  if (failures.length || cleanupErrors.length) {
    throw new TaskGroupError(
      failures.sort((a, b) => a.index - b.index),
      cleanupErrors
    );
  }
  if (controller.signal.aborted) throw makeAbortError(controller.signal.reason);
  return results;
}

async function runTests() {
  let active = 0;
  let maximumActive = 0;
  const successful = await runTaskGroup(
    [1, 2, 3, 4, 5].map(value => async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise(resolve => setTimeout(resolve, 2));
      active -= 1;
      return value * value;
    }),
    { concurrency: 2 }
  );
  assert.deepEqual(successful, [1, 4, 9, 16, 25]);
  assert.ok(maximumActive <= 2);

  const started = [];
  const cleanupOrder = [];
  let caught;
  try {
    await runTaskGroup([
      async ({ signal, defer }) => {
        started.push(0);
        defer(() => cleanupOrder.push(0));
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 100);
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(signal.reason);
          }, { once: true });
        });
        return 'unreachable';
      },
      async ({ defer }) => {
        started.push(1);
        defer(() => cleanupOrder.push(1));
        throw new Error('primary failure');
      },
      async () => {
        started.push(2);
        return 'must not start';
      }
    ], { concurrency: 2 });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof TaskGroupError);
  assert.ok(caught.failures.some(item => item.error.message === 'primary failure'));
  assert.deepEqual(started, [0, 1]);
  assert.deepEqual(cleanupOrder, [1, 0]);

  const parent = new AbortController();
  parent.abort(new Error('parent cancelled'));
  let ran = false;
  let abortCaught;
  try {
    await runTaskGroup([async () => { ran = true; }], { signal: parent.signal });
  } catch (error) {
    abortCaught = error;
  }
  assert.equal(ran, false);
  assert.equal(abortCaught.message, 'parent cancelled');

  let cleanupFailed;
  try {
    await runTaskGroup([
      async ({ defer }) => {
        defer(() => { throw new Error('cleanup failure'); });
        return 7;
      }
    ]);
  } catch (error) {
    cleanupFailed = error;
  }
  assert.ok(cleanupFailed instanceof TaskGroupError);
  assert.equal(cleanupFailed.cleanupErrors[0].message, 'cleanup failure');

  console.log('TaskGroup: all tests passed');
}

if (require.main === module) {
  runTests().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
module.exports = { runTaskGroup, TaskGroupError };
