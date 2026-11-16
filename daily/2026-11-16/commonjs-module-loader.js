'use strict';

/**
 * EXERCISE: Build a small CommonJS-style module loader using closures.
 *
 * Requirements:
 * - Normalize module IDs and resolve relative requires from the parent module.
 * - Cache module exports before executing a factory so circular dependencies
 *   can observe partially initialized exports.
 * - Roll back the failing module's cache entry if its factory throws.
 * - Track dependency edges and invalidate a changed module plus all transitive
 *   dependents, while preserving unrelated cached modules.
 * - Support replacement of a module factory followed by cascade invalidation.
 *
 * Factories receive (require, module, exports). This is synchronous by design.
 * Run: node commonjs-module-loader.js
 */

function normalizeId(request, parentId = '/') {
  if (typeof request !== 'string' || !request.trim()) throw new TypeError('Module ID must be a non-empty string');
  const base = request.startsWith('/') ? [] : parentId.split('/').slice(0, -1).filter(Boolean);
  const parts = request.split('/');
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!base.length) throw new Error('Module path escapes the virtual root');
      base.pop();
    } else {
      base.push(part);
    }
  }
  let id = `/${base.join('/')}`;
  if (!/\.[a-zA-Z0-9]+$/.test(id)) id += '.js';
  return id;
}

function createModuleLoader() {
  const definitions = new Map();
  const cache = new Map();
  const dependencies = new Map(); // parent -> children
  const dependents = new Map();   // child -> parents

  function link(parent, child) {
    if (!parent) return;
    if (!dependencies.has(parent)) dependencies.set(parent, new Set());
    if (!dependents.has(child)) dependents.set(child, new Set());
    dependencies.get(parent).add(child);
    dependents.get(child).add(parent);
  }

  function unlinkModule(id) {
    for (const child of dependencies.get(id) || []) {
      const parents = dependents.get(child);
      if (parents) {
        parents.delete(id);
        if (!parents.size) dependents.delete(child);
      }
    }
    dependencies.delete(id);
    const parents = dependents.get(id);
    if (parents) {
      for (const parent of parents) dependencies.get(parent)?.delete(id);
      dependents.delete(id);
    }
  }

  function requireFrom(request, parentId = null) {
    const id = normalizeId(request, parentId || '/');
    link(parentId, id);
    if (cache.has(id)) return cache.get(id).module.exports;
    const factory = definitions.get(id);
    if (!factory) throw new Error(`Cannot find module '${id}'`);

    const module = { id, exports: {}, loaded: false, parent: parentId };
    const record = { module };
    cache.set(id, record); // cache before factory: required for circular imports
    const localRequire = childRequest => requireFrom(childRequest, id);
    localRequire.resolve = childRequest => normalizeId(childRequest, id);

    try {
      factory(localRequire, module, module.exports);
      module.loaded = true;
      return module.exports;
    } catch (error) {
      cache.delete(id);
      unlinkModule(id);
      throw error;
    }
  }

  function define(id, factory) {
    const canonical = normalizeId(id);
    if (typeof factory !== 'function') throw new TypeError('Module factory must be a function');
    if (definitions.has(canonical)) throw new Error(`Module already defined: ${canonical}`);
    definitions.set(canonical, factory);
    return canonical;
  }

  function replace(id, factory) {
    const canonical = normalizeId(id);
    if (!definitions.has(canonical)) throw new Error(`Cannot replace undefined module: ${canonical}`);
    if (typeof factory !== 'function') throw new TypeError('Module factory must be a function');
    definitions.set(canonical, factory);
    invalidate(canonical, { cascade: true });
    return canonical;
  }

  function invalidate(id, { cascade = true } = {}) {
    const canonical = normalizeId(id);
    const invalidated = new Set();
    const stack = [canonical];
    while (stack.length) {
      const current = stack.pop();
      if (invalidated.has(current)) continue;
      invalidated.add(current);
      if (cascade) {
        for (const parent of dependents.get(current) || []) stack.push(parent);
      }
    }
    for (const current of invalidated) {
      cache.delete(current);
      unlinkModule(current);
    }
    return [...invalidated];
  }

  return Object.freeze({
    define,
    require: request => requireFrom(request),
    replace,
    invalidate,
    resolve: request => normalizeId(request),
    hasCached: request => cache.has(normalizeId(request)),
    cacheSize: () => cache.size,
  });
}

function runTests() {
  const assert = require('node:assert/strict');
  const loader = createModuleLoader();
  let executions = 0;
  loader.define('/app/math', (_require, module) => {
    executions++;
    module.exports = { double: n => n * 2 };
  });
  loader.define('/app/main', (require, module) => {
    const math = require('./math');
    module.exports = { answer: math.double(21), resolve: require.resolve('./math') };
  });
  const main = loader.require('/app/main');
  assert.equal(main.answer, 42);
  assert.equal(main.resolve, '/app/math.js');
  assert.equal(loader.require('/app/main'), main);
  assert.equal(executions, 1, 'module factory must be cached');

  // Circular imports see the exports object installed before factory execution.
  const cyclic = createModuleLoader();
  cyclic.define('/cycle/a', (require, module, exports) => {
    exports.name = 'a';
    exports.fromB = require('./b').name;
  });
  cyclic.define('/cycle/b', (require, module, exports) => {
    exports.name = 'b';
    exports.fromA = require('./a').name;
  });
  assert.deepEqual(cyclic.require('/cycle/a'), { name: 'a', fromB: 'b' });
  assert.deepEqual(cyclic.require('/cycle/b'), { name: 'b', fromA: 'a' });

  const invalidation = createModuleLoader();
  let version = 1;
  invalidation.define('/pkg/leaf', (_r, module) => { module.exports = { version }; });
  invalidation.define('/pkg/middle', (require, module) => { module.exports = require('./leaf').version + 10; });
  invalidation.define('/pkg/top', (require, module) => { module.exports = require('./middle') + 100; });
  invalidation.define('/pkg/independent', (_r, module) => { module.exports = 'stable'; });
  assert.equal(invalidation.require('/pkg/top'), 111);
  assert.equal(invalidation.require('/pkg/independent'), 'stable');
  version = 2;
  invalidation.replace('/pkg/leaf', (_r, module) => { module.exports = { version }; });
  assert.equal(invalidation.require('/pkg/top'), 112);
  assert.equal(invalidation.require('/pkg/independent'), 'stable');

  const failing = createModuleLoader();
  failing.define('/bad', () => { throw new Error('factory failed'); });
  assert.throws(() => failing.require('/bad'), /factory failed/);
  assert.equal(failing.hasCached('/bad'), false, 'failed factory must not poison cache');
  assert.throws(() => failing.require('/missing'), /Cannot find module/);
  assert.throws(() => normalizeId('../../escape', '/root/a.js'), /escapes/);

  console.log('commonjs-module-loader: all tests passed');
}

if (require.main === module) runTests();
module.exports = { createModuleLoader, normalizeId, runTests };
