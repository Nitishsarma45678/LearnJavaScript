'use strict';

/*
 * Exercise: Build a small fine-grained reactive runtime.
 *
 * Signals track reads, computed values are lazy and invalidate downstream
 * consumers, effects re-run when dependencies change, and batch() coalesces
 * synchronous writes. Conditional dependencies are detached on every run.
 */

const assert = require('node:assert/strict');

function createReactiveRuntime(options = {}) {
  const maxFlushRuns = options.maxFlushRuns === undefined ? 1000 : options.maxFlushRuns;
  if (!Number.isInteger(maxFlushRuns) || maxFlushRuns < 1) {
    throw new RangeError('maxFlushRuns must be a positive integer');
  }

  let activeObserver = null;
  let batchDepth = 0;
  let flushing = false;
  const pending = new Set();

  function detachDependencies(observer) {
    for (const dependency of observer.dependencies) {
      dependency.subscribers.delete(observer);
    }
    observer.dependencies.clear();
  }

  function runCleanup(observer) {
    if (observer.cleanup) {
      const cleanup = observer.cleanup;
      observer.cleanup = null;
      cleanup();
    }
  }

  function track(dependency) {
    if (!activeObserver || !activeObserver.active) return;
    if (activeObserver.dependencies.has(dependency)) return;
    dependency.subscribers.add(activeObserver);
    activeObserver.dependencies.add(dependency);
  }

  function schedule(observer) {
    if (!observer.active) return;
    if (observer.scheduler) {
      observer.scheduler();
    } else {
      pending.add(observer);
    }
    flush();
  }

  function notify(dependency) {
    for (const observer of Array.from(dependency.subscribers)) {
      schedule(observer);
    }
  }

  function flush() {
    if (flushing || batchDepth > 0) return;
    flushing = true;
    let runs = 0;
    try {
      while (pending.size > 0) {
        if (++runs > maxFlushRuns) {
          pending.clear();
          throw new Error('reactive update loop exceeded maxFlushRuns');
        }
        const current = Array.from(pending);
        pending.clear();
        for (const observer of current) {
          if (observer.active) runEffect(observer);
        }
      }
    } finally {
      flushing = false;
    }
  }

  function runEffect(observer) {
    if (!observer.active || observer.running) return;
    observer.running = true;
    runCleanup(observer);
    detachDependencies(observer);

    const previous = activeObserver;
    activeObserver = observer;
    try {
      const returned = observer.fn(registerCleanup => {
        if (typeof registerCleanup !== 'function') {
          throw new TypeError('cleanup must be a function');
        }
        observer.cleanup = registerCleanup;
      });
      if (typeof returned === 'function') observer.cleanup = returned;
    } finally {
      activeObserver = previous;
      observer.running = false;
    }
  }

  function signal(initialValue, equals = Object.is) {
    if (typeof equals !== 'function') throw new TypeError('equals must be a function');
    const dependency = { subscribers: new Set() };
    let current = initialValue;

    return {
      get value() {
        track(dependency);
        return current;
      },
      set value(next) {
        this.set(next);
      },
      get() {
        track(dependency);
        return current;
      },
      peek() {
        return current;
      },
      set(next) {
        if (equals(current, next)) return false;
        current = next;
        notify(dependency);
        return true;
      },
      update(updater) {
        if (typeof updater !== 'function') throw new TypeError('updater must be a function');
        return this.set(updater(current));
      },
      subscribe(listener, immediate = false) {
        if (typeof listener !== 'function') throw new TypeError('listener must be a function');
        const observer = {
          fn: () => {},
          dependencies: new Set([dependency]),
          active: true,
          running: false,
          cleanup: null,
          scheduler: () => listener(current)
        };
        dependency.subscribers.add(observer);
        if (immediate) listener(current);
        return () => {
          observer.active = false;
          detachDependencies(observer);
          runCleanup(observer);
        };
      }
    };
  }

  function computed(compute) {
    if (typeof compute !== 'function') throw new TypeError('computed expects a function');
    const dependency = { subscribers: new Set() };
    let dirty = true;
    let cached;
    let disposed = false;

    const observer = {
      fn: compute,
      dependencies: new Set(),
      active: true,
      running: false,
      cleanup: null,
      scheduler: () => {
        if (!dirty) {
          dirty = true;
          notify(dependency);
        }
      }
    };

    function evaluate() {
      if (disposed) throw new Error('computed value has been disposed');
      if (!dirty) return cached;
      if (observer.running) throw new Error('cyclic computed dependency detected');

      observer.running = true;
      runCleanup(observer);
      detachDependencies(observer);
      const previous = activeObserver;
      activeObserver = observer;
      try {
        cached = compute();
        dirty = false;
        return cached;
      } finally {
        activeObserver = previous;
        observer.running = false;
      }
    }

    return {
      get value() {
        track(dependency);
        return evaluate();
      },
      get() {
        track(dependency);
        return evaluate();
      },
      peek() {
        return evaluate();
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        observer.active = false;
        detachDependencies(observer);
        runCleanup(observer);
        dependency.subscribers.clear();
      }
    };
  }

  function effect(fn) {
    if (typeof fn !== 'function') throw new TypeError('effect expects a function');
    const observer = {
      fn,
      dependencies: new Set(),
      active: true,
      running: false,
      cleanup: null,
      scheduler: null
    };
    runEffect(observer);
    const stop = () => {
      if (!observer.active) return;
      observer.active = false;
      pending.delete(observer);
      detachDependencies(observer);
      runCleanup(observer);
    };
    stop.run = () => {
      if (observer.active) runEffect(observer);
    };
    return stop;
  }

  function batch(callback) {
    if (typeof callback !== 'function') throw new TypeError('batch expects a function');
    batchDepth++;
    try {
      return callback();
    } finally {
      batchDepth--;
      flush();
    }
  }

  function untracked(callback) {
    if (typeof callback !== 'function') throw new TypeError('untracked expects a function');
    const previous = activeObserver;
    activeObserver = null;
    try {
      return callback();
    } finally {
      activeObserver = previous;
    }
  }

  return { signal, computed, effect, batch, untracked };
}

function runTests() {
  const runtime = createReactiveRuntime();
  const count = runtime.signal(1);
  let calculations = 0;
  const doubled = runtime.computed(() => {
    calculations++;
    return count.value * 2;
  });
  const seen = [];
  const stop = runtime.effect(() => seen.push(doubled.value));

  assert.deepEqual(seen, [2]);
  assert.equal(calculations, 1);
  assert.equal(doubled.value, 2);
  assert.equal(calculations, 1, 'computed values should be cached');
  count.value = 2;
  assert.deepEqual(seen, [2, 4]);
  assert.equal(calculations, 2);

  runtime.batch(() => {
    count.set(3);
    count.update(value => value + 1);
    count.set(4);
  });
  assert.deepEqual(seen, [2, 4, 8], 'batch should trigger one effect run');
  assert.equal(calculations, 3);
  stop();
  count.set(5);
  assert.deepEqual(seen, [2, 4, 8]);

  const chooseLeft = runtime.signal(true);
  const left = runtime.signal('L');
  const right = runtime.signal('R');
  const branchValues = [];
  const stopBranch = runtime.effect(() => {
    branchValues.push(chooseLeft.value ? left.value : right.value);
  });
  left.set('L2');
  chooseLeft.set(false);
  left.set('ignored');
  right.set('R2');
  assert.deepEqual(branchValues, ['L', 'L2', 'L2', 'R2']);
  stopBranch();

  const source = runtime.signal(0);
  const cleanupLog = [];
  const stopCleanup = runtime.effect(onCleanup => {
    const snapshot = source.value;
    onCleanup(() => cleanupLog.push(snapshot));
  });
  source.set(1);
  source.set(2);
  stopCleanup();
  assert.deepEqual(cleanupLog, [0, 1, 2]);

  const a = runtime.signal(10);
  const b = runtime.signal(20);
  let untrackedRuns = 0;
  const stopUntracked = runtime.effect(() => {
    untrackedRuns++;
    a.value;
    runtime.untracked(() => b.value);
  });
  b.set(21);
  assert.equal(untrackedRuns, 1);
  a.set(11);
  assert.equal(untrackedRuns, 2);
  stopUntracked();

  const parity = runtime.computed(() => count.value % 2);
  assert.equal(parity.peek(), 1);
  count.set(8);
  assert.equal(parity.value, 0);
  parity.dispose();
  assert.throws(() => parity.value, /disposed/);

  const customEqual = runtime.signal({ version: 1 }, (x, y) => x.version === y.version);
  let customRuns = 0;
  const stopCustom = runtime.effect(() => {
    customRuns++;
    customEqual.value;
  });
  customEqual.set({ version: 1 });
  assert.equal(customRuns, 1);
  customEqual.set({ version: 2 });
  assert.equal(customRuns, 2);
  stopCustom();

  const limited = createReactiveRuntime({ maxFlushRuns: 5 });
  const trigger = limited.signal(false);
  const loop = limited.signal(0);
  const stopLoop = limited.effect(() => {
    if (trigger.value) {
      loop.value;
      loop.update(value => value + 1);
    }
  });
  assert.throws(() => trigger.set(true), /update loop/);
  stopLoop();

  console.log('ReactiveSignals: all tests passed');
}

if (require.main === module) runTests();

module.exports = { createReactiveRuntime };
