'use strict';

// Exercise: run a group of async tasks with shared cancellation and fail-fast
// semantics. The group does not settle until every started task has settled.

const assert = require('node:assert/strict');

async function runTaskGroup(tasks, { signal: externalSignal } = {}) {
  if (!Array.isArray(tasks) || tasks.some((task) => typeof task !== 'function')) {
    throw new TypeError('tasks must be an array of functions');
  }
  if (externalSignal?.aborted) throw externalSignal.reason || new Error('task group aborted');

  const controller = new AbortController();
  let firstError = null;
  const abortFromOutside = () => controller.abort(
    externalSignal.reason || new Error('task group aborted')
  );
  externalSignal?.addEventListener('abort', abortFromOutside, { once: true });

  const promises = tasks.map((task, index) => Promise.resolve().then(() =>
    task({ signal: controller.signal, index })
  ).catch((error) => {
    if (!firstError) {
      firstError = error;
      if (!controller.signal.aborted) controller.abort(error);
    }
    throw error;
  }));

  const settled = await Promise.allSettled(promises);
  externalSignal?.removeEventListener('abort', abortFromOutside);

  const failures = settled.filter((item) => item.status === 'rejected').map((item) => item.reason);
  if (firstError || controller.signal.aborted) {
    const reason = firstError || controller.signal.reason || new Error('task group aborted');
    throw new AggregateError(failures.length ? failures : [reason], 'one or more tasks failed', {
      cause: reason
    });
  }
  return settled.map((item) => item.value);
}

async function demo() {
  const values = await runTaskGroup([
    async () => 10,
    async ({ index }) => index + 20
  ]);
  assert.deepEqual(values, [10, 21]);

  let cancelled = false;
  await assert.rejects(runTaskGroup([
    async () => { throw new Error('primary failure'); },
    ({ signal }) => new Promise((resolve, reject) => {
      if (signal.aborted) {
        cancelled = true;
        reject(signal.reason);
        return;
      }
      signal.addEventListener('abort', () => {
        cancelled = true;
        reject(signal.reason);
      }, { once: true });
    })
  ]), AggregateError);
  assert.equal(cancelled, true);

  const controller = new AbortController();
  controller.abort(new Error('cancel before start'));
  await assert.rejects(runTaskGroup([async () => 1], { signal: controller.signal }));
}

if (require.main === module) demo().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

module.exports = { runTaskGroup };
