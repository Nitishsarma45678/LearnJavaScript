'use strict';

// Exercise: create a small deep-reactivity engine. Effects track exactly the
// properties they read; nested writes invalidate dependents. batch() coalesces
// multiple changes into one rerun per effect.

function createReactivity() {
  const targetMap = new WeakMap();
  const proxyCache = new WeakMap();
  const ITERATE = Symbol('iterate');
  const pending = new Set();
  let activeEffect = null;
  let batchDepth = 0;

  function cleanup(runner) {
    for (const dep of runner.deps) dep.delete(runner);
    runner.deps.clear();
  }

  function track(target, key) {
    if (!activeEffect) return;
    let byKey = targetMap.get(target);
    if (!byKey) targetMap.set(target, byKey = new Map());
    let dep = byKey.get(key);
    if (!dep) byKey.set(key, dep = new Set());
    if (!dep.has(activeEffect)) {
      dep.add(activeEffect);
      activeEffect.deps.add(dep);
    }
  }

  function flush() {
    while (pending.size) {
      const jobs = [...pending];
      pending.clear();
      for (const job of jobs) if (job.active) job();
    }
  }

  function trigger(target, key, structural = false) {
    const byKey = targetMap.get(target);
    if (!byKey) return;
    const jobs = new Set(byKey.get(key) ?? []);
    if (structural) for (const job of byKey.get(ITERATE) ?? []) jobs.add(job);
    for (const job of jobs) pending.add(job);
    if (batchDepth === 0) flush();
  }

  function reactive(target) {
    if (target === null || typeof target !== 'object') return target;
    if (proxyCache.has(target)) return proxyCache.get(target);
    const proxy = new Proxy(target, {
      get(object, key, receiver) {
        if (key !== Symbol.unscopables) track(object, key);
        return reactive(Reflect.get(object, key, receiver));
      },
      set(object, key, value, receiver) {
        const hadKey = Object.prototype.hasOwnProperty.call(object, key);
        const previous = Reflect.get(object, key, receiver);
        const changed = !Object.is(previous, value);
        const success = Reflect.set(object, key, value, receiver);
        if (success && changed) trigger(object, key, !hadKey);
        return success;
      },
      deleteProperty(object, key) {
        const hadKey = Object.prototype.hasOwnProperty.call(object, key);
        const success = Reflect.deleteProperty(object, key);
        if (success && hadKey) trigger(object, key, true);
        return success;
      },
      ownKeys(object) {
        track(object, ITERATE);
        return Reflect.ownKeys(object);
      }
    });
    proxyCache.set(target, proxy);
    return proxy;
  }

  function effect(fn) {
    const runner = () => {
      if (!runner.active) return fn();
      cleanup(runner);
      const previous = activeEffect;
      activeEffect = runner;
      try { return fn(); }
      finally { activeEffect = previous; }
    };
    runner.active = true;
    runner.deps = new Set();
    runner();
    return () => {
      runner.active = false;
      cleanup(runner);
      pending.delete(runner);
    };
  }

  function batch(fn) {
    batchDepth += 1;
    try { return fn(); }
    finally {
      batchDepth -= 1;
      if (batchDepth === 0) flush();
    }
  }

  return { reactive, effect, batch };
}

const assert = require('node:assert/strict');
const { reactive, effect, batch } = createReactivity();
const state = reactive({ user: { name: 'Ada' }, count: 0 });
let greeting = '';
let runs = 0;
const stop = effect(() => {
  runs += 1;
  greeting = state.user.name + ':' + state.count;
});
state.user.name = 'Grace';
assert.equal(greeting, 'Grace:0');
batch(() => {
  state.count += 1;
  state.count += 1;
  state.user.name = 'Lin';
});
assert.equal(greeting, 'Lin:2');
assert.equal(runs, 3, 'batched changes trigger one rerun');
stop();
state.count += 1;
assert.equal(runs, 3);
console.log('Reactive dependency tracker tests passed');

module.exports = { createReactivity };
