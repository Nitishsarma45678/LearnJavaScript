'use strict';

/**
 * A small Promises/A+-style implementation for learning purposes.
 * Reactions run in microtasks; thenables are assimilated with once guards.
 * It intentionally omits host-level unhandled-rejection reporting.
 */
function scheduleMicrotask(callback) {
  if (typeof queueMicrotask === 'function') queueMicrotask(callback);
  else Promise.resolve().then(callback);
}

function resolveValue(promise, value, resolve, reject, seen = new WeakSet()) {
  if (value === promise) {
    reject(new TypeError('a promise cannot resolve to itself'));
    return;
  }
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    promise._fulfill(value);
    return;
  }

  if (seen.has(value)) {
    reject(new TypeError('thenable resolution cycle detected'));
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
    promise._fulfill(value);
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
        resolveValue(promise, next, resolve, reject, seen);
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

class TinyPromise {
  constructor(executor) {
    if (typeof executor !== 'function') throw new TypeError('executor must be a function');
    this._state = 'PENDING';
    this._value = undefined;
    this._reactions = [];

    let settled = false;
    const resolve = value => {
      if (settled) return;
      settled = true;
      resolveValue(this, value, resolve, reason => this._reject(reason));
    };
    const reject = reason => {
      if (settled) return;
      settled = true;
      this._reject(reason);
    };

    try {
      executor(resolve, reject);
    } catch (error) {
      reject(error);
    }
  }

  _fulfill(value) {
    if (this._state !== 'PENDING') return;
    this._state = 'FULFILLED';
    this._value = value;
    this._flush();
  }

  _reject(reason) {
    if (this._state !== 'PENDING') return;
    this._state = 'REJECTED';
    this._value = reason;
    this._flush();
  }

  _flush() {
    if (this._state === 'PENDING' || this._reactions.length === 0) return;
    const reactions = this._reactions.splice(0);
    scheduleMicrotask(() => {
      for (const reaction of reactions) reaction();
    });
  }

  then(onFulfilled, onRejected) {
    return new TinyPromise((resolve, reject) => {
      const run = () => {
        const fulfilled = this._state === 'FULFILLED';
        const handler = fulfilled ? onFulfilled : onRejected;
        if (typeof handler !== 'function') {
          (fulfilled ? resolve : reject)(this._value);
          return;
        }
        try {
          resolve(handler(this._value));
        } catch (error) {
          reject(error);
        }
      };

      if (this._state === 'PENDING') this._reactions.push(run);
      else scheduleMicrotask(run);
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
      let items;
      try { items = Array.from(iterable); } catch (error) { reject(error); return; }
      if (items.length === 0) { resolve([]); return; }
      const results = new Array(items.length);
      let remaining = items.length;
      items.forEach((item, index) => {
        TinyPromise.resolve(item).then(value => {
          results[index] = value;
          if (--remaining === 0) resolve(results);
        }, reject);
      });
    });
  }

  static race(iterable) {
    return new TinyPromise((resolve, reject) => {
      let items;
      try { items = Array.from(iterable); } catch (error) { reject(error); return; }
      for (const item of items) TinyPromise.resolve(item).then(resolve, reject);
    });
  }

  static allSettled(iterable) {
    let items;
    try { items = Array.from(iterable); } catch (error) { return TinyPromise.reject(error); }
    return TinyPromise.all(items.map(item => TinyPromise.resolve(item).then(
      value => ({ status: 'fulfilled', value }),
      reason => ({ status: 'rejected', reason })
    )));
  }

  static any(iterable) {
    return new TinyPromise((resolve, reject) => {
      let items;
      try { items = Array.from(iterable); } catch (error) { reject(error); return; }
      if (items.length === 0) { reject(new AggregateError([], 'All promises were rejected')); return; }
      const errors = new Array(items.length);
      let rejectedCount = 0;
      items.forEach((item, index) => TinyPromise.resolve(item).then(resolve, reason => {
        errors[index] = reason;
        if (++rejectedCount === items.length) {
          reject(new AggregateError(errors, 'All promises were rejected'));
        }
      }));
    });
  }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new TinyPromise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function runTests() {
  const assert = require('node:assert/strict');
  const order = [];
  const chained = TinyPromise.resolve(4)
    .then(value => { order.push('first'); return value * 2; })
    .then(value => { order.push('second'); return value + 1; });
  order.push('sync');
  assert.equal(await chained, 9);
  assert.deepEqual(order, ['sync', 'first', 'second']);

  const thenable = { then(resolve, reject) { resolve(7); reject(new Error('ignored')); resolve(8); } };
  assert.equal(await TinyPromise.resolve(thenable), 7);
  assert.equal(await TinyPromise.resolve({ get then() { throw new Error('getter'); } }).catch(e => e.message), 'getter');
  assert.equal(await TinyPromise.resolve(2).finally(() => TinyPromise.resolve('cleanup')), 2);
  await assert.rejects(TinyPromise.reject('failure').finally(() => 1), reason => reason === 'failure');

  assert.deepEqual(await TinyPromise.all([1, TinyPromise.resolve(2), Promise.resolve(3)]), [1, 2, 3]);
  assert.deepEqual(await TinyPromise.all([]), []);
  assert.deepEqual(await TinyPromise.allSettled([TinyPromise.resolve('ok'), TinyPromise.reject('no')]), [
    { status: 'fulfilled', value: 'ok' }, { status: 'rejected', reason: 'no' }
  ]);
  assert.equal(await TinyPromise.any([TinyPromise.reject('x'), TinyPromise.resolve('winner')]), 'winner');
  await assert.rejects(TinyPromise.any([TinyPromise.reject('a'), TinyPromise.reject('b')]), AggregateError);

  const gate = deferred();
  const child = gate.promise.then(value => value + 1);
  gate.resolve(10);
  assert.equal(await child, 11);

  let resolveSelf;
  const self = new TinyPromise(resolve => { resolveSelf = resolve; });
  resolveSelf(self);
  await assert.rejects(self, TypeError);

  const a = {};
  const b = {};
  a.then = resolve => resolve(b);
  b.then = resolve => resolve(a);
  await assert.rejects(TinyPromise.resolve(a), TypeError);

  console.log('TinyPromise tests passed');
}

if (require.main === module) runTests().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
module.exports = { TinyPromise, deferred };
