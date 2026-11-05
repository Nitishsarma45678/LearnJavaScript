"use strict";

/*
 * A deliberately small object-capability membrane.
 *
 * Values crossing the boundary are wrapped lazily. WeakMaps preserve identity
 * and allow arguments/this values to be unwrapped when calls cross back into
 * the trusted object graph. Functions remain callable and constructable.
 *
 * This exercise focuses on property access, assignment, method calls,
 * construction, cycles, identity, and revocation. It intentionally does not
 * implement reflective operations such as ownKeys/getOwnPropertyDescriptor.
 */

function createMembrane() {
  const targetToProxy = new WeakMap();
  const proxyToTarget = new WeakMap();
  const revokers = [];
  let revoked = false;

  function unwrap(value) {
    return proxyToTarget.get(value) || value;
  }

  function wrap(value) {
    const isObject = value !== null && typeof value === "object";
    const isFunction = typeof value === "function";

    if (!isObject && !isFunction) return value;
    if (targetToProxy.has(value)) return targetToProxy.get(value);
    if (revoked) throw new TypeError("Membrane has been revoked");

    // A function shadow keeps the proxy callable/constructable. An object
    // shadow has a null prototype to avoid accidental access to host objects.
    const shadow = isFunction ? function membraneCallable() {} : Object.create(null);

    const handler = {
      get(_shadow, key) {
        // Proxy invariants require exact values for certain frozen shadow
        // properties (for example function.prototype and function.caller).
        const descriptor = Reflect.getOwnPropertyDescriptor(shadow, key);
        if (descriptor && descriptor.configurable === false) {
          if ("value" in descriptor && descriptor.writable === false) {
            return descriptor.value;
          }
          if (!("value" in descriptor) && descriptor.get === undefined) {
            return undefined;
          }
        }

        return wrap(Reflect.get(value, key, value));
      },

      set(_shadow, key, nextValue) {
        return Reflect.set(value, key, unwrap(nextValue), value);
      },

      has(_shadow, key) {
        return key in value;
      },

      deleteProperty(_shadow, key) {
        return Reflect.deleteProperty(value, key);
      },

      apply(_shadow, thisArgument, argumentsList) {
        const result = Reflect.apply(
          value,
          unwrap(thisArgument),
          argumentsList.map(unwrap)
        );
        return wrap(result);
      },

      construct(_shadow, argumentsList, newTarget) {
        const actualNewTarget = unwrap(newTarget) || value;
        const instance = Reflect.construct(
          value,
          argumentsList.map(unwrap),
          actualNewTarget
        );
        return wrap(instance);
      }
    };

    const revocable = Proxy.revocable(shadow, handler);
    targetToProxy.set(value, revocable.proxy);
    proxyToTarget.set(revocable.proxy, value);
    revokers.push(revocable.revoke);
    return revocable.proxy;
  }

  return {
    wrap,
    unwrap,

    revoke() {
      if (revoked) return;
      revoked = true;
      for (const revokeProxy of revokers.splice(0)) revokeProxy();
    }
  };
}

module.exports = { createMembrane };

if (require.main === module) {
  const assert = require("node:assert/strict");

  const shared = { count: 1 };
  shared.self = shared;

  const api = {
    shared,
    echo(value) {
      return value === this.shared;
    },
    getSelf() {
      return this;
    },
    update(value) {
      value.count += 4;
      return value;
    }
  };

  const membrane = createMembrane();
  const exposed = membrane.wrap(api);

  assert.equal(exposed.shared, exposed.shared);
  assert.equal(exposed.shared.self, exposed.shared);
  assert.equal(exposed.getSelf(), exposed);
  assert.equal(exposed.echo(exposed.shared), true);

  exposed.shared.count = 3;
  assert.equal(shared.count, 3);
  exposed.update(exposed.shared);
  assert.equal(shared.count, 7);

  function Counter(initial) {
    this.value = initial;
  }
  Counter.prototype.increment = function increment() {
    this.value += 1;
    return this.value;
  };

  const WrappedCounter = membrane.wrap(Counter);
  const counter = new WrappedCounter(10);
  assert.equal(counter.increment(), 11);
  assert.equal(counter.value, 11);

  membrane.revoke();
  assert.throws(() => exposed.shared, TypeError);
  assert.throws(() => counter.value, TypeError);
  membrane.revoke(); // Revocation is idempotent.

  const other = createMembrane();
  const wrappedFunction = other.wrap((value) => value * 2);
  assert.equal(wrappedFunction(6), 12);
  other.revoke();

  console.log("Revocable object capability membrane: all tests passed");
}
