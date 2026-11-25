'use strict';

// Exercise: implement deterministic asynchronous resource management. Every
// registered disposer runs once, in reverse acquisition order, even on failure.

async function withResourceScope(work) {
  const disposers = [];
  let closed = false;

  const scope = Object.freeze({
    defer(disposer) {
      if (closed) throw new Error('resource scope is closed');
      if (typeof disposer !== 'function') throw new TypeError('disposer must be a function');
      let called = false;
      disposers.push(async () => {
        if (called) return;
        called = true;
        await disposer();
      });
    },
    use(resource, disposer) {
      if (closed) throw new Error('resource scope is closed');
      if (!resource || typeof disposer !== 'function') throw new TypeError('resource and disposer required');
      this.defer(() => disposer(resource));
      return resource;
    }
  });

  let value, primaryError;
  try {
    value = await work(scope);
  } catch (error) {
    primaryError = error;
  } finally {
    closed = true;
  }

  const cleanupErrors = [];
  for (let index = disposers.length - 1; index >= 0; index--) {
    try { await disposers[index](); }
    catch (error) { cleanupErrors.push(error); }
  }

  if (primaryError && cleanupErrors.length) {
    throw new AggregateError([primaryError, ...cleanupErrors], 'work and cleanup both failed', { cause: primaryError });
  }
  if (primaryError) throw primaryError;
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'resource cleanup failed');
  return value;
}

if (require.main === module) {
  const assert = require('node:assert/strict');

  (async () => {
    const order = [];
    const value = await withResourceScope(async scope => {
      scope.defer(async () => { order.push('first'); });
      const resource = scope.use({ name: 'db' }, async item => { order.push(item.name); });
      scope.defer(() => { order.push('last'); });
      return resource.name;
    });
    assert.equal(value, 'db');
    assert.deepEqual(order, ['last', 'db', 'first']);

    const primary = new Error('operation failed');
    const cleanup = new Error('close failed');
    await assert.rejects(
      withResourceScope(async scope => {
        scope.defer(() => { throw cleanup; });
        throw primary;
      }),
      error => error instanceof AggregateError && error.errors[0] === primary && error.errors[1] === cleanup
    );

    let calls = 0;
    await withResourceScope(async scope => {
      scope.defer(() => { calls++; });
    });
    assert.equal(calls, 1);
    console.log('async resource scope: all tests passed');
  })().catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { withResourceScope };
