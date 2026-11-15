/**
 * Async Dependency Injection Container
 *
 * Exercise:
 * Implement transient, scoped, and singleton lifetimes with asynchronous
 * factories, dependency lists, per-scope caches, cycle detection, and reverse
 * creation-order disposal. Factories receive declared dependencies followed
 * by a context object: { container, scope, resolve }.
 *
 * A scoped cache belongs to exactly one Scope. Transients are owned by the
 * scope that requested them; singletons are owned by the container.
 */

'use strict';

async function disposeReverse(instances) {
  const errors = [];
  for (let i = instances.length - 1; i >= 0; i -= 1) {
    try {
      await instances[i]();
    } catch (error) {
      errors.push(error);
    }
  }
  instances.length = 0;
  if (errors.length) throw new AggregateError(errors, 'One or more services failed to dispose');
}

function disposerOf(instance) {
  if (instance === null || (typeof instance !== 'object' && typeof instance !== 'function')) return null;
  const asyncSymbol = Symbol.asyncDispose;
  const syncSymbol = Symbol.dispose;
  if (asyncSymbol && typeof instance[asyncSymbol] === 'function') {
    return () => instance[asyncSymbol]();
  }
  if (typeof instance.asyncDispose === 'function') return () => instance.asyncDispose();
  if (syncSymbol && typeof instance[syncSymbol] === 'function') {
    return () => instance[syncSymbol]();
  }
  if (typeof instance.dispose === 'function') return () => instance.dispose();
  return null;
}

class Scope {
  constructor(container, parent = null) {
    this.container = container;
    this.parent = parent;
    this.cache = new Map();
    this.owned = [];
    this.disposed = false;
  }

  resolve(token) {
    return this.container._resolve(token, this, []);
  }

  createScope() {
    if (this.disposed) throw new Error('Cannot create a child of a disposed scope');
    return new Scope(this.container, this);
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cache.clear();
    await disposeReverse(this.owned);
  }
}

class Container {
  constructor() {
    this.registrations = new Map();
    this.singletons = new Map();
    this.singletonOwned = [];
    this.rootScope = new Scope(this);
    this.disposed = false;
  }

  register(token, factory, { lifetime = 'transient', deps = [] } = {}) {
    if (this.disposed) throw new Error('Container is disposed');
    if (this.registrations.has(token)) throw new Error('Token is already registered: ' + String(token));
    if (typeof factory !== 'function') throw new TypeError('factory must be a function');
    if (!Array.isArray(deps)) throw new TypeError('deps must be an array');
    if (!['transient', 'scoped', 'singleton'].includes(lifetime)) {
      throw new RangeError('Unknown lifetime: ' + lifetime);
    }
    this.registrations.set(token, { factory, lifetime, deps: [...deps] });
    return this;
  }

  resolve(token, scope = this.rootScope) {
    return this._resolve(token, scope, []);
  }

  createScope(parent = this.rootScope) {
    if (!(parent instanceof Scope) || parent.container !== this || parent.disposed) {
      throw new TypeError('parent must be an active scope from this container');
    }
    return parent.createScope();
  }

  async _resolve(token, scope, chain) {
    if (this.disposed) throw new Error('Container is disposed');
    if (!(scope instanceof Scope) || scope.container !== this || scope.disposed) {
      throw new Error('Scope is invalid or disposed');
    }
    if (chain.includes(token)) {
      const path = [...chain, token].map(String).join(' -> ');
      throw new Error('Circular dependency: ' + path);
    }

    const registration = this.registrations.get(token);
    if (!registration) throw new Error('No provider registered for token: ' + String(token));

    const cache = registration.lifetime === 'singleton'
      ? this.singletons
      : registration.lifetime === 'scoped' ? scope.cache : null;

    if (cache && cache.has(token)) return cache.get(token);

    const nextChain = [...chain, token];
    const pending = this._instantiate(registration, scope, nextChain);
    if (cache) cache.set(token, pending);

    try {
      const instance = await pending;
      const disposer = disposerOf(instance);
      if (disposer) {
        (registration.lifetime === 'singleton' ? this.singletonOwned : scope.owned).push(disposer);
      }
      return instance;
    } catch (error) {
      if (cache && cache.get(token) === pending) cache.delete(token);
      throw error;
    }
  }

  async _instantiate(registration, scope, chain) {
    const dependencies = await Promise.all(
      registration.deps.map(token => this._resolve(token, scope, chain))
    );
    const context = {
      container: this,
      scope,
      resolve: token => this._resolve(token, scope, chain)
    };
    return registration.factory(...dependencies, context);
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const errors = [];
    try { await this.rootScope.dispose(); } catch (error) { errors.push(error); }
    this.singletons.clear();
    try { await disposeReverse(this.singletonOwned); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, 'Container disposal failed');
  }
}

function runTests() {
  const assert = require('node:assert/strict');

  return (async () => {
    const container = new Container();
    let transientCount = 0;
    let scopedCount = 0;
    let singletonCount = 0;
    container
      .register('transient', () => ({ id: ++transientCount }))
      .register('scoped', () => ({ id: ++scopedCount }), { lifetime: 'scoped' })
      .register('singleton', async () => {
        singletonCount += 1;
        await Promise.resolve();
        return { id: singletonCount };
      }, { lifetime: 'singleton' });

    const first = container.createScope();
    const second = container.createScope();
    assert.notEqual(await first.resolve('transient'), await first.resolve('transient'));
    assert.equal(await first.resolve('scoped'), await first.resolve('scoped'));
    assert.notEqual(await first.resolve('scoped'), await second.resolve('scoped'));
    const pair = await Promise.all([first.resolve('singleton'), second.resolve('singleton')]);
    assert.equal(pair[0], pair[1]);
    assert.equal(singletonCount, 1);

    const cycle = new Container();
    cycle.register('A', b => ({ b }), { deps: ['B'] });
    cycle.register('B', a => ({ a }), { deps: ['A'] });
    await assert.rejects(cycle.resolve('A'), /Circular dependency/);

    const order = [];
    const disposal = new Container();
    disposal.register('dependency', () => ({
      dispose() { order.push('dependency'); }
    }), { lifetime: 'scoped' });
    disposal.register('consumer', dependency => ({
      dependency,
      dispose() { order.push('consumer'); }
    }), { lifetime: 'scoped', deps: ['dependency'] });
    const scope = disposal.createScope();
    await scope.resolve('consumer');
    await scope.dispose();
    assert.deepEqual(order, ['consumer', 'dependency']);
    await scope.dispose();
    await disposal.dispose();
    await first.dispose();
    await second.dispose();
    await container.dispose();
    await assert.rejects(container.resolve('singleton'), /disposed/);
    assert.equal(transientCount, 2);
    assert.equal(scopedCount, 3);
    console.log('Dependency injection container tests passed');
  })();
}

if (require.main === module) runTests().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

module.exports = { Container, Scope };
