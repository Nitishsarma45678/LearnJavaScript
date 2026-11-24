'use strict';

const assert = require('node:assert/strict');

function before(fn, hook) {
  return function advisedBefore(...args) {
    hook.apply(this, args);
    return fn.apply(this, args);
  };
}

function after(fn, hook) {
  return function advisedAfter(...args) {
    const receiver = this;
    const result = fn.apply(receiver, args);
    if (result && typeof result.then === 'function') {
      return result.then(value => {
        hook.call(receiver, value, ...args);
        return value;
      });
    }
    hook.call(receiver, result, ...args);
    return result;
  };
}

function around(fn, advice) {
  return function advisedAround(...args) {
    const receiver = this;
    const proceed = (...nextArgs) => fn.apply(receiver, nextArgs.length ? nextArgs : args);
    return advice.call(receiver, proceed, ...args);
  };
}

function onError(fn, handler) {
  return function advisedError(...args) {
    try {
      const result = fn.apply(this, args);
      return result && typeof result.then === 'function'
        ? result.catch(error => handler.call(this, error, ...args))
        : result;
    } catch (error) {
      return handler.call(this, error, ...args);
    }
  };
}

function composeAdvice(target, ...middlewares) {
  return middlewares.reduceRight((next, middleware) => middleware(next), target);
}

const events = [];
const calculate = composeAdvice(
  function (a, b) { events.push('target'); return a + b; },
  next => before(next, () => events.push('before-outer')),
  next => after(next, () => events.push('after-inner')),
  next => around(next, (proceed, a, b) => {
    events.push('around-enter');
    const value = proceed(a * 2, b * 2);
    events.push('around-exit');
    return value;
  })
);
assert.equal(calculate(2, 3), 10);
assert.deepEqual(events, ['before-outer', 'around-enter', 'target', 'around-exit', 'after-inner']);

(async () => {
  const asyncFn = after(async value => value * 2, result => events.push('async:' + result));
  assert.equal(await asyncFn(7), 14);
  const recover = onError(() => { throw new Error('offline'); }, error => error.message);
  assert.equal(recover(), 'offline');
  const receiver = { factor: 3, run: before(function (n) { return this.factor * n; }, function () {
    assert.equal(this.factor, 3);
  }) };
  assert.equal(receiver.run(4), 12);
  console.log('Function-advice examples passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

module.exports = { before, after, around, onError, composeAdvice };
