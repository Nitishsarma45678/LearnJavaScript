'use strict';

// Exercise: decorate an inherited prototype method without mutating its parent
// prototype or losing descriptor flags. The original method retains lexical
// super behavior because it is invoked as the same function object.

function decorateMethod(prototype, name, decorator) {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
  if (!descriptor || typeof descriptor.value !== 'function') {
    throw new TypeError('Expected an own data-method descriptor for ' + String(name));
  }
  const wrapped = decorator(descriptor.value);
  if (typeof wrapped !== 'function') throw new TypeError('Decorator must return a function');
  Object.defineProperty(prototype, name, { ...descriptor, value: wrapped });
  return () => Object.defineProperty(prototype, name, descriptor);
}

function around(before, after) {
  return original => function (...args) {
    before.call(this, args);
    try {
      const result = original.apply(this, args);
      after.call(this, null, result);
      return result;
    } catch (error) {
      after.call(this, error);
      throw error;
    }
  };
}

const assert = require('node:assert/strict');
class Base {
  describe(value) { return 'base:' + value; }
}
class Derived extends Base {
  describe(value) { return super.describe(value).toUpperCase(); }
}
const events = [];
const descriptorBefore = Object.getOwnPropertyDescriptor(Derived.prototype, 'describe');
const restore = decorateMethod(Derived.prototype, 'describe', around(
  args => events.push(['before', args[0]]),
  (error, result) => events.push(error ? ['error', error.message] : ['after', result])
));
const instance = new Derived();
assert.equal(instance.describe('ready'), 'BASE:READY');
assert.deepEqual(events, [['before', 'ready'], ['after', 'BASE:READY']]);
assert.equal(new Base().describe('ready'), 'base:ready');
restore();
assert.equal(instance.describe('ready'), 'BASE:READY');
assert.equal(Object.getOwnPropertyDescriptor(Derived.prototype, 'describe').enumerable,
  descriptorBefore.enumerable);
console.log('Prototype decorator tests passed');

module.exports = { decorateMethod, around };
