'use strict';

/**
 * Exercise: implement a small Promise/A+-style promise from first principles.
 *
 * Requirements:
 * - One-way pending -> fulfilled/rejected state transitions.
 * - Asynchronous reaction dispatch and thenable assimilation.
 * - Chaining, catch, finally, and the standard static combinators.
 * - Protect against self-resolution, throwing `then` getters, and misbehaving thenables.
 *
 * Run: node 12-promise-a-plus.js
 */

const assert = require('node:assert/strict');

const isObjectOrFunction = value => value !== null &&
  (typeof value === 'object' || typeof value === 'function');
const enqueue = typeof queueMicrotask === 'function'
  ? queueMicrotask
  : callback => Promise.resolve().then(callback);

class TinyPromise {
  constructor(executor) {
    if (typeof executor !== 'function') throw new TypeError('executor must be a function');
    this._state = 'pending';
    this._value = undefined;
    this._reactions = [];

    const fulfill = value => this._settle('fulfilled', value);
    const reject = reason => this._settle('rejected', reason);
    const resolve = value => this._resolve(value, fulfill, reject);

    let called = false;
    try {
      executor(
        value => { if (!called) { called = true; resolve(value); } },
        reason => { if (!called) { called = true; reject(reason); } }
      );
    } catch (error) {
      if (!called) {
        called = true;
        reject(error);
      }
    }
  }

  _settle(state, value) {
    if (this._state !== 'pending') return;
    this._state = state;
    this._value = value;
    if (this._reactions.length) enqueue(() => this._flush());
  }

  _resolve(value, fulfill, reject, seen = new Set()) {
    if (value === this) {
      reject(new TypeError('A promise cannot resolve to itself'));
      return;
    }
    if (!isObjectOrFunction(value)) {
      fulfill(value);
      return;
    }

    let then;
    try {
      then = value.then;
    } catch (error) {
      reject(error);
      return;
    }
    if (typeof then !== 'function') {
      fulfill(value);
      return;
    }
    if (seen.has(value)) {
      reject(new TypeError('Thenable resolution cycle detected'));
      return;
    }
    seen.add(value);

    let called = false;
    try {
      then.call(
        value,
        next => {
          if (called) return;
          called = true;
          this._resolve(next, fulfill, reject, seen);
        },
        reason => {
          if (called) return;
          called = true;
          reject(reason);
        }
      );
    } catch (error) {
      if (!called) {
        called = true;
        reject(error);
      }
    }
  }

  _runReaction(reaction) {
    const handler = this._state === 'fulfilled'
      ? reaction.onFulfilled
      : reaction.onRejected;
    if (typeof handler !== 'function') {
      (this._state === 'fulfilled' ? reaction.resolve : reaction.reject)(this._value);
      return;
    }
    try {
      reaction.resolve(handler(this._value));
    } catch (error) {
      reaction.reject(error);
    }
  }

  _flush() {
    const pending = this._reactions.splice(0);
    for (const reaction of pending) this._runReaction(reaction);
  }

  then(onFulfilled, onRejected) {
    return new TinyPromise((resolve, reject) => {
      const reaction = { onFulfilled, onRejected, resolve, reject };
      if (this._state === 'pending') this._reactions.push(reaction);
      else enqueue(() => this._runReaction(reaction));
    });
  }

  catch(onRejected) {
    return this.then(undefined, onRejected);
  }

  finally(onFinally) {
    if (typeof onFinally !== 'function') return this.then(value => value, reason => { throw reason; });
    return this.then(
      value => TinyPromise.resolve(onFinally()).then(() => value),
      reason => TinyPromise.resolve(onFinally()).then(() => { throw reason; })
    );
  }

  static resolve(value) {
    if (value instanceof TinyPromise) return value;
    return new TinyPromise(resolve => resolve(value));
  }

  static reject(reason) {
    return new TinyPromise((_, reject) => reject(reason));
  }

  static all(iterable) {
    return new TinyPromise((resolve, reject) => {
      let values;
      try { values = Array.from(iterable); } catch (error) { reject(error); return; }
      if (values.length === 0) { resolve([]); return; }
      const results = new Array(values.length);
      let remaining = values.length;
      values.forEach((value, index) => {
        TinyPromise.resolve(value).then(result => {
          results[index] = result;
          remaining -= 1;
          if (remaining === 0) resolve(results);
        }, reject);
      });
    });
  }

  static race(iterable) {
    return new TinyPromise((resolve, reject) => {
      let values;
      try { values = Array.from(iterable); } catch (error) { reject(error); return; }
      for (const value of values) TinyPromise.resolve(value).then(resolve, reject);
    });
  }

  static allSettled(iterable) {
    return new TinyPromise((resolve, reject) => {
      let values;
      try { values = Array.from(iterable); } catch (error) { reject(error); return; }
      if (values.length === 0) { resolve([]); return; }
      const results = new Array(values.length);
      let remaining = values.length;
      values.forEach((value, index) => {
        TinyPromise.resolve(value).then(
          result => { results[index] = { status: 'fulfilled', value: result }; finish(); },
          reason => { results[index] = { status: 'rejected', reason }; finish(); }
        );
      });
      function finish() {
        remaining -= 1;
        if (remaining === 0) resolve(results);
      }
    });
  }

  static any(iterable) {
    return new TinyPromise((resolve, reject) => {
      let values;
      try { values = Array.from(iterable); } catch (error) { reject(error); return; }
      if (values.length === 0) {
        reject(new AggregateError([], 'All promises were rejected'));
        return;
      }
      const errors = new Array(values.length);
      let remaining = values.length;
      values.forEach((value, index) => {
        TinyPromise.resolve(value).then(resolve, reason => {
          errors[index] = reason;
          remaining -= 1;
          if (remaining === 0) reject(new AggregateError(errors, 'All promises were rejected'));
        });
      });
    });
  }
}

async function runTests() {
  const order = [];
  const fulfilled = TinyPromise.resolve(4).then(value => {
    order.push('reaction');
    return value * 2;
  });
  order.push('sync');
  assert.deepEqual(order, ['sync'], 'reactions must be asynchronous');
  assert.equal(await fulfilled, 8);
  assert.deepEqual(order, ['sync', 'reaction']);

  const thenable = {
    then(resolve, reject) {
      resolve({ then: next => next(21) });
      reject(new Error('must be ignored'));
      resolve(99);
    }
  };
  assert.equal(await TinyPromise.resolve(thenable), 21);
  const selfThenable = { then(resolve) { resolve(selfThenable); } };
  await assert.rejects(TinyPromise.resolve(selfThenable), /cycle/);

  const getterError = new Error('then getter failed');
  const hostile = Object.defineProperty({}, 'then', { get() { throw getterError; } });
  await assert.rejects(TinyPromise.resolve(hostile), error => error === getterError);

  const chainError = new Error('chain failed');
  await assert.rejects(
    TinyPromise.resolve('start').then(() => { throw chainError; }).catch(error => { throw error; }),
    error => error === chainError
  );
  assert.equal(await TinyPromise.reject('bad').catch(reason => `handled:${reason}`), 'handled:bad');

  let finalized = 0;
  assert.equal(await TinyPromise.resolve('kept').finally(() => { finalized += 1; }), 'kept');
  assert.equal(finalized, 1);
  await assert.rejects(TinyPromise.reject('original').finally(() => TinyPromise.resolve('cleanup')), /original/);

  assert.deepEqual(await TinyPromise.all([1, TinyPromise.resolve(2), 3]), [1, 2, 3]);
  assert.deepEqual(await TinyPromise.all([]), []);
  await assert.rejects(TinyPromise.all([1, TinyPromise.reject('stop'), 3]), /stop/);
  assert.equal(await TinyPromise.race([TinyPromise.resolve('first'), new TinyPromise(() => {})]), 'first');
  assert.deepEqual(await TinyPromise.allSettled([TinyPromise.resolve(7), TinyPromise.reject('x')]), [
    { status: 'fulfilled', value: 7 },
    { status: 'rejected', reason: 'x' }
  ]);
  assert.equal(await TinyPromise.any([TinyPromise.reject('a'), TinyPromise.resolve('winner')]), 'winner');
  await assert.rejects(TinyPromise.any([TinyPromise.reject('a'), TinyPromise.reject('b')]), error => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, ['a', 'b']);
    return true;
  });

  let resolveOuter;
  const outer = new TinyPromise(resolve => { resolveOuter = resolve; });
  const chained = outer.then(value => value + 1);
  resolveOuter(40);
  assert.equal(await chained, 41);

  let selfResolve;
  const self = new TinyPromise(resolve => { selfResolve = resolve; });
  selfResolve(self);
  await assert.rejects(self, TypeError);

  const doubleExecutor = new TinyPromise((resolve, reject) => {
    resolve('first');
    reject('second');
    throw new Error('third');
  });
  assert.equal(await doubleExecutor, 'first');

  console.log('TinyPromise tests passed');
}

if (require.main === module) runTests().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
module.exports = { TinyPromise };
