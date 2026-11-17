'use strict';

/**
 * EXERCISE: Build a tiny reactive state engine with dependency tracking.
 *
 * Requirements:
 * - Nested objects become reactive lazily through Proxy.
 * - Effects subscribe only to properties they actually read.
 * - Re-running an effect removes its stale subscriptions first.
 * - `batch(fn)` coalesces repeated triggers into one effect run.
 * - `stop()` permanently disconnects an effect.
 * - Property addition/deletion must invalidate iteration effects.
 *
 * Run: node 06-reactive-state-engine.js
 */

const ITERATE = Symbol('iterate');
const rawToProxy = new WeakMap();
const proxyToRaw = new WeakMap();
const dependencies = new WeakMap();
const effectStack = [];
const pendingEffects = new Set();
let batchDepth = 0;
let flushing = false;

function toRaw(value) {
  return proxyToRaw.get(value) || value;
}

function getDependency(target, key, create = false) {
  let byKey = dependencies.get(target);
  if (!byKey && create) dependencies.set(target, byKey = new Map());
  if (!byKey) return undefined;
  let dep = byKey.get(key);
  if (!dep && create) byKey.set(key, dep = new Set());
  return dep;
}

function track(target, key) {
  const active = effectStack[effectStack.length - 1];
  if (!active || !active.active) return;
  const dep = getDependency(target, key, true);
  if (!dep.has(active)) {
    dep.add(active);
    active.deps.push(dep);
  }
}

function schedule(effect) {
  if (!effect.active || effectStack.includes(effect)) return;
  if (effect.scheduler) effect.scheduler(effect.runner);
  else if (batchDepth > 0 || flushing) pendingEffects.add(effect);
  else effect.runner();
}

function flush() {
  if (flushing || batchDepth > 0) return;
  flushing = true;
  try {
    while (pendingEffects.size) {
      const current = [...pendingEffects];
      pendingEffects.clear();
      for (const item of current) if (item.active) item.runner();
    }
  } finally {
    flushing = false;
  }
}

function trigger(target, key, type, oldLength) {
  const affected = new Set(getDependency(target, key) || []);
  if (type === 'add' || type === 'delete') {
    for (const item of getDependency(target, ITERATE) || []) affected.add(item);
  }
  if (Array.isArray(target) && key !== 'length' && type === 'add') {
    for (const item of getDependency(target, 'length') || []) affected.add(item);
  }
  if (Array.isArray(target) && key === 'length' && Number(target.length) < oldLength) {
    const byKey = dependencies.get(target);
    if (byKey) {
      for (const [depKey, dep] of byKey) {
        if (typeof depKey === 'string' && /^\d+$/.test(depKey) && Number(depKey) >= target.length) {
          for (const item of dep) affected.add(item);
        }
      }
    }
  }
  for (const item of affected) schedule(item);
  flush();
}

function reactive(input) {
  if (input === null || typeof input !== 'object') return input;
  if (proxyToRaw.has(input)) return input;
  const raw = toRaw(input);
  if (rawToProxy.has(raw)) return rawToProxy.get(raw);
  const proxy = new Proxy(raw, {
    get(target, key, receiver) {
      if (key === '__raw__') return target;
      track(target, key);
      return reactive(Reflect.get(target, key, receiver));
    },
    set(target, key, value, receiver) {
      const rawValue = toRaw(value);
      const had = Object.prototype.hasOwnProperty.call(target, key);
      const oldValue = Reflect.get(target, key, receiver);
      const oldLength = Array.isArray(target) ? target.length : undefined;
      const ok = Reflect.set(target, key, rawValue, receiver);
      if (ok && !Object.is(toRaw(oldValue), rawValue)) {
        trigger(target, key, had ? 'set' : 'add', oldLength);
      }
      return ok;
    },
    deleteProperty(target, key) {
      const had = Object.prototype.hasOwnProperty.call(target, key);
      const oldLength = Array.isArray(target) ? target.length : undefined;
      const ok = Reflect.deleteProperty(target, key);
      if (ok && had) trigger(target, key, 'delete', oldLength);
      return ok;
    },
    ownKeys(target) {
      track(target, ITERATE);
      return Reflect.ownKeys(target);
    }
  });
  rawToProxy.set(raw, proxy);
  proxyToRaw.set(proxy, raw);
  return proxy;
}

function effect(fn, options = {}) {
  if (typeof fn !== 'function') throw new TypeError('effect expects a function');
  const record = { active: true, deps: [], scheduler: options.scheduler, runner: null };
  const cleanup = () => {
    for (const dep of record.deps) dep.delete(record);
    record.deps.length = 0;
  };
  const runner = () => {
    if (!record.active) return fn();
    cleanup();
    effectStack.push(record);
    try { return fn(); }
    finally { effectStack.pop(); }
  };
  record.runner = runner;
  runner.stop = () => {
    if (!record.active) return;
    cleanup();
    record.active = false;
    pendingEffects.delete(record);
  };
  runner.effect = record;
  runner();
  return runner;
}

function batch(fn) {
  batchDepth++;
  try { return fn(); }
  finally {
    batchDepth--;
    if (batchDepth === 0) flush();
  }
}

// ------------------------------- Tests ------------------------------------
if (require.main === module) {
  const assert = require('node:assert/strict');
  const state = reactive({ user: { name: 'Ada' }, flag: true, spare: 0 });
  let greeting = '';
  const runs = { greeting: 0, keys: 0, conditional: 0 };
  const greetingEffect = effect(() => {
    runs.greeting++;
    greeting = `Hello, ${state.user.name}`;
  });
  assert.equal(greeting, 'Hello, Ada');
  state.user.name = 'Grace';
  assert.equal(greeting, 'Hello, Grace');
  assert.equal(runs.greeting, 2);

  let keyCount = 0;
  effect(() => { runs.keys++; keyCount = Object.keys(state).length; });
  state.extra = 1;
  assert.equal(keyCount, 4);
  delete state.spare;
  assert.equal(keyCount, 3);

  let selected;
  effect(() => {
    runs.conditional++;
    selected = state.flag ? state.user.name : state.extra;
  });
  state.flag = false;
  const before = runs.conditional;
  state.user.name = 'Katherine'; // stale dependency must have been removed
  assert.equal(runs.conditional, before);
  state.extra = 2;
  assert.equal(selected, 2);

  let batchRuns = 0;
  effect(() => { batchRuns++; void state.extra; });
  batch(() => { state.extra = 3; state.extra = 4; state.extra = 5; });
  assert.equal(batchRuns, 2);

  let stoppedRuns = 0;
  const stopped = effect(() => { stoppedRuns++; void state.flag; });
  stopped.stop();
  state.flag = true;
  assert.equal(stoppedRuns, 1);

  const list = reactive([10, 20]);
  let length;
  effect(() => { length = list.length; });
  list.push(30);
  assert.equal(length, 3);
  list.length = 1;
  assert.equal(list[1], undefined);

  greetingEffect.stop();
  console.log('Reactive state engine: all tests passed');
}

module.exports = { reactive, effect, batch, toRaw };
