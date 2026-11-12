'use strict';

const assert = require('node:assert/strict');

class Semaphore {
  constructor(limit) {
    if (!(limit === Infinity || (Number.isInteger(limit) && limit > 0))) {
      throw new RangeError('concurrency must be a positive integer or Infinity');
    }
    this.limit = limit;
    this.active = 0;
    this.queue = [];
  }

  acquire(signal) {
    if (signal?.aborted) return Promise.reject(signal.reason || new Error('Aborted'));
    if (this.active < this.limit) {
      this.active++;
      return Promise.resolve(this.releaseOnce());
    }
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, signal, onAbort: null, granted: false };
      waiter.onAbort = () => {
        if (waiter.granted) return;
        const index = this.queue.indexOf(waiter);
        if (index !== -1) this.queue.splice(index, 1);
        reject(signal.reason || new Error('Aborted'));
      };
      signal?.addEventListener('abort', waiter.onAbort, { once: true });
      this.queue.push(waiter);
    });
  }

  releaseOnce() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      while (this.queue.length) {
        const waiter = this.queue.shift();
        if (waiter.signal?.aborted) continue;
        waiter.granted = true;
        waiter.signal?.removeEventListener('abort', waiter.onAbort);
        waiter.resolve(this.releaseOnce()); // transfer the active permit
        return;
      }
      this.active--;
    };
  }

  async use(fn, signal) {
    const release = await this.acquire(signal);
    try { return await fn(); }
    finally { release(); }
  }
}

/**
 * Creates a memoized asynchronous evaluator for a static dependency DAG.
 * Dependencies run before a task takes a concurrency permit, preventing
 * worker starvation/deadlock. Successful results stay cached; failures do not.
 */
function createDagEvaluator(definitions, { concurrency = 4, signal } = {}) {
  if (!definitions || typeof definitions !== 'object' || Array.isArray(definitions)) {
    throw new TypeError('definitions must be an object map');
  }
  const tasks = new Map();
  for (const [name, definition] of Object.entries(definitions)) {
    if (!definition || typeof definition.run !== 'function') throw new TypeError('Task ' + name + ' needs a run function');
    const deps = definition.deps ?? [];
    if (!Array.isArray(deps) || deps.some(dep => typeof dep !== 'string')) throw new TypeError('Task ' + name + ' has invalid deps');
    tasks.set(name, { deps: [...new Set(deps)], run: definition.run });
  }
  for (const [name, task] of tasks) {
    for (const dep of task.deps) if (!tasks.has(dep)) throw new Error('Task ' + name + ' depends on unknown task ' + dep);
  }

  // Validate all components up front and report a concrete cycle path.
  const state = new Map();
  const path = [];
  function visit(name) {
    const status = state.get(name) || 0;
    if (status === 2) return;
    if (status === 1) {
      const start = path.indexOf(name);
      throw new Error('Dependency cycle: ' + [...path.slice(start), name].join(' -> '));
    }
    state.set(name, 1);
    path.push(name);
    for (const dep of tasks.get(name).deps) visit(dep);
    path.pop();
    state.set(name, 2);
  }
  for (const name of tasks.keys()) visit(name);

  const semaphore = new Semaphore(concurrency);
  const cache = new Map();
  let executions = 0;

  function run(name) {
    if (!tasks.has(name)) return Promise.reject(new Error('Unknown task: ' + name));
    if (signal?.aborted) return Promise.reject(signal.reason || new Error('Aborted'));
    if (cache.has(name)) return cache.get(name);
    const task = tasks.get(name);
    const promise = Promise.all(task.deps.map(run)).then(depValues => {
      const deps = Object.freeze(Object.fromEntries(task.deps.map((dep, i) => [dep, depValues[i]])));
      return semaphore.use(async () => {
        if (signal?.aborted) throw signal.reason || new Error('Aborted');
        executions++;
        return task.run({ name, deps, signal });
      }, signal);
    });
    cache.set(name, promise);
    promise.catch(() => { if (cache.get(name) === promise) cache.delete(name); });
    return promise;
  }

  return {
    async evaluate(targets) {
      const names = typeof targets === 'string' ? [targets] : targets;
      if (!Array.isArray(names) || names.length === 0 || names.some(x => typeof x !== 'string')) {
        throw new TypeError('targets must be a task name or a non-empty array of task names');
      }
      const values = await Promise.all(names.map(run));
      return new Map(names.map((name, i) => [name, values[i]]));
    },
    clearCache(name) {
      if (name === undefined) cache.clear();
      else cache.delete(name);
    },
    get stats() { return Object.freeze({ cached: cache.size, executions, active: semaphore.active, queued: semaphore.queue.length }); }
  };
}

async function runTests() {
  let active = 0, peak = 0;
  const calls = { source: 0, left: 0, right: 0, final: 0 };
  const evaluator = createDagEvaluator({
    source: { run: async () => { calls.source++; await Promise.resolve(); return 5; } },
    left: { deps: ['source'], run: async ({ deps }) => { calls.left++; active++; peak = Math.max(peak, active); await Promise.resolve(); active--; return deps.source * 2; } },
    right: { deps: ['source'], run: async ({ deps }) => { calls.right++; active++; peak = Math.max(peak, active); await Promise.resolve(); active--; return deps.source + 3; } },
    final: { deps: ['left', 'right'], run: ({ deps }) => { calls.final++; return deps.left + deps.right; } }
  }, { concurrency: 2 });
  const first = await evaluator.evaluate('final');
  assert.equal(first.get('final'), 18);
  await evaluator.evaluate(['left', 'right']);
  assert.deepEqual(calls, { source: 1, left: 1, right: 1, final: 1 });
  assert.ok(peak <= 2);
  evaluator.clearCache();
  await evaluator.evaluate('final');
  assert.equal(calls.source, 2);

  let attempts = 0;
  const retry = createDagEvaluator({ unstable: { run: () => { if (++attempts === 1) throw new Error('transient'); return 42; } } });
  await assert.rejects(retry.evaluate('unstable'), /transient/);
  assert.equal((await retry.evaluate('unstable')).get('unstable'), 42);
  assert.throws(() => createDagEvaluator({ a: { deps: ['b'], run() {} }, b: { deps: ['a'], run() {} } }), /cycle/);
  assert.throws(() => createDagEvaluator({ a: { deps: ['missing'], run() {} } }), /unknown task/);
  assert.throws(() => createDagEvaluator({ a: { run() {} } }, { concurrency: 0 }), /concurrency/);
  console.log('Async DAG Memoized Evaluator: all tests passed');
}

if (require.main === module) runTests().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { createDagEvaluator };
