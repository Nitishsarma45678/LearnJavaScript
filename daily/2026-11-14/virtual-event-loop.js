/**
 * Deterministic virtual event loop
 * -------------------------------
 * Exercise: model the key scheduling rules of a JavaScript event loop:
 * FIFO microtasks, timer tasks ordered by due time and insertion id,
 * microtask checkpoints after each task, cancellation, and virtual time.
 *
 * This is an educational simulator, not a replacement for host timers or
 * native Promise scheduling. queueMicrotask callbacks are explicitly modeled.
 *
 * Run: node virtual-event-loop.js
 */

'use strict';

const assert = require('node:assert/strict');

class MinHeap {
  constructor(compare) {
    this.items = [];
    this.compare = compare;
  }

  get size() {
    return this.items.length;
  }

  peek() {
    return this.items[0];
  }

  push(value) {
    const items = this.items;
    items.push(value);
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.compare(items[parent], value) <= 0) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = value;
  }

  pop() {
    const items = this.items;
    if (items.length === 0) return undefined;
    const root = items[0];
    const last = items.pop();
    if (items.length === 0) return root;

    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= items.length) break;
      let child = left;
      if (right < items.length &&
          this.compare(items[right], items[left]) < 0) {
        child = right;
      }
      if (this.compare(last, items[child]) <= 0) break;
      items[index] = items[child];
      index = child;
    }
    items[index] = last;
    return root;
  }
}

class VirtualEventLoop {
  constructor({ onError = null, maxMicrotasksPerCheckpoint = 100000 } = {}) {
    if (onError !== null && typeof onError !== 'function') {
      throw new TypeError('onError must be a function or null');
    }
    if (!Number.isInteger(maxMicrotasksPerCheckpoint) ||
        maxMicrotasksPerCheckpoint < 1) {
      throw new RangeError('maxMicrotasksPerCheckpoint must be a positive integer');
    }

    this.now = 0;
    this.nextId = 1;
    this.microtasks = [];
    this.timers = new MinHeap((a, b) => a.due - b.due || a.id - b.id);
    this.timerById = new Map();
    this.onError = onError;
    this.maxMicrotasksPerCheckpoint = maxMicrotasksPerCheckpoint;
    this.errors = [];
    this.running = false;
    this.lastMicrotasksRun = 0;
  }

  queueMicrotask(callback) {
    if (typeof callback !== 'function') throw new TypeError('callback must be a function');
    this.microtasks.push(callback);
  }

  setTimeout(callback, delay = 0) {
    if (typeof callback !== 'function') throw new TypeError('callback must be a function');
    if (typeof delay !== 'number' || !Number.isFinite(delay)) {
      throw new RangeError('delay must be a finite number');
    }
    const normalizedDelay = Math.max(0, delay);
    const due = this.now + normalizedDelay;
    if (!Number.isFinite(due)) throw new RangeError('timer due time overflow');

    const timer = { id: this.nextId++, due, callback, cancelled: false };
    this.timerById.set(timer.id, timer);
    this.timers.push(timer);
    return timer.id;
  }

  clearTimeout(id) {
    const timer = this.timerById.get(id);
    if (!timer) return false;
    timer.cancelled = true;
    this.timerById.delete(id);
    return true;
  }

  get pendingTimers() {
    return this.timerById.size;
  }

  get pendingMicrotasks() {
    return this.microtasks.length;
  }

  _reportError(error, phase) {
    const record = { error, phase, time: this.now };
    this.errors.push(record);
    if (this.onError) {
      try {
        this.onError(record);
      } catch (handlerError) {
        this.errors.push({ error: handlerError, phase: 'error-handler', time: this.now });
      }
    }
  }

  _invoke(callback, phase) {
    try {
      callback();
    } catch (error) {
      this._reportError(error, phase);
    }
  }

  _drainMicrotasks() {
    let executed = 0;
    while (this.microtasks.length > 0) {
      if (++executed > this.maxMicrotasksPerCheckpoint) {
        throw new Error('microtask checkpoint limit exceeded (possible starvation)');
      }
      const callback = this.microtasks.shift();
      this._invoke(callback, 'microtask');
    }
    return executed;
  }

  _peekTimer() {
    while (this.timers.size > 0 && this.timers.peek().cancelled) {
      this.timers.pop();
    }
    return this.timers.peek();
  }

  _runOneTimer() {
    const timer = this._peekTimer();
    if (!timer) return false;
    this.timers.pop();
    this.timerById.delete(timer.id);
    this.now = Math.max(this.now, timer.due);
    this._invoke(timer.callback, 'timer');
    this.lastMicrotasksRun = this._drainMicrotasks();
    return true;
  }

  runNext() {
    if (this.running) throw new Error('event-loop execution is not reentrant');
    this.running = true;
    try {
      const microtasksRun = this._drainMicrotasks();
      const timerRan = this._runOneTimer();
      return timerRan || microtasksRun > 0;
    } finally {
      this.running = false;
    }
  }

  runUntilIdle({ maxTasks = 10000 } = {}) {
    if (!Number.isInteger(maxTasks) || maxTasks < 0) {
      throw new RangeError('maxTasks must be a non-negative integer');
    }
    if (this.running) throw new Error('event-loop execution is not reentrant');

    this.running = true;
    let tasksRun = 0;
    let microtasksRun = 0;
    try {
      while (this.microtasks.length > 0 || this._peekTimer()) {
        microtasksRun += this._drainMicrotasks();
        if (!this._peekTimer()) break;
        if (tasksRun >= maxTasks) {
          throw new Error('task limit exceeded (possible endlessly rescheduled timers)');
        }
        this._runOneTimer();
        microtasksRun += this.lastMicrotasksRun;
        tasksRun++;
      }
      return { tasksRun, microtasksRun };
    } finally {
      this.running = false;
    }
  }

  advanceBy(milliseconds, { maxTasks = 10000 } = {}) {
    if (typeof milliseconds !== 'number' || !Number.isFinite(milliseconds) ||
        milliseconds < 0) {
      throw new RangeError('advance amount must be a finite non-negative number');
    }
    if (!Number.isInteger(maxTasks) || maxTasks < 0) {
      throw new RangeError('maxTasks must be a non-negative integer');
    }
    if (this.running) throw new Error('event-loop execution is not reentrant');

    const target = this.now + milliseconds;
    if (!Number.isFinite(target)) throw new RangeError('target time overflow');

    this.running = true;
    let tasksRun = 0;
    let microtasksRun = 0;
    try {
      microtasksRun += this._drainMicrotasks();
      while (true) {
        const next = this._peekTimer();
        if (!next || next.due > target) break;
        if (tasksRun >= maxTasks) {
          throw new Error('task limit exceeded while advancing virtual time');
        }
        this._runOneTimer();
        tasksRun++;
        microtasksRun += this.lastMicrotasksRun;
      }
      this.now = target;
      microtasksRun += this._drainMicrotasks();
      return { tasksRun, microtasksRun, now: this.now };
    } finally {
      this.running = false;
    }
  }
}

function runTests() {
  const loop = new VirtualEventLoop();
  const order = [];

  loop.setTimeout(() => {
    order.push('timer-1');
    loop.queueMicrotask(() => order.push('micro-from-timer'));
    loop.setTimeout(() => order.push('nested-timer'), 0);
  }, 0);
  loop.queueMicrotask(() => {
    order.push('micro-1');
    loop.queueMicrotask(() => order.push('micro-2'));
  });
  loop.setTimeout(() => order.push('timer-2'), 0);

  const summary = loop.runUntilIdle();
  assert.deepEqual(order, [
    'micro-1',
    'micro-2',
    'timer-1',
    'micro-from-timer',
    'timer-2',
    'nested-timer'
  ]);
  assert.equal(summary.tasksRun, 3);
  assert.equal(summary.microtasksRun, 3);
  assert.equal(loop.now, 0);

  const clock = new VirtualEventLoop();
  const times = [];
  clock.setTimeout(() => times.push(['late', clock.now]), 10);
  clock.setTimeout(() => times.push(['early', clock.now]), 5);
  const cancelled = clock.setTimeout(() => times.push(['cancelled', clock.now]), 7);
  assert.equal(clock.clearTimeout(cancelled), true);
  assert.equal(clock.clearTimeout(cancelled), false);

  clock.advanceBy(5);
  assert.deepEqual(times, [['early', 5]]);
  clock.advanceBy(4);
  assert.equal(times.length, 1);
  clock.advanceBy(1);
  assert.deepEqual(times, [['early', 5], ['late', 10]]);
  assert.equal(clock.now, 10);

  const failures = [];
  const errors = new VirtualEventLoop({ onError: record => failures.push(record.phase) });
  errors.queueMicrotask(() => { throw new Error('microtask failure'); });
  errors.setTimeout(() => { throw new Error('timer failure'); }, 0);
  errors.runUntilIdle();
  assert.deepEqual(failures, ['microtask', 'timer']);
  assert.equal(errors.errors.length, 2);

  const starvation = new VirtualEventLoop({ maxMicrotasksPerCheckpoint: 5 });
  const again = () => starvation.queueMicrotask(again);
  starvation.queueMicrotask(again);
  assert.throws(() => starvation.runUntilIdle(), /starvation/);

  assert.throws(() => clock.advanceBy(-1), /non-negative/);
  assert.throws(() => clock.setTimeout('not a callback', 0), /callback/);
  console.log('Virtual Event Loop: all tests passed');
}

if (require.main === module) runTests();

module.exports = { VirtualEventLoop };
