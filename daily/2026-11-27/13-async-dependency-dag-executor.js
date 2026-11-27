'use strict';

// Exercise: execute a task DAG with a concurrency limit. Dependencies must
// complete before a task starts. The first failure aborts the shared signal.

function runTaskGraph(tasks, options = {}) {
  const concurrency = options.concurrency ?? 3;
  const externalSignal = options.signal;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    return Promise.reject(new RangeError('concurrency must be positive'));
  }

  const byId = new Map();
  for (const task of tasks) {
    if (byId.has(task.id)) return Promise.reject(new Error('Duplicate task id: ' + task.id));
    byId.set(task.id, task);
  }
  const dependents = new Map(tasks.map(task => [task.id, []]));
  const remaining = new Map();
  for (const task of tasks) {
    const deps = task.dependencies ?? [];
    for (const dep of deps) {
      if (!byId.has(dep)) return Promise.reject(new Error('Unknown dependency: ' + dep));
      dependents.get(dep).push(task.id);
    }
    remaining.set(task.id, new Set(deps));
  }

  const ready = tasks.filter(task => remaining.get(task.id).size === 0).map(task => task.id);
  if (tasks.length && ready.length === 0) return Promise.reject(new Error('Dependency cycle detected'));
  const controller = new AbortController();
  const results = new Map();
  let running = 0;
  let settled = 0;
  let failed = false;

  return new Promise((resolve, reject) => {
    const abortFromOutside = () => {
      failed = true;
      controller.abort(externalSignal.reason);
      reject(externalSignal.reason ?? new Error('Execution aborted'));
    };
    if (externalSignal) {
      if (externalSignal.aborted) return abortFromOutside();
      externalSignal.addEventListener('abort', abortFromOutside, { once: true });
    }

    const finish = () => {
      if (settled === tasks.length) {
        if (externalSignal) externalSignal.removeEventListener('abort', abortFromOutside);
        resolve(Object.fromEntries(results));
      }
    };

    const schedule = () => {
      if (failed) return;
      while (running < concurrency && ready.length) {
        const id = ready.shift();
        const task = byId.get(id);
        running += 1;
        Promise.resolve().then(() => task.run({
          signal: controller.signal,
          results: new Map(results)
        })).then(value => {
          running -= 1;
          if (failed) return;
          results.set(id, value);
          settled += 1;
          for (const next of dependents.get(id)) {
            remaining.get(next).delete(id);
            if (remaining.get(next).size === 0) ready.push(next);
          }
          finish();
          schedule();
        }, error => {
          running -= 1;
          if (!failed) {
            failed = true;
            controller.abort(error);
            if (externalSignal) externalSignal.removeEventListener('abort', abortFromOutside);
            reject(error);
          }
        });
      }
      if (!tasks.length) resolve({});
      else if (!running && !ready.length && !failed && settled !== tasks.length) {
        failed = true;
        reject(new Error('Unreachable task graph'));
      }
    };
    schedule();
  });
}

const assert = require('node:assert/strict');
(async () => {
  const order = [];
  const result = await runTaskGraph([
    { id: 'compile', run: async () => { order.push('compile'); return 2; } },
    { id: 'test', dependencies: ['compile'], run: async ({ results }) => {
      order.push('test'); return results.get('compile') * 3;
    } },
    { id: 'docs', run: async () => { order.push('docs'); return 'ready'; } }
  ], { concurrency: 2 });
  assert.equal(result.test, 6);
  assert.equal(order.indexOf('compile') < order.indexOf('test'), true);
  await assert.rejects(runTaskGraph([
    { id: 'a', dependencies: ['b'], run: async () => 1 },
    { id: 'b', dependencies: ['a'], run: async () => 2 }
  ]), /cycle/);
  await assert.rejects(runTaskGraph([
    { id: 'bad', run: async () => { throw new Error('task failed'); } }
  ]), /task failed/);
  console.log('Async DAG executor tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

module.exports = { runTaskGraph };
