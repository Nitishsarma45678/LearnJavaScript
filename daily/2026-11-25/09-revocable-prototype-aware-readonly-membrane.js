'use strict';

// Exercise: create a revocable read-only membrane for ordinary extensible
// objects and arrays. Preserve cycles, aliases, and prototype delegation.
// Callable and exotic objects are intentionally outside this exercise's scope.

function createReadonlyMembrane(root) {
  const cache = new WeakMap();
  let revoked = false;

  function wrap(value) {
    if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return value;
    if (typeof value === 'function') throw new TypeError('callable values are not supported');
    if (cache.has(value)) return cache.get(value);
    if (!Object.isExtensible(value)) throw new TypeError('non-extensible objects are not supported');

    const handler = {
      get(target, key, receiver) {
        ensureActive();
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
        if (descriptor && descriptor.configurable === false &&
            'value' in descriptor && descriptor.writable === false &&
            descriptor.value !== null && typeof descriptor.value === 'object') {
          throw new TypeError('cannot safely wrap a frozen object-valued property');
        }
        return wrap(Reflect.get(target, key, receiver));
      },
      getPrototypeOf(target) {
        ensureActive();
        return wrap(Reflect.getPrototypeOf(target));
      },
      getOwnPropertyDescriptor(target, key) {
        ensureActive();
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
        if (!descriptor) return undefined;
        if ('value' in descriptor) descriptor.value = wrap(descriptor.value);
        return descriptor;
      },
      set() { ensureActive(); throw new TypeError('read-only membrane'); },
      deleteProperty() { ensureActive(); throw new TypeError('read-only membrane'); },
      defineProperty() { ensureActive(); throw new TypeError('read-only membrane'); },
      setPrototypeOf() { ensureActive(); throw new TypeError('read-only membrane'); },
      preventExtensions() { ensureActive(); throw new TypeError('read-only membrane'); }
    };

    function ensureActive() {
      if (revoked) throw new TypeError('membrane has been revoked');
    }

    const proxy = new Proxy(value, handler);
    cache.set(value, proxy);
    return proxy;
  }

  const exposed = wrap(root);
  return Object.freeze({
    value: exposed,
    revoke() { revoked = true; cache.clear?.(); }
  });
}

if (require.main === module) {
  const assert = require('node:assert/strict');

  const proto = { label() { return this.name.toUpperCase(); } };
  const original = Object.create(proto);
  original.name = 'ada';
  original.self = original;
  original.meta = { score: 10 };
  const membrane = createReadonlyMembrane(original);
  const view = membrane.value;

  assert.equal(view.label(), 'ADA');
  assert.equal(view.self, view);
  assert.equal(view.meta, view.meta);
  assert.equal(Object.getPrototypeOf(view).label, proto.label);
  assert.throws(() => { view.name = 'grace'; }, /read-only/);
  assert.throws(() => { delete view.meta; }, /read-only/);
  assert.throws(() => Object.defineProperty(view, 'x', { value: 1 }), /read-only/);
  membrane.revoke();
  assert.throws(() => view.name, /revoked/);
  console.log('read-only membrane: all tests passed');
}

module.exports = { createReadonlyMembrane };
