/**
 * Exercise: Proxy-Based Reactive Dependency Graph
 *
 * Build a small reactivity engine with property-level dependency tracking,
 * nested proxies, effects, lazy computed values, batching, and watch cleanup.
 * The implementation demonstrates how frameworks avoid recomputing work
 * until a tracked dependency actually changes.
 *
 * Run: node daily/2026-11-11/reactiveDependencyGraph.js
 */

const assert = require("node:assert/strict");

const ITERATE_KEY = Symbol("iterate");

function createReactiveSystem() {
  const targetMap = new WeakMap();
  const proxyCache = new WeakMap();
  const proxyToRaw = new WeakMap();
  const effectStack = [];
  const pendingEffects = new Set();

  let activeEffect = null;
  let batchDepth = 0;
  let flushing = false;

  function cleanup(effectRecord) {
    for (const dependency of effectRecord.dependencies) {
      dependency.delete(effectRecord);
    }
    effectRecord.dependencies.length = 0;
  }

  function runEffect(effectRecord) {
    if (!effectRecord.active) return effectRecord.fn();
    if (effectStack.includes(effectRecord)) return;

    cleanup(effectRecord);
    effectStack.push(effectRecord);
    activeEffect = effectRecord;
    try {
      return effectRecord.fn();
    } finally {
      effectStack.pop();
      activeEffect = effectStack[effectStack.length - 1] || null;
    }
  }

  function dispatch(effectRecord) {
    if (!effectRecord.active) return;
    if (batchDepth > 0 || flushing) {
      pendingEffects.add(effectRecord);
      return;
    }
    if (effectRecord.scheduler) effectRecord.scheduler();
    else effectRecord.runner();
  }

  function flush() {
    if (flushing) return;
    flushing = true;
    let rounds = 0;
    try {
      while (pendingEffects.size) {
        rounds += 1;
        if (rounds > 10000) {
          pendingEffects.clear();
          throw new Error("Reactive update cycle exceeded 10,000 flush rounds");
        }
        const current = [...pendingEffects];
        pendingEffects.clear();
        for (const effectRecord of current) {
          if (!effectRecord.active) continue;
          if (effectRecord.scheduler) effectRecord.scheduler();
          else effectRecord.runner();
        }
      }
    } finally {
      flushing = false;
    }
  }

  function track(target, key) {
    if (!activeEffect) return;
    let dependencies = targetMap.get(target);
    if (!dependencies) {
      dependencies = new Map();
      targetMap.set(target, dependencies);
    }
    let dependency = dependencies.get(key);
    if (!dependency) {
      dependency = new Set();
      dependencies.set(key, dependency);
    }
    if (!dependency.has(activeEffect)) {
      dependency.add(activeEffect);
      activeEffect.dependencies.push(dependency);
    }
  }

  function trigger(target, key, operation = "set") {
    const dependencies = targetMap.get(target);
    if (!dependencies) return;
    const effects = new Set(dependencies.get(key) || []);
    if (operation === "add" || operation === "delete") {
      for (const effectRecord of dependencies.get(ITERATE_KEY) || []) {
        effects.add(effectRecord);
      }
    }
    for (const effectRecord of effects) {
      if (effectRecord !== activeEffect) dispatch(effectRecord);
    }
  }

  function reactive(target) {
    if (target === null || typeof target !== "object") return target;
    if (proxyToRaw.has(target)) return target;
    const cached = proxyCache.get(target);
    if (cached) return cached;

    const proxy = new Proxy(target, {
      get(raw, key, receiver) {
        if (key === "__isReactive") return true;
        track(raw, key);
        return reactive(Reflect.get(raw, key, receiver));
      },
      set(raw, key, value, receiver) {
        const rawReceiver = proxyToRaw.get(receiver) || receiver;
        const hadKey = Object.prototype.hasOwnProperty.call(raw, key);
        const previous = Reflect.get(raw, key, receiver);
        const success = Reflect.set(raw, key, value, receiver);
        if (success && raw === rawReceiver && !Object.is(previous, value)) {
          trigger(raw, key, hadKey ? "set" : "add");
        }
        return success;
      },
      deleteProperty(raw, key) {
        const hadKey = Object.prototype.hasOwnProperty.call(raw, key);
        const success = Reflect.deleteProperty(raw, key);
        if (success && hadKey) trigger(raw, key, "delete");
        return success;
      },
      ownKeys(raw) {
        track(raw, ITERATE_KEY);
        return Reflect.ownKeys(raw);
      },
      has(raw, key) {
        track(raw, key);
        return Reflect.has(raw, key);
      }
    });

    proxyCache.set(target, proxy);
    proxyToRaw.set(proxy, target);
    return proxy;
  }

  function effect(fn, { lazy = false, scheduler } = {}) {
    if (typeof fn !== "function") throw new TypeError("effect expects a function");
    if (scheduler !== undefined && typeof scheduler !== "function") {
      throw new TypeError("scheduler must be a function");
    }
    const record = {
      fn,
      scheduler,
      active: true,
      dependencies: [],
      runner: null
    };
    const runner = () => runEffect(record);
    record.runner = runner;
    runner.effect = record;
    if (!lazy) runner();
    return runner;
  }

  function stop(runner) {
    const record = runner && runner.effect;
    if (!record || !record.active) return;
    cleanup(record);
    record.active = false;
    pendingEffects.delete(record);
  }

  function batch(callback) {
    if (typeof callback !== "function") throw new TypeError("batch expects a function");
    batchDepth += 1;
    try {
      return callback();
    } finally {
      batchDepth -= 1;
      if (batchDepth === 0) flush();
    }
  }

  function computed(getter) {
    if (typeof getter !== "function") throw new TypeError("computed expects a getter");
    const holder = {};
    let dirty = true;
    let cachedValue;
    const runner = effect(getter, {
      lazy: true,
      scheduler() {
        if (!dirty) {
          dirty = true;
          trigger(holder, "value");
        }
      }
    });
    return {
      get value() {
        track(holder, "value");
        if (dirty) {
          cachedValue = runner();
          dirty = false;
        }
        return cachedValue;
      }
    };
  }

  function watch(source, callback, { immediate = false, equals = Object.is } = {}) {
    if (typeof source !== "function" || typeof callback !== "function") {
      throw new TypeError("watch expects source and callback functions");
    }
    let oldValue;
    let cleanupCallback;
    const onCleanup = fn => {
      if (typeof fn !== "function") throw new TypeError("watch cleanup must be a function");
      cleanupCallback = fn;
    };
    let runner;
    const job = () => {
      const nextValue = runner();
      if (equals(nextValue, oldValue)) return;
      if (cleanupCallback) {
        const previousCleanup = cleanupCallback;
        cleanupCallback = undefined;
        previousCleanup();
      }
      const previousValue = oldValue;
      oldValue = nextValue;
      callback(nextValue, previousValue, onCleanup);
    };
    runner = effect(source, { lazy: true, scheduler: job });
    oldValue = runner();
    if (immediate) callback(oldValue, undefined, onCleanup);
    return () => {
      if (cleanupCallback) {
        const previousCleanup = cleanupCallback;
        cleanupCallback = undefined;
        previousCleanup();
      }
      stop(runner);
    };
  }

  return { reactive, effect, stop, batch, computed, watch };
}

function runTests() {
  const system = createReactiveSystem();
  const { reactive, effect, stop, batch, computed, watch } = system;

  const state = reactive({ count: 0, nested: { value: 2 }, flag: true, left: 10, right: 20 });
  const observed = [];
  const stopObserver = effect(() => observed.push(state.count + state.nested.value));
  state.count = 1;
  state.nested.value = 3;
  assert.deepEqual(observed, [2, 3, 4]);

  let getterRuns = 0;
  const doubled = computed(() => {
    getterRuns += 1;
    return state.count * 2;
  });
  assert.equal(getterRuns, 0, "computed values are lazy");
  assert.equal(doubled.value, 2);
  assert.equal(doubled.value, 2);
  assert.equal(getterRuns, 1, "cached reads do not recompute");
  state.count = 2;
  assert.equal(getterRuns, 1, "invalidation does not eagerly recompute");
  assert.equal(doubled.value, 4);
  assert.equal(getterRuns, 2);

  let combinedRuns = 0;
  const pair = reactive({ a: 1, b: 2 });
  effect(() => {
    combinedRuns += 1;
    return pair.a + pair.b;
  });
  batch(() => {
    pair.a = 5;
    pair.b = 7;
    pair.a = 8;
  });
  assert.equal(combinedRuns, 2, "a batch should schedule an effect once");

  let conditionalValue;
  let conditionalRuns = 0;
  effect(() => {
    conditionalRuns += 1;
    conditionalValue = state.flag ? state.left : state.right;
  });
  state.left = 11;
  assert.equal(conditionalRuns, 1, "inactive branch dependencies must be removed");
  state.flag = false;
  assert.equal(conditionalValue, 20);
  state.left = 12;
  assert.equal(conditionalRuns, 2);
  state.right = 21;
  assert.equal(conditionalValue, 21);

  const watched = reactive({ value: 0 });
  const changes = [];
  let cleanupCount = 0;
  const stopWatch = watch(
    () => watched.value,
    (next, previous, onCleanup) => {
      changes.push([next, previous]);
      onCleanup(() => { cleanupCount += 1; });
    }
  );
  watched.value = 1;
  batch(() => {
    watched.value = 2;
    watched.value = 3;
  });
  assert.deepEqual(changes, [[1, 0], [3, 1]]);
  assert.equal(cleanupCount, 1);
  stopWatch();
  assert.equal(cleanupCount, 2);
  watched.value = 4;
  assert.equal(changes.length, 2);

  let keyRuns = 0;
  const dictionary = reactive({ known: true });
  effect(() => {
    keyRuns += 1;
    return Object.keys(dictionary).join(",");
  });
  dictionary.extra = true;
  delete dictionary.known;
  assert.equal(keyRuns, 3, "adding and deleting keys should invalidate iteration");

  let stoppedRuns = 0;
  const stopped = effect(() => {
    stoppedRuns += 1;
    return state.count;
  });
  stop(stopped);
  state.count += 1;
  assert.equal(stoppedRuns, 1);

  stopObserver();
  console.log("reactiveDependencyGraph: all tests passed");
}

if (require.main === module) runTests();

module.exports = { createReactiveSystem, ITERATE_KEY };
