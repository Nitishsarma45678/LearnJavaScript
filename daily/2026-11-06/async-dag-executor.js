'use strict';

/**
 * Execute a dependency graph with bounded concurrency, retries and cancellation.
 * A task is { id, deps?: string[], run: async ({ signal, results, attempt }) => value }.
 * The returned Maps expose results, terminal errors and per-task statuses.
 * With failFast=false, independent branches continue after a failure while
 * descendants of failed tasks become blocked.
 */
async function runTaskGraph(tasks, options = {}) {
  const {
    concurrency = 4,
    retries = 0,
    retryDelay = 0,
    failFast = true,
    signal: externalSignal
  } = options;

  if (!Array.isArray(tasks)) throw new TypeError('tasks must be an array');
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError('concurrency must be a positive integer');
  if (!Number.isInteger(retries) || retries < 0) throw new RangeError('retries must be a non-negative integer');
  if (!Number.isFinite(retryDelay) || retryDelay < 0) throw new RangeError('retryDelay must be non-negative');

  const byId = new Map();
  for (const task of tasks) {
    if (!task || typeof task.id !== 'string' || task.id.length === 0 || typeof task.run !== 'function') {
      throw new TypeError('each task needs a non-empty string id and a run function');
    }
    if (byId.has(task.id)) throw new Error('duplicate task id: ' + task.id);
    const deps = task.deps ?? [];
    if (!Array.isArray(deps) || deps.some(dep => typeof dep !== 'string')) {
      throw new TypeError('task dependencies must be an array of string ids');
    }
    if (new Set(deps).size !== deps.length) throw new Error('duplicate dependency in task: ' + task.id);
    byId.set(task.id, { ...task, deps: [...deps] });
  }
  for (const task of byId.values()) {
    for (const dep of task.deps) if (!byId.has(dep)) throw new Error('unknown dependency ' + dep + ' in task ' + task.id);
  }

  // Reject cycles before running any user code.
  const indegree = new Map([...byId.keys()].map(id => [id, byId.get(id).deps.length]));
  const dependents = new Map([...byId.keys()].map(id => [id, []]));
  for (const task of byId.values()) for (const dep of task.deps) dependents.get(dep).push(task.id);
  const readyForCycleCheck = [...indegree].filter(([, degree]) => degree === 0).map(([id]) => id);
  let visited = 0;
  for (let head = 0; head < readyForCycleCheck.length; head += 1) {
    const id = readyForCycleCheck[head];
    visited += 1;
    for (const child of dependents.get(id)) {
      indegree.set(child, indegree.get(child) - 1);
      if (indegree.get(child) === 0) readyForCycleCheck.push(child);
    }
  }
  if (visited !== byId.size) throw new Error('task graph contains a dependency cycle');

  const controller = new AbortController();
  const results = new Map();
  const errors = new Map();
  const statuses = new Map([...byId.keys()].map(id => [id, 'pending']));
  const active = new Map();
  let halted = false;

  const abortFromExternal = () => {
    halted = true;
    if (!controller.signal.aborted) controller.abort(externalSignal.reason);
  };
  if (externalSignal?.aborted) abortFromExternal();
  else externalSignal?.addEventListener('abort', abortFromExternal, { once: true });

  const delay = ms => new Promise((resolve, reject) => {
    if (ms === 0) return resolve();
    if (controller.signal.aborted) return reject(controller.signal.reason ?? new Error('aborted'));
    const timer = setTimeout(done, ms);
    function done() {
      controller.signal.removeEventListener('abort', onAbort);
      resolve();
    }
    function onAbort() {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', onAbort);
      reject(controller.signal.reason ?? new Error('aborted'));
    }
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });

  async function execute(task) {
    statuses.set(task.id, 'running');
    for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
      if (controller.signal.aborted) {
        statuses.set(task.id, 'cancelled');
        return;
      }
      try {
        const value = await task.run({
          signal: controller.signal,
          results: new Map(results),
          attempt
        });
        results.set(task.id, value);
        statuses.set(task.id, 'fulfilled');
        return;
      } catch (error) {
        if (controller.signal.aborted) {
          statuses.set(task.id, 'cancelled');
          return;
        }
        if (attempt <= retries) {
          try {
            await delay(retryDelay);
          } catch {
            statuses.set(task.id, 'cancelled');
            return;
          }
          continue;
        }
        errors.set(task.id, error);
        statuses.set(task.id, 'rejected');
        if (failFast) {
          halted = true;
          if (!controller.signal.aborted) controller.abort(error);
        }
      }
    }
  }

  try {
    while (true) {
      if (externalSignal?.aborted && !controller.signal.aborted) abortFromExternal();

      // Propagate failed dependencies through the graph before selecting work.
      let changed;
      do {
        changed = false;
        for (const task of byId.values()) {
          if (statuses.get(task.id) !== 'pending') continue;
          if (task.deps.some(dep => ['rejected', 'blocked', 'cancelled'].includes(statuses.get(dep)))) {
            statuses.set(task.id, 'blocked');
            changed = true;
          }
        }
      } while (changed);

      if (halted) {
        for (const [id, status] of statuses) if (status === 'pending') statuses.set(id, 'cancelled');
      } else {
        for (const task of byId.values()) {
          if (active.size >= concurrency) break;
          if (statuses.get(task.id) !== 'pending') continue;
          if (task.deps.every(dep => statuses.get(dep) === 'fulfilled')) {
            active.set(task.id, execute(task));
          }
        }
      }

      if (active.size === 0) {
        const pending = [...statuses.values()].some(status => status === 'pending');
        if (pending) {
          // A valid DAG can have pending nodes only while a dependency is active.
          // If no task is active, any remaining node is necessarily blocked.
          for (const [id, status] of statuses) if (status === 'pending') statuses.set(id, 'blocked');
        }
        break;
      }

      await Promise.race(active.values());
      for (const [id] of active) if (statuses.get(id) !== 'running') active.delete(id);
    }
  } finally {
    externalSignal?.removeEventListener('abort', abortFromExternal);
  }

  return {
    results,
    errors,
    statuses,
    ok: [...statuses.values()].every(status => status === 'fulfilled')
  };
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  const sleep = (ms, signal) => new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal.aborted) {
      clearTimeout(timer);
      reject(signal.reason ?? new Error('aborted'));
      return;
    }
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error('aborted'));
    }, { once: true });
  });

  (async () => {
    let active = 0;
    let peak = 0;
    let flakyAttempts = 0;
    const outcome = await runTaskGraph([
      { id: 'seed', run: async ({ signal }) => { active += 1; peak = Math.max(peak, active); await sleep(8, signal); active -= 1; return 2; } },
      { id: 'double', deps: ['seed'], run: async ({ results }) => results.get('seed') * 2 },
      { id: 'flaky', run: async () => { flakyAttempts += 1; if (flakyAttempts === 1) throw new Error('temporary'); return 3; } },
      { id: 'total', deps: ['double', 'flaky'], run: async ({ results }) => results.get('double') + results.get('flaky') }
    ], { concurrency: 2, retries: 1 });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.results.get('total'), 7);
    assert.equal(flakyAttempts, 2);
    assert.ok(peak <= 2);

    const partial = await runTaskGraph([
      { id: 'bad', run: async () => { throw new Error('expected'); } },
      { id: 'dependent', deps: ['bad'], run: async () => 'must not run' },
      { id: 'independent', run: async () => 'completed' }
    ], { failFast: false, concurrency: 2 });
    assert.equal(partial.statuses.get('bad'), 'rejected');
    assert.equal(partial.statuses.get('dependent'), 'blocked');
    assert.equal(partial.results.get('independent'), 'completed');
    assert.equal(partial.ok, false);

    await assert.rejects(runTaskGraph([
      { id: 'a', deps: ['b'], run: async () => 1 },
      { id: 'b', deps: ['a'], run: async () => 2 }
    ]), /cycle/);
    console.log('Async DAG executor: all tests passed');
  })().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { runTaskGraph };
