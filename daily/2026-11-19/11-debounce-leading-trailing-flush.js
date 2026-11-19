'use strict';

/**
 * Exercise: Implement debounce with leading/trailing execution, cancel(), and
 * flush(). The wrapped function's this value and latest arguments are retained.
 *
 * A leading call runs immediately. If more calls arrive during the wait window,
 * the latest one runs at the end when trailing is enabled.
 */

function debounce(fn, wait, options = {}) {
  if (typeof fn !== 'function') throw new TypeError('fn must be a function');
  if (!Number.isFinite(wait) || wait < 0) throw new RangeError('wait must be non-negative');
  const { leading = false, trailing = true } = options;

  let timer = null;
  let lastArgs;
  let lastThis;
  let result;

  function invoke() {
    const args = lastArgs;
    const receiver = lastThis;
    lastArgs = undefined;
    lastThis = undefined;
    result = fn.apply(receiver, args);
    return result;
  }

  function wrapped(...args) {
    const isFirstCallInWindow = timer === null;
    if (timer !== null) clearTimeout(timer);

    lastArgs = args;
    lastThis = this;

    if (isFirstCallInWindow && leading) {
      result = fn.apply(this, args);
      lastArgs = undefined;
      lastThis = undefined;
    }

    timer = setTimeout(() => {
      timer = null;
      if (trailing && lastArgs !== undefined) invoke();
      else {
        lastArgs = undefined;
        lastThis = undefined;
      }
    }, wait);

    return result;
  }

  wrapped.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    lastArgs = undefined;
    lastThis = undefined;
  };

  wrapped.flush = () => {
    if (timer === null) return result;
    clearTimeout(timer);
    timer = null;
    if (trailing && lastArgs !== undefined) return invoke();
    lastArgs = undefined;
    lastThis = undefined;
    return result;
  };

  wrapped.pending = () => timer !== null;
  return wrapped;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runTests() {
  const assert = require('node:assert/strict');
  const calls = [];
  const trailing = debounce((value) => {
    calls.push(value);
    return value * 2;
  }, 20);

  trailing(1);
  trailing(2);
  assert.equal(trailing.pending(), true);
  assert.equal(trailing.flush(), 4);
  assert.equal(trailing.pending(), false);
  assert.deepEqual(calls, [2]);

  trailing(3);
  trailing.cancel();
  await delay(30);
  assert.deepEqual(calls, [2], 'cancel should suppress pending work');

  const leadingCalls = [];
  const leading = debounce((value) => {
    leadingCalls.push(value);
    return value;
  }, 15, { leading: true, trailing: true });
  assert.equal(leading('first'), 'first');
  leading('second');
  leading('latest');
  await delay(25);
  assert.deepEqual(leadingCalls, ['first', 'latest']);

  const leadingOnlyCalls = [];
  const leadingOnly = debounce((value) => leadingOnlyCalls.push(value), 10, {
    leading: true,
    trailing: false
  });
  leadingOnly('one');
  leadingOnly('two');
  await delay(20);
  assert.deepEqual(leadingOnlyCalls, ['one']);

  const context = { factor: 3, calculate(value) { return this.factor * value; } };
  const bound = debounce(context.calculate, 0);
  assert.equal(bound.call(context, 7), undefined);
  assert.equal(bound.flush(), 21);
}

if (require.main === module) {
  runTests().then(() => console.log('Debounce: all tests passed'));
}

module.exports = { debounce };
