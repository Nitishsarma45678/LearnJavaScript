const assert = require('node:assert/strict');

// Execute a DAG as soon as dependencies complete, with a bounded worker count.
// Each task is { deps: string[], run(context, signal) }; context contains completed values.
async function executeTaskGraph(tasks, { concurrency = Infinity, signal } = {}) {
  if (!tasks || typeof tasks !== 'object' || Array.isArray(tasks)) {
    throw new TypeError('tasks must be an object');
  }
  if (!(concurrency === Infinity || (Number.isInteger(concurrency) && concurrency > 0))) {
    throw new RangeError('concurrency must be a positive integer or Infinity');
  }

  const names = Object.keys(tasks);
  const indegree = new Map(names.map(name => [name, 0]));
  const dependents = new Map(names.map(name => [name, []]));

  for (const name of names) {
    const task = tasks[name];
    if (!task || typeof task.run !== 'function') {
      throw new TypeError(`task "${name}" must provide a run function`);
    }
    const deps = task.deps || [];
    if (!Array.isArray(deps) || new Set(deps).size !== deps.length) {
      throw new TypeError(`task "${name}" has invalid dependencies`);
    }
    for (const dependency of deps) {
      if (!Object.hasOwn(tasks, dependency)) {
        throw new Error(`task "${name}" depends on missing task "${dependency}"`);
      }
      indegree.set(name, indegree.get(name) + 1);
      dependents.get(dependency).push(name);
    }
  }

  // Validate acyclicity before invoking any user task.
  const checkDegree = new Map(indegree);
  const checkQueue = names.filter(name => checkDegree.get(name) === 0);
  let checked = 0;
  for (let i = 0; i < checkQueue.length; i++) {
    const name = checkQueue[i];
    checked++;
    for (const child of dependents.get(name)) {
      checkDegree.set(child, checkDegree.get(child) - 1);
      if (checkDegree.get(child) === 0) checkQueue.push(child);
    }
  }
  if (checked !== names.length) throw new Error('task graph contains a cycle');
  if (signal?.aborted) throw (signal.reason instanceof Error ? signal.reason : new Error('Aborted'));

  const ready = names.filter(name => indegree.get(name) === 0);
  const results = new Map();
  let active = 0;
  let completed = 0;
  let failure = null;

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    const finish = () => {
      if (settled) return;
      if (failure && active === 0) {
        settled = true;
        cleanup();
        reject(failure);
      } else if (!failure && completed === names.length && active === 0) {
        settled = true;
        cleanup();
        resolve(results);
      }
    };
    const onAbort = () => {
      if (!failure) failure = signal.reason instanceof Error ? signal.reason : new Error('Aborted');
      pump();
    };
    const pump = () => {
      if (signal?.aborted && !failure) {
        failure = signal.reason instanceof Error ? signal.reason : new Error('Aborted');
      }
      while (!failure && active < concurrency && ready.length) {
        const name = ready.shift();
        active++;
        Promise.resolve()
          .then(() => tasks[name].run(Object.fromEntries(results), signal))
          .then(value => {
            results.set(name, value);
            completed++;
            for (const child of dependents.get(name)) {
              indegree.set(child, indegree.get(child) - 1);
              if (indegree.get(child) === 0) ready.push(child);
            }
          })
          .catch(error => { if (!failure) failure = error; })
          .finally(() => {
            active--;
            pump();
          });
      }
      finish();
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    pump();
  });
}

(async () => {
  let active = 0, peak = 0;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const result = await executeTaskGraph({
    fetch: { run: async () => { active++; peak = Math.max(peak, active); await pause(8); active--; return 4; } },
    config: { run: async () => { active++; peak = Math.max(peak, active); await pause(4); active--; return 3; } },
    build: { deps: ['fetch', 'config'], run: ({ fetch, config }) => fetch * config }
  }, { concurrency: 2 });
  assert.equal(result.get('build'), 12);
  assert.ok(peak <= 2);

  await assert.rejects(() => executeTaskGraph({
    a: { deps: ['b'], run: () => 1 },
    b: { deps: ['a'], run: () => 2 }
  }), /cycle/);
  await assert.rejects(() => executeTaskGraph({
    a: { run: () => { throw new Error('task failed'); } },
    b: { deps: ['a'], run: () => 2 }
  }), /task failed/);
  await assert.rejects(() => executeTaskGraph({
    a: { deps: ['missing'], run: () => 1 }
  }), /missing task/);
  console.log('Async task graph tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
