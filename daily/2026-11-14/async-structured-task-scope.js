/**
 * Async Structured Task Scope
 * ---------------------------
 * Runs a group of related asynchronous tasks as one lifetime:
 * - the scope does not finish until every registered child settles
 * - fail-fast mode aborts siblings after the first child failure
 * - caller cancellation propagates through one shared AbortSignal
 * - body failures still wait for children to clean up
 * - task errors are reported together with AggregateError
 *
 * Tasks should observe the supplied signal and release resources in finally.
 * The body must register all children before it resolves.
 *
 * Run: node async-structured-task-scope.js
 */

'use strict';

const assert = require('node:assert/strict');

function cancellationReason(signal) {
  return signal.reason || new Error('task scope cancelled');
}

class TaskScope {
  constructor(options = {}) {
    const { failFast = true, signal: parentSignal } = options;
    if (typeof failFast !== 'boolean') throw new TypeError('failFast must be boolean');
    if (parentSignal && typeof parentSignal.addEventListener !== 'function') {
      throw new TypeError('signal must be an AbortSignal');
    }

    this.failFast = failFast;
    this.controller = new AbortController();
    this.signal = this.controller.signal;
    this.state = 'open';
    this.tasks = [];
    this.errors = [];
    this._nextId = 1;
    this._parentSignal = parentSignal || null;
    this._parentAbort = null;

    if (parentSignal) {
      this._parentAbort = () => this.cancel(cancellationReason(parentSignal), 'parent');
      if (parentSignal.aborted) this._parentAbort();
      else parentSignal.addEventListener('abort', this._parentAbort, { once: true });
    }
  }

  spawn(task, options = {}) {
    if (this.state !== 'open' && this.state !== 'running') {
      throw new Error('cannot spawn a task after the scope body has finished');
    }
    if (typeof task !== 'function') throw new TypeError('task must be a function');

    const label = options.label === undefined
      ? 'task-' + this._nextId
      : String(options.label);
    const record = {
      id: this._nextId++,
      label,
      status: 'pending',
      value: undefined,
      error: undefined,
      promise: null,
      settled: null
    };

    const promise = Promise.resolve()
      .then(() => task(this.signal))
      .then(
        (value) => {
          record.status = 'fulfilled';
          record.value = value;
          return value;
        },
        (error) => {
          record.status = 'rejected';
          record.error = error;
          this.errors.push({ label, error });
          if (this.failFast && !this.signal.aborted) this.cancel(error, 'task-failure');
          throw error;
        }
      );

    // Attach a rejection observer even if the caller intentionally ignores
    // the returned child promise. The original promise still rejects to callers.
    promise.catch(() => {});
    record.promise = promise;
    record.settled = promise.then(
      () => ({ status: 'fulfilled', record }),
      (error) => ({ status: 'rejected', error, record })
    );
    this.tasks.push(record);
    return promise;
  }

  cancel(reason = new Error('task scope cancelled'), kind = 'caller') {
    if (!this.signal.aborted) {
      this._cancelKind = kind;
      this.controller.abort(reason);
    }
  }

  async run(body) {
    if (this.state !== 'open') throw new Error('a task scope can only run once');
    if (typeof body !== 'function') throw new TypeError('body must be a function');

    this.state = 'running';
    let value;
    let bodyError;

    try {
      value = await body(this);
    } catch (error) {
      bodyError = error;
      this.cancel(error, 'body-failure');
    }

    this.state = 'closing';
    await Promise.all(this.tasks.map((task) => task.settled));

    if (this._parentSignal && this._parentAbort) {
      this._parentSignal.removeEventListener('abort', this._parentAbort);
    }
    this.state = 'closed';

    if (bodyError !== undefined) throw bodyError;
    if (this._cancelKind === 'parent' || this._cancelKind === 'caller') {
      throw cancellationReason(this.signal);
    }
    if (this.errors.length > 0) {
      throw new AggregateError(
        this.errors.map((entry) => entry.error),
        'one or more scoped tasks failed'
      );
    }
    if (this.signal.aborted) throw cancellationReason(this.signal);
    return value;
  }

  static run(body, options = {}) {
    return new TaskScope(options).run(body);
  }
}

// ------------------------------ Example tests ------------------------------

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runTests() {
  const finished = [];
  const result = await TaskScope.run(async (scope) => {
    scope.spawn(async () => {
      await delay(5);
      finished.push('first');
      return 10;
    }, { label: 'first' });
    scope.spawn(async () => {
      await delay(1);
      finished.push('second');
      return 20;
    }, { label: 'second' });
    return 'body-result';
  });
  assert.equal(result, 'body-result');
  assert.deepEqual(finished.sort(), ['first', 'second']);

  let siblingSawAbort = false;
  const failing = new TaskScope();
  await assert.rejects(
    failing.run(async (scope) => {
      scope.spawn(async (signal) => {
        await new Promise((resolve, reject) => {
          if (signal.aborted) return reject(signal.reason);
          signal.addEventListener('abort', () => {
            siblingSawAbort = true;
            reject(signal.reason);
          }, { once: true });
        });
      }, { label: 'abort-aware sibling' });

      scope.spawn(async () => {
        throw new Error('primary task failure');
      }, { label: 'failing child' });
    }),
    (error) => error instanceof AggregateError &&
      error.errors.some((item) => item.message === 'primary task failure')
  );
  assert.equal(siblingSawAbort, true);
  assert.equal(failing.state, 'closed');

  let cleanupFinished = false;
  const bodyFailure = new TaskScope();
  await assert.rejects(
    bodyFailure.run(async (scope) => {
      scope.spawn(async (signal) => {
        try {
          await new Promise((resolve, reject) => {
            if (signal.aborted) return reject(signal.reason);
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
          });
        } finally {
          cleanupFinished = true;
        }
      });
      throw new Error('body failed');
    }),
    /body failed/
  );
  assert.equal(cleanupFinished, true);

  const parent = new AbortController();
  const external = new TaskScope({ signal: parent.signal });
  const externalRun = external.run(async (scope) => {
    scope.spawn(async (signal) => {
      await new Promise((resolve, reject) => {
        if (signal.aborted) return reject(signal.reason);
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    });
    await delay(1);
    parent.abort(new Error('caller cancelled'));
  });
  await assert.rejects(externalRun, /caller cancelled/);
  assert.equal(external.state, 'closed');

  const nonFailFast = new TaskScope({ failFast: false });
  let siblingCompleted = false;
  await assert.rejects(
    nonFailFast.run(async (scope) => {
      scope.spawn(async () => { throw new Error('isolated failure'); });
      scope.spawn(async () => {
        await delay(2);
        siblingCompleted = true;
      });
    }),
    AggregateError
  );
  assert.equal(siblingCompleted, true);

  const closed = new TaskScope();
  await closed.run(async () => {});
  assert.throws(() => closed.spawn(async () => {}), /cannot spawn/);
  assert.throws(() => closed.run(async () => {}), /only run once/);

  const gate = deferred();
  assert.equal(typeof gate.resolve, 'function');
  console.log('Async TaskScope: all tests passed');
}

if (require.main === module) {
  runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { TaskScope };
