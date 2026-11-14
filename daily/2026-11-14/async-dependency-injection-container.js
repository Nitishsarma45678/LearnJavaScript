'use strict';

// Asynchronous dependency-injection container with singleton, scoped and
// transient lifetimes. In-flight singleton promises are shared; failures are
// evicted for retry; cycles are detected before a cached promise can deadlock.
const ASYNC_DISPOSE = Symbol.asyncDispose || Symbol.for('Symbol.asyncDispose');
const SYNC_DISPOSE = Symbol.dispose || Symbol.for('Symbol.dispose');

class ResolutionError extends Error {
  constructor(message) { super(message); this.name = 'ResolutionError'; }
}
class Container {
  constructor() {
    this.providers = new Map(); this.singletons = new Map();
    this.owned = []; this.scopes = new Set(); this.disposed = false;
  }
  value(token, value) { return this.add(token, { kind: 'value', value, lifetime: 'singleton' }); }
  factory(token, fn, options = {}) {
    if (typeof fn !== 'function') throw new TypeError('factory must be a function');
    return this.add(token, { kind: 'factory', fn, deps: [...(options.deps || [])], lifetime: options.lifetime || 'transient' });
  }
  klass(token, Type, options = {}) {
    if (typeof Type !== 'function') throw new TypeError('class must be a constructor');
    return this.add(token, { kind: 'class', Type, deps: [...(options.deps || [])], lifetime: options.lifetime || 'transient' });
  }
  add(token, provider) {
    if (this.disposed) throw Error('container disposed');
    if (this.providers.has(token)) throw Error('duplicate provider: ' + String(token));
    if (!['singleton', 'scoped', 'transient'].includes(provider.lifetime)) throw RangeError('invalid lifetime');
    this.providers.set(token, provider); return this;
  }
  createScope(label = 'scope') {
    if (this.disposed) throw Error('container disposed');
    const scope = new Scope(this, label); this.scopes.add(scope); return scope;
  }
  resolve(token, scope = null) {
    if (this.disposed) return Promise.reject(Error('container disposed'));
    if (scope && (scope.container !== this || scope.disposed)) return Promise.reject(Error('invalid scope'));
    return this._resolve(token, scope, []);
  }
  async _resolve(token, scope, chain) {
    if (chain.includes(token)) throw new ResolutionError('dependency cycle: ' + [...chain, token].map(String).join(' -> '));
    const p = this.providers.get(token);
    if (!p) throw new ResolutionError('no provider: ' + String(token));
    const next = [...chain, token];
    if (p.lifetime === 'singleton') {
      if (this.singletons.has(token)) return this.singletons.get(token);
      const pending = this._build(p, null, next, this.owned);
      this.singletons.set(token, pending);
      try { return await pending; }
      catch (e) { if (this.singletons.get(token) === pending) this.singletons.delete(token); throw e; }
    }
    if (p.lifetime === 'scoped') {
      if (!scope) throw new ResolutionError('scoped provider requires a scope: ' + String(token));
      if (scope.cache.has(token)) return scope.cache.get(token);
      const pending = this._build(p, scope, next, scope.owned);
      scope.cache.set(token, pending);
      try { return await pending; }
      catch (e) { if (scope.cache.get(token) === pending) scope.cache.delete(token); throw e; }
    }
    return this._build(p, scope, next, scope ? scope.owned : this.owned);
  }
  async _build(p, scope, chain, owner) {
    if (p.kind === 'value') { owner.push(p.value); return p.value; }
    // Prevent a singleton from retaining a scope-local dependency.
    const dependencyScope = p.lifetime === 'singleton' ? null : scope;
    const args = await Promise.all(p.deps.map(token => this._resolve(token, dependencyScope, chain)));
    const instance = p.kind === 'factory' ? await p.fn(...args) : new p.Type(...args);
    owner.push(instance); return instance;
  }
  async dispose() {
    if (this.disposed) return;
    this.disposed = true; const errors = [];
    for (const scope of [...this.scopes].reverse()) {
      try { await scope.dispose(); } catch (e) { errors.push(e); }
    }
    this.singletons.clear();
    try { await disposeReverse(this.owned); } catch (e) { errors.push(e); }
    if (errors.length) throw new AggregateError(errors, 'container disposal failed');
  }
}
class Scope {
  constructor(container, label) { this.container = container; this.label = label; this.cache = new Map(); this.owned = []; this.disposed = false; }
  resolve(token) {
    if (this.disposed) return Promise.reject(Error('scope disposed: ' + this.label));
    return this.container.resolve(token, this);
  }
  async dispose() {
    if (this.disposed) return;
    this.disposed = true; this.cache.clear(); this.container.scopes.delete(this);
    await disposeReverse(this.owned);
  }
}
async function disposeReverse(stack) {
  const errors = [];
  while (stack.length) {
    const item = stack.pop();
    if (!item || (typeof item !== 'object' && typeof item !== 'function')) continue;
    try {
      if (typeof item[ASYNC_DISPOSE] === 'function') await item[ASYNC_DISPOSE]();
      else if (typeof item[SYNC_DISPOSE] === 'function') item[SYNC_DISPOSE]();
      else if (typeof item.dispose === 'function') await item.dispose();
    } catch (e) { errors.push(e); }
  }
  if (errors.length) throw new AggregateError(errors, 'resource disposal failed');
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  (async () => {
    const c = new Container(), disposed = []; let builds = 0;
    class Database { constructor() { this.id = ++builds; } dispose() { disposed.push('db' + this.id); } }
    class Request { constructor(db) { this.db = db; } dispose() { disposed.push('request'); } }
    c.klass('db', Database, { lifetime: 'singleton' });
    c.klass('request', Request, { deps: ['db'], lifetime: 'scoped' });
    c.factory('handler', request => ({ request }), { deps: ['request'] });
    const [a, b] = await Promise.all([c.resolve('db'), c.resolve('db')]);
    assert.equal(a, b); assert.equal(builds, 1);
    const s1 = c.createScope('one'), s2 = c.createScope('two');
    const [r1, r1b, r2] = await Promise.all([s1.resolve('request'), s1.resolve('request'), s2.resolve('request')]);
    assert.equal(r1, r1b); assert.notEqual(r1, r2); assert.equal(r1.db, r2.db);
    assert.notEqual(await s1.resolve('handler'), await s1.resolve('handler'));
    await s1.dispose(); assert.ok(disposed.includes('request'));
    await assert.rejects(s1.resolve('request'), /disposed/);

    let attempts = 0;
    c.factory('retry', async () => { if (++attempts === 1) throw Error('temporary'); return { ok: true }; }, { lifetime: 'singleton' });
    await assert.rejects(c.resolve('retry'), /temporary/);
    assert.deepEqual(await c.resolve('retry'), { ok: true }); assert.equal(attempts, 2);

    const cycle = new Container();
    cycle.factory('A', x => ({ x }), { deps: ['B'], lifetime: 'singleton' });
    cycle.factory('B', x => ({ x }), { deps: ['A'], lifetime: 'singleton' });
    await assert.rejects(cycle.resolve('A'), e => e instanceof ResolutionError && /A -> B -> A/.test(e.message));
    await cycle.dispose();

    const captive = new Container();
    captive.factory('local', () => ({}), { lifetime: 'scoped' });
    captive.factory('global', x => ({ x }), { deps: ['local'], lifetime: 'singleton' });
    await assert.rejects(captive.resolve('global'), /requires a scope/);
    await captive.dispose();

    await s2.dispose(); await c.dispose(); assert.ok(disposed.includes('db1'));
    await assert.rejects(c.resolve('db'), /disposed/);
    console.log('Async Dependency Injection Container: all tests passed');
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = { Container, Scope, ResolutionError };
