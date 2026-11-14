/**
 * Dependency-aware asynchronous build scheduler
 * ----------------------------------------------
 * Exercise: execute a target closure in a task DAG with bounded concurrency,
 * dependency-result passing, versioned cache keys, fail-fast cancellation,
 * external AbortSignal support, and cycle/missing-dependency diagnostics.
 *
 * Each task is { id, deps?, version?, run(dependencyValues, context) }.
 * A task's version must change whenever its own build inputs change.
 *
 * Run: node async-dag-build-scheduler.js
 */

'use strict';

const assert = require('node:assert/strict');

function abortReason(signal) {
  if (signal.reason instanceof Error) return signal.reason;
  return new Error(signal.reason === undefined ? 'operation aborted' : String(signal.reason));
}

function throwIfAborted(signal) {
  if (signal.aborted) throw abortReason(signal);
}

class Semaphore {
  constructor(limit) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError('concurrency must be a positive integer');
    }
    this.limit = limit;
    this.active = 0;
    this.waiters = [];
  }

  acquire(signal) {
    throwIfAborted(signal);
    if (this.active < this.limit) {
      this.active++;
      return Promise.resolve(this.makeRelease());
    }

    return new Promise((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        signal,
        cancelled: false,
        onAbort: null
      };
      waiter.onAbort = () => {
        waiter.cancelled = true;
        const index = this.waiters.indexOf(waiter);
        if (index !== -1) this.waiters.splice(index, 1);
        reject(abortReason(signal));
      };
      signal.addEventListener('abort', waiter.onAbort, { once: true });
      this.waiters.push(waiter);
    });
  }

  makeRelease() {
    let released = false;
    return () => {
      if (released) return;
      released = true;

      while (this.waiters.length > 0) {
        const waiter = this.waiters.shift();
        if (waiter.cancelled || waiter.signal.aborted) continue;
        waiter.signal.removeEventListener('abort', waiter.onAbort);
        // Transfer the active permit directly; active count does not change.
        waiter.resolve(this.makeRelease());
        return;
      }
      this.active--;
    };
  }
}

class BuildScheduler {
  constructor(tasks, { concurrency = 4 } = {}) {
    if (!Array.isArray(tasks)) throw new TypeError('tasks must be an array');
    this.tasks = new Map();
    this.concurrency = concurrency;

    for (const task of tasks) {
      if (!task || typeof task.id !== 'string' || task.id.length === 0) {
        throw new TypeError('every task needs a non-empty string id');
      }
      if (typeof task.run !== 'function') {
        throw new TypeError(`task "${task.id}" needs a run function`);
      }
      if (this.tasks.has(task.id)) {
        throw new Error(`duplicate task id: ${task.id}`);
      }
      const deps = task.deps ?? [];
      if (!Array.isArray(deps) || deps.some(id => typeof id !== 'string')) {
        throw new TypeError(`dependencies for "${task.id}" must be an array of ids`);
      }
      if (new Set(deps).size !== deps.length) {
        throw new Error(`task "${task.id}" contains duplicate dependencies`);
      }
      this.tasks.set(task.id, {
        id: task.id,
        deps: deps.slice(),
        version: task.version ?? 1,
        run: task.run
      });
    }
  }

  validate(targets) {
    const roots = Array.isArray(targets) ? targets : [targets];
    if (roots.length === 0 || roots.some(id => typeof id !== 'string')) {
      throw new TypeError('targets must be a task id or a non-empty array of ids');
    }

    const state = new Map();
    const stack = [];
    const reachable = new Set();

    const visit = id => {
      const task = this.tasks.get(id);
      if (!task) throw new Error(`unknown task or dependency: ${id}`);
      const status = state.get(id);
      if (status === 2) return;
      if (status === 1) {
        const start = stack.indexOf(id);
        throw new Error(`dependency cycle: ${[...stack.slice(start), id].join(' -> ')}`);
      }

      state.set(id, 1);
      stack.push(id);
      reachable.add(id);
      for (const dependency of task.deps) visit(dependency);
      stack.pop();
      state.set(id, 2);
    };

    for (const root of roots) visit(root);
    return [...reachable];
  }

  async run(targets, {
    signal: externalSignal,
    cache = new Map(),
    failFast = true
  } = {}) {
    if (!(cache instanceof Map)) throw new TypeError('cache must be a Map');
    const roots = Array.isArray(targets) ? [...new Set(targets)] : [targets];
    const reachable = this.validate(roots);
    const controller = new AbortController();
    const semaphore = new Semaphore(this.concurrency);
    const promises = new Map();
    const stats = {
      reachableTasks: reachable.length,
      started: 0,
      cacheHits: 0,
      active: 0,
      maxActive: 0
    };

    const forwardAbort = () => controller.abort(abortReason(externalSignal));
    if (externalSignal) {
      if (externalSignal.aborted) forwardAbort();
      else externalSignal.addEventListener('abort', forwardAbort, { once: true });
    }

    const execute = id => {
      if (promises.has(id)) return promises.get(id);
      const task = this.tasks.get(id);

      const work = (async () => {
        const dependencyResults = await Promise.all(task.deps.map(execute));
        throwIfAborted(controller.signal);

        // The dependency fingerprints make downstream cache entries stale when
        // any dependency version changes, even if the task's own version does not.
        const cacheKey = JSON.stringify([
          id,
          String(task.version),
          dependencyResults.map(result => result.cacheKey)
        ]);

        if (cache.has(cacheKey)) {
          stats.cacheHits++;
          return { value: cache.get(cacheKey), cacheKey, cached: true };
        }

        const release = await semaphore.acquire(controller.signal);
        try {
          throwIfAborted(controller.signal);
          stats.active++;
          stats.started++;
          stats.maxActive = Math.max(stats.maxActive, stats.active);

          const value = await task.run(
            dependencyResults.map(result => result.value),
            {
              id,
              dependencies: task.deps.slice(),
              signal: controller.signal
            }
          );
          cache.set(cacheKey, value);
          return { value, cacheKey, cached: false };
        } finally {
          stats.active--;
          release();
        }
      })().catch(error => {
        if (failFast && !controller.signal.aborted) controller.abort(error);
        throw error;
      });

      promises.set(id, work);
      return work;
    };

    try {
      let results;
      if (failFast) {
        results = await Promise.all(roots.map(execute));
      } else {
        const settled = await Promise.allSettled(roots.map(execute));
        const failures = settled.filter(entry => entry.status === 'rejected');
        if (failures.length > 0) {
          throw new AggregateError(
            failures.map(entry => entry.reason),
            'one or more build targets failed'
          );
        }
        results = settled.map(entry => entry.value);
      }
      return {
        results: new Map(roots.map((id, index) => [id, results[index].value])),
        stats
      };
    } catch (error) {
      if (failFast && !controller.signal.aborted) controller.abort(error);
      await Promise.allSettled([...promises.values()]);
      throw error;
    } finally {
      if (externalSignal) {
        externalSignal.removeEventListener('abort', forwardAbort);
      }
    }
  }
}

async function runTests() {
  const cache = new Map();
  const scheduler = new BuildScheduler([
    { id: 'sources', version: 1, run: async () => ['a.js', 'b.js'] },
    {
      id: 'compile',
      deps: ['sources'],
      version: 3,
      run: async ([files]) => files.length * 3
    },
    {
      id: 'lint',
      deps: ['sources'],
      run: async ([files]) => files.length + 1
    },
    {
      id: 'bundle',
      deps: ['compile', 'lint'],
      run: async ([compiled, linted]) => compiled + linted
    }
  ], { concurrency: 2 });

  const first = await scheduler.run('bundle', { cache });
  assert.equal(first.results.get('bundle'), 9);
  assert.equal(first.stats.started, 4);
  assert.ok(first.stats.maxActive <= 2);

  const second = await scheduler.run('bundle', { cache });
  assert.equal(second.results.get('bundle'), 9);
  assert.equal(second.stats.cacheHits, 4);
  assert.equal(second.stats.started, 0);

  const failing = new BuildScheduler([
    { id: 'bad', run: async () => { throw new Error('compiler failed'); } },
    {
      id: 'must-not-run',
      deps: ['bad'],
      run: async () => { throw new Error('should never execute'); }
    }
  ]);
  await assert.rejects(failing.run('must-not-run'), /compiler failed/);

  const nonFailFast = new BuildScheduler([
    { id: 'bad-target', run: async () => { throw new Error('expected failure'); } },
    { id: 'independent-target', run: async () => 42 }
  ]);
  await assert.rejects(
    nonFailFast.run(['bad-target', 'independent-target'], { failFast: false }),
    error => error instanceof AggregateError && /one or more build targets failed/.test(error.message)
  );

  const cyclic = new BuildScheduler([
    { id: 'a', deps: ['b'], run: async () => 1 },
    { id: 'b', deps: ['a'], run: async () => 2 }
  ]);
  await assert.rejects(cyclic.run('a'), /dependency cycle/);

  const missing = new BuildScheduler([
    { id: 'target', deps: ['missing'], run: async () => 1 }
  ]);
  await assert.rejects(missing.run('target'), /unknown task or dependency/);

  const controller = new AbortController();
  const cancellable = new BuildScheduler([
    {
      id: 'wait',
      run: (_deps, { signal }) => new Promise((resolve, reject) => {
        if (signal.aborted) return reject(abortReason(signal));
        signal.addEventListener('abort', () => reject(abortReason(signal)), { once: true });
      })
    }
  ]);
  const pending = cancellable.run('wait', { signal: controller.signal });
  controller.abort(new Error('caller cancelled'));
  await assert.rejects(pending, /caller cancelled/);

  console.log('Async DAG Build Scheduler: all tests passed');
}

if (require.main === module) {
  runTests().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { BuildScheduler, Semaphore };
