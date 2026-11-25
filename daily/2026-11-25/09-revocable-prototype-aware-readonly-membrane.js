'use strict';

// Exercise: create a revocable read-only membrane for ordinary objects,
// arrays, and methods. Preserve cycles, aliases, and prototype delegation.
// Construction and exotic objects are deliberately excluded.

function createReadonlyMembrane(root) {
  const cache = new WeakMap();
  let revoked = false;
  const isReference = value => value !== null &&
    (typeof value === 'object' || typeof value === 'function');

  function ensureActive() {
    if (revoked) throw new TypeError('membrane has been revoked');
  }

  function wrap(value) {
    if (!isReference(value)) return value;
    if (cache.has(value)) return cache.get(value);
    if (!Object.isExtensible(value)) throw new TypeError('non-extensible objects are not supported');

    const callable = typeof value === 'function';
    const handler = {
      get(target, key, receiver) {
        ensureActive();
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
        if (descriptor && descriptor.configurable === false &&
            'value' in descriptor && descriptor.writable === false &&
            isReference(descriptor.value)) {
          throw new TypeError('cannot safely wrap a frozen reference-valued property');
        }
        return wrap(Reflect.get(target, key, receiver));
      },
      getPrototypeOf(target) {
        ensureActive();
        const prototype = Reflect.getPrototypeOf(target);
        // Function.prototype is an intrinsic shared by all functions. Keeping
        // this intrinsic raw avoids wrapping a non-configurable function slot.
        return callable ? prototype : wrap(prototype);
      },
      getOwnPropertyDescriptor(target, key) {
        ensureActive();
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
        if (!descriptor) return undefined;
        if ('value' in descriptor) {
          if (descriptor.configurable === false && descriptor.writable === false &&
              isReference(descriptor.value)) {
            throw new TypeError('cannot safely expose a frozen reference-valued descriptor');
          }
          descriptor.value = wrap(descriptor.value);
        }
        if (descriptor.get) descriptor.get = wrap(descriptor.get);
        if (descriptor.set) descriptor.set = wrap(descriptor.set);
        return descriptor;
      },
      set() { ensureActive(); throw new TypeError('read-only membrane'); },
      deleteProperty() { ensureActive(); throw new TypeError('read-only membrane'); },
      defineProperty() { ensureActive(); throw new TypeError('read-only membrane'); },
      setPrototypeOf() { ensureActive(); throw new TypeError('read-only membrane'); },
      preventExtensions() { ensureActive(); throw new TypeError('read-only membrane'); },
      apply(target, thisArg, args) {
        ensureActive();
        return wrap(Reflect.apply(target, thisArg, args.map(wrap)));
      },
      construct() {
        ensureActive();
        throw new TypeError('construction through a read-only membrane is disabled');
      }
    };

    const proxy = new Proxy(value, handler);
    cache.set(value, proxy);
    return proxy;
  }

  const exposed = wrap(root);
  return Object.freeze({
    value: exposed,
    revoke() { revoked = true; }
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
  assert.equal(typeof Object.getPrototypeOf(view).label, 'function');
  assert.equal(Object.getPrototypeOf(view).label.call(view), 'ADA');
  assert.throws(() => { view.name = 'grace'; }, /read-only/);
  assert.throws(() => { delete view.meta; }, /read-only/);
  assert.throws(() => Object.defineProperty(view, 'x', { value: 1 }), /read-only/);
  membrane.revoke();
  assert.throws(() => view.name, /revoked/);
  console.log('read-only membrane: all tests passed');
}

module.exports = { createReadonlyMembrane };
