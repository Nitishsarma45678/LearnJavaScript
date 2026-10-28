'use strict';

// Execute tasks only after their dependencies succeed, while limiting
// concurrency. A failed task causes its dependents to be skipped; unrelated
// branches continue. The graph is validated for missing dependencies/cycles
// before any task is started.
const assert = require('node:assert/strict');

async function runTaskDAG(tasks, options = {}) {
  const concurrency = options.concurrency ?? 2;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new TypeError('concurrency must be a positive integer');
  }
  if (!Array.isArray(tasks)) throw new TypeError('tasks must be an array');

  const normalized = tasks.map(task => {
    if (!task || typeof task.id !== 'string' || task.id.length === 0 ||
        typeof task.run !== 'function') {
      throw new TypeError('each task needs a non-empty string id and a run function');
    }
    const deps = task.deps ?? [];
    if (!Array.isArray(deps) || deps.some(dep => typeof dep !== 'string')) {
      throw new TypeError('task deps must be an array of task ids');
    }
    if (new Set(deps).size !== deps.length) {
      throw new TypeError('duplicate dependency in task ' + task.id);
    }
    return { id: task.id, deps: [...deps], run: task.run };
  });

  const byId = new Map();
  for (const task of normalized) {
    if (byId.has(task.id)) throw new TypeError('duplicate task id: ' + task.id);
    byId.set(task.id, task);
  }
  for (const task of normalized) {
    for (const dep of task.deps) {
      if (!byId.has(dep)) {
        throw new TypeError('unknown dependency "' + dep + '" in task "' + task.id + '"');
      }
    }
  }

  const indegree = new Map(normalized.map(task => [task.id, task.deps.length]));
  const dependents = new Map(normalized.map(task => [task.id, []]));
  for (const task of normalized) {
    for (const dep of task.deps) dependents.get(dep).push(task.id);
  }
  const ready = normalized.filter(task => indegree.get(task.id) === 0).map(task => task.id);
  let visited = 0;
  for (let head = 0; head < ready.length; head += 1) {
    const id = ready[head];
    visited += 1;
    for (const dependent of dependents.get(id)) {
      indegree.set(dependent, indegree.get(dependent) - 1);
      if (indegree.get(dependent) === 0) ready.push(dependent);
    }
  }
  if (visited !== normalized.length) throw new TypeError('task graph contains a cycle');

  const statuses = new Map(normalized.map(task => [task.id, 'pending']));
  const results = new Map();
  const errors = new Map();

  return new Promise(resolve => {
    let active = 0;
    let settled = 0;

    const pump = () => {
      let skippedSomething;
      do {
        skippedSomething = false;
        for (const task of normalized) {
          if (statuses.get(task.id) !== 'pending') continue;
          if (task.deps.some(dep =>
            statuses.get(dep) === 'failed' || statuses.get(dep) === 'skipped')) {
            statuses.set(task.id, 'skipped');
            settled += 1;
            skippedSomething = true;
          }
        }
      } while (skippedSomething);

      for (const task of normalized) {
        if (active >= concurrency) break;
        if (statuses.get(task.id) !== 'pending' ||
            !task.deps.every(dep => statuses.get(dep) === 'succeeded')) continue;

        statuses.set(task.id, 'running');
        active += 1;
        const dependencyResults = new Map(task.deps.map(dep => [dep, results.get(dep)]));

        Promise.resolve()
          .then(() => task.run(dependencyResults))
          .then(value => {
            results.set(task.id, value);
            statuses.set(task.id, 'succeeded');
          }, error => {
            errors.set(task.id, error);
            statuses.set(task.id, 'failed');
          })
          .finally(() => {
            active -= 1;
            settled += 1;
            pump();
          });
      }

      if (settled === normalized.length) {
        resolve({ results, errors, statuses });
      }
    };

    pump();
  });
}

// Example tests
(async () => {
  const outcome = await runTaskDAG([
    { id: 'load', run: async () => 10 },
    { id: 'double', deps: ['load'], run: async deps => deps.get('load') * 2 },
    { id: 'triple', deps: ['load'], run: async deps => deps.get('load') * 3 },
    {
      id: 'combine',
      deps: ['double', 'triple'],
      run: async deps => deps.get('double') + deps.get('triple')
    },
    { id: 'broken', run: async () => { throw new Error('expected failure'); } },
    { id: 'blocked', deps: ['broken'], run: async () => 'must not run' },
    { id: 'independent', run: async () => 'still runs' }
  ], { concurrency: 2 });

  assert.equal(outcome.results.get('combine'), 50);
  assert.equal(outcome.statuses.get('blocked'), 'skipped');
  assert.equal(outcome.statuses.get('broken'), 'failed');
  assert.equal(outcome.results.get('independent'), 'still runs');
  assert.equal(outcome.statuses.get('combine'), 'succeeded');

  await assert.rejects(
    runTaskDAG([
      { id: 'a', deps: ['b'], run: async () => 1 },
      { id: 'b', deps: ['a'], run: async () => 2 }
    ]),
    /cycle/
  );
  await assert.rejects(
    runTaskDAG([{ id: 'a', deps: ['missing'], run: async () => 1 }]),
    /unknown dependency/
  );

  console.log('runTaskDAG tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
