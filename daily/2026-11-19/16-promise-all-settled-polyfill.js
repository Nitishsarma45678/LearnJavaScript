'use strict';

/**
 * Exercise: Re-create Promise.allSettled without calling the native method.
 *
 * The function accepts any synchronous iterable, preserves input order,
 * converts values and thenables with Promise.resolve, and rejects only when
 * obtaining the iterator itself fails.
 */

function allSettled(iterable) {
  return new Promise((resolve, reject) => {
    let values;
    try {
      values = Array.from(iterable);
    } catch (error) {
      reject(error);
      return;
    }

    if (values.length === 0) {
      resolve([]);
      return;
    }

    const results = new Array(values.length);
    let remaining = values.length;

    values.forEach((value, index) => {
      Promise.resolve(value).then(
        (result) => {
          results[index] = { status: 'fulfilled', value: result };
          remaining -= 1;
          if (remaining === 0) resolve(results);
        },
        (reason) => {
          results[index] = { status: 'rejected', reason };
          remaining -= 1;
          if (remaining === 0) resolve(results);
        }
      );
    });
  });
}

async function runTests() {
  const assert = require('node:assert/strict');
  const failure = new Error('network unavailable');
  const results = await allSettled([
    Promise.resolve('ready'),
    Promise.reject(failure),
    42,
    { then(resolve) { setTimeout(() => resolve('thenable'), 1); } }
  ]);

  assert.deepEqual(results[0], { status: 'fulfilled', value: 'ready' });
  assert.deepEqual(results[1], { status: 'rejected', reason: failure });
  assert.deepEqual(results[2], { status: 'fulfilled', value: 42 });
  assert.deepEqual(results[3], { status: 'fulfilled', value: 'thenable' });
  assert.deepEqual(await allSettled([]), []);

  function* values() {
    yield 1;
    yield Promise.resolve(2);
  }
  assert.deepEqual(await allSettled(values()), [
    { status: 'fulfilled', value: 1 },
    { status: 'fulfilled', value: 2 }
  ]);

  const brokenIterable = {
    [Symbol.iterator]() {
      throw new Error('iterator failed');
    }
  };
  await assert.rejects(allSettled(brokenIterable), /iterator failed/);
}

if (require.main === module) {
  runTests().then(() => console.log('Promise.allSettled polyfill: all tests passed'));
}

module.exports = { allSettled };
