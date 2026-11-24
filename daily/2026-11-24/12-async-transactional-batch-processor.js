'use strict';

const assert = require('node:assert/strict');

async function runTransactionalBatch(items, worker, commit, options = {}) {
  const concurrency = options.concurrency ?? 4;
  const externalSignal = options.signal;
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError('Concurrency must be positive');
  if (typeof worker !== 'function' || typeof commit !== 'function') throw new TypeError('Worker and commit must be functions');

  const controller = new AbortController();
  const results = Array(items.length);
  let cursor = 0;
  let firstError = null;
  const abortFromParent = () => controller.abort(externalSignal.reason || new Error('Batch aborted'));
  if (externalSignal?.aborted) abortFromParent();
  else externalSignal?.addEventListener('abort', abortFromParent, { once: true });

  async function runWorker() {
    while (!controller.signal.aborted) {
      const index = cursor++;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index, controller.signal);
      } catch (error) {
        if (!firstError) {
          firstError = error;
          controller.abort(error);
        }
        return;
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
    if (firstError) throw firstError;
    if (controller.signal.aborted) throw controller.signal.reason || new Error('Batch aborted');
    return await commit(results);
  } finally {
    externalSignal?.removeEventListener('abort', abortFromParent);
  }
}

(async () => {
  let active = 0;
  let peak = 0;
  const committed = [];
  const result = await runTransactionalBatch([1, 2, 3, 4, 5], async value => {
    active++;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active--;
    return value * value;
  }, async values => {
    committed.push(values);
    return values.reduce((sum, value) => sum + value, 0);
  }, { concurrency: 2 });

  assert.equal(result, 55);
  assert.equal(peak, 2);
  assert.deepEqual(committed, [[1, 4, 9, 16, 25]]);

  let commitCalled = false;
  await assert.rejects(runTransactionalBatch([1, 2, 3], async value => {
    if (value === 2) throw new Error('bad row');
    return value;
  }, async values => { commitCalled = true; return values; }, { concurrency: 2 }), /bad row/);
  assert.equal(commitCalled, false);

  const controller = new AbortController();
  controller.abort(new Error('caller cancelled'));
  await assert.rejects(runTransactionalBatch([1], async value => value, async values => values, {
    signal: controller.signal
  }), /caller cancelled/);
  console.log('Transactional-batch examples passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

module.exports = { runTransactionalBatch };
