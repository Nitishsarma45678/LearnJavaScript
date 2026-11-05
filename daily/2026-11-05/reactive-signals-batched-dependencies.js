"use strict";

const assert = require("node:assert/strict");

class ReactiveRuntime {
  constructor() {
    this.activeObserver = null;
    this.batchDepth = 0;
    this.executionDepth = 0;
    this.pending = new Set();
    this.flushing = false;
  }

  track(source) {
    const observer = this.activeObserver;
    if (!observer || !observer.active || observer.dependencies.has(source)) return;
    observer.dependencies.add(source);
    source.observers.add(observer);
  }

  cleanup(observer) {
    for (const dependency of observer.dependencies) {
      dependency.observers.delete(observer);
    }
    observer.dependencies.clear();
  }

  notify(source) {
    for (const observer of Array.from(source.observers)) {
      if (observer.kind === "computed") observer.invalidate();
      else observer.schedule();
    }
  }

  enqueue(effect) {
    if (!effect.active) return;
    this.pending.add(effect);
    this.flushIfReady();
  }

  flushIfReady() {
    if (this.batchDepth === 0 && this.executionDepth === 0 && !this.flushing) {
      this.flush();
    }
  }

  flush() {
    if (this.flushing || this.batchDepth > 0 || this.executionDepth > 0) return;
    this.flushing = true;
    let iterations = 0;
    let firstError = null;
    try {
      while (this.pending.size) {
        if (++iterations > 10000) {
          this.pending.clear();
          throw new Error("reactive update loop exceeded 10000 effect runs");
        }
        const next = this.pending.values().next().value;
        this.pending.delete(next);
        if (!next.active) continue;
        try {
          next.run();
        } catch (error) {
          if (!firstError) firstError = error;
        }
      }
    } finally {
      this.flushing = false;
    }
    if (firstError) throw firstError;
  }

  batch(callback) {
    if (typeof callback !== "function") throw new TypeError("batch expects a function");
    this.batchDepth++;
    try {
      return callback();
    } finally {
      this.batchDepth--;
      this.flushIfReady();
    }
  }
}

class Signal {
  constructor(runtime, value) {
    this.runtime = runtime;
    this.current = value;
    this.observers = new Set();
  }

  get value() {
    this.runtime.track(this);
    return this.current;
  }

  set value(next) {
    if (Object.is(next, this.current)) return;
    this.current = next;
    this.runtime.notify(this);
  }

  update(updater) {
    if (typeof updater !== "function") throw new TypeError("updater must be a function");
    this.value = updater(this.current);
  }
}

class Computed {
  constructor(runtime, calculate) {
    if (typeof calculate !== "function") throw new TypeError("computed expects a function");
    this.runtime = runtime;
    this.calculate = calculate;
    this.dependencies = new Set();
    this.observers = new Set();
    this.kind = "computed";
    this.active = true;
    this.dirty = true;
    this.evaluating = false;
    this.cached = undefined;
  }

  get value() {
    this.runtime.track(this);
    if (!this.dirty) return this.cached;
    if (this.evaluating) throw new Error("cyclic computed dependency detected");

    this.evaluating = true;
    this.runtime.cleanup(this);
    const previous = this.runtime.activeObserver;
    this.runtime.activeObserver = this;
    this.runtime.executionDepth++;
    try {
      this.cached = this.calculate();
      this.dirty = false;
      return this.cached;
    } finally {
      this.runtime.executionDepth--;
      this.runtime.activeObserver = previous;
      this.evaluating = false;
      this.runtime.flushIfReady();
    }
  }

  invalidate() {
    if (!this.active || this.dirty) return;
    this.dirty = true;
    this.runtime.notify(this);
  }
}

class ReactiveEffect {
  constructor(runtime, callback) {
    if (typeof callback !== "function") throw new TypeError("effect expects a function");
    this.runtime = runtime;
    this.callback = callback;
    this.dependencies = new Set();
    this.kind = "effect";
    this.active = true;
    this.running = false;
  }

  run() {
    if (!this.active) return;
    if (this.running) throw new Error("effect recursively invoked itself");
    this.running = true;
    this.runtime.cleanup(this);
    const previous = this.runtime.activeObserver;
    this.runtime.activeObserver = this;
    this.runtime.executionDepth++;
    try {
      this.callback();
    } finally {
      this.runtime.executionDepth--;
      this.runtime.activeObserver = previous;
      this.running = false;
      this.runtime.flushIfReady();
    }
  }

  schedule() {
    this.runtime.enqueue(this);
  }

  dispose() {
    if (!this.active) return;
    this.active = false;
    this.runtime.pending.delete(this);
    this.runtime.cleanup(this);
  }
}

function createReactiveSystem() {
  const runtime = new ReactiveRuntime();
  return {
    signal: value => new Signal(runtime, value),
    computed: calculate => new Computed(runtime, calculate),
    effect: callback => {
      const observer = new ReactiveEffect(runtime, callback);
      observer.run();
      return () => observer.dispose();
    },
    batch: callback => runtime.batch(callback)
  };
}

function runTests() {
  const { signal, computed, effect, batch } = createReactiveSystem();
  const usePrimary = signal(true);
  const primary = signal(2);
  const secondary = signal(10);
  const doubled = computed(() => (usePrimary.value ? primary.value : secondary.value) * 2);
  const seen = [];
  const stop = effect(() => seen.push(doubled.value));

  assert.deepEqual(seen, [4]);
  primary.value = 3;
  assert.deepEqual(seen, [4, 6]);
  secondary.value = 11;
  assert.deepEqual(seen, [4, 6]); // inactive branch is no longer a dependency
  usePrimary.value = false;
  assert.deepEqual(seen, [4, 6, 22]);

  batch(() => {
    secondary.value = 12;
    secondary.value = 13;
    primary.value = 99;
  });
  assert.deepEqual(seen, [4, 6, 22, 26]); // one effect run after the batch
  assert.equal(doubled.value, 26);

  stop();
  secondary.value = 14;
  assert.deepEqual(seen, [4, 6, 22, 26]);

  const counter = signal(0);
  const observed = [];
  effect(() => observed.push(counter.value));
  batch(() => {
    counter.value++;
    batch(() => { counter.value++; });
    counter.value++;
  });
  assert.deepEqual(observed, [0, 3]);

  assert.throws(() => batch(null), TypeError);
  console.log("Reactive signals tests passed.");
}

if (require.main === module) runTests();

module.exports = { createReactiveSystem };
