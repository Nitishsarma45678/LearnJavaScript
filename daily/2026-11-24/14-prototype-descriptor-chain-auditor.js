'use strict';

const assert = require('node:assert/strict');

function traceProperty(object, key) {
  if ((typeof object !== 'object' || object === null) && typeof object !== 'function') {
    throw new TypeError('Expected an object or function');
  }
  const chain = [];
  let current = object;
  let depth = 0;
  while (current !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor) {
      const isData = Object.prototype.hasOwnProperty.call(descriptor, 'value');
      chain.push({
        depth,
        owner: current,
        kind: isData ? 'data' : 'accessor',
        enumerable: descriptor.enumerable,
        configurable: descriptor.configurable,
        writable: isData ? descriptor.writable : undefined,
        hasGetter: !isData && typeof descriptor.get === 'function',
        hasSetter: !isData && typeof descriptor.set === 'function'
      });
    }
    current = Object.getPrototypeOf(current);
    depth++;
  }
  return chain;
}

function safeRead(object, key) {
  const chain = traceProperty(object, key);
  if (!chain.length) return { found: false, value: undefined };
  const descriptor = Object.getOwnPropertyDescriptor(chain[0].owner, key);
  if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
    throw new TypeError('Refusing to invoke accessor for ' + String(key));
  }
  return { found: true, value: descriptor.value, owner: chain[0].owner };
}

const base = {};
Object.defineProperty(base, 'token', { value: 'base-token', enumerable: false });
let getterCalls = 0;
Object.defineProperty(base, 'secret', {
  get() { getterCalls++; return 'classified'; },
  configurable: true
});
const middle = Object.create(base);
Object.defineProperty(middle, 'token', { value: 'middle-token', writable: true });
const leaf = Object.create(middle);
leaf.own = 42;

const tokenChain = traceProperty(leaf, 'token');
assert.equal(tokenChain.length, 2);
assert.equal(tokenChain[0].depth, 1);
assert.equal(tokenChain[1].depth, 2);
assert.equal(safeRead(leaf, 'token').value, 'middle-token');
assert.equal(safeRead(leaf, 'missing').found, false);
assert.throws(() => safeRead(leaf, 'secret'), /Refusing to invoke accessor/);
assert.equal(getterCalls, 0);
assert.equal(traceProperty(leaf, 'own')[0].depth, 0);
console.log('Prototype-auditor examples passed.');

module.exports = { traceProperty, safeRead };
