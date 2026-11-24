'use strict';

const assert = require('node:assert/strict');

function replaceGraphNode(root, target, replacement) {
  if ((typeof target !== 'object' || target === null) ||
      (typeof root !== 'object' || root === null)) {
    throw new TypeError('Root and target must be objects');
  }

  const memo = new WeakMap();
  let targetFound = false;

  function visit(value) {
    if (value === null || typeof value !== 'object') return value; // functions remain callable atomic references
    if (value instanceof Date || value instanceof Map || value instanceof Set || value instanceof RegExp || ArrayBuffer.isView(value)) return value;
    if (value === target) {
      targetFound = true;
      return replacement;
    }
    if (memo.has(value)) return memo.get(value);

    const copy = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
    memo.set(value, copy);
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        descriptor.value = visit(descriptor.value);
      }
      Object.defineProperty(copy, key, descriptor);
    }
    return copy;
  }

  const rewritten = visit(root);
  return targetFound ? rewritten : root;
}

const shared = { score: 4 };
const root = { left: shared, right: shared, label: 'root' };
root.self = root;
const replacement = Object.freeze({ score: 99 });
const updated = replaceGraphNode(root, shared, replacement);

assert.notEqual(updated, root);
assert.equal(updated.left, replacement);
assert.equal(updated.right, replacement); // aliases still point to one object
assert.equal(updated.self, updated); // cycle points to the rewritten root
assert.equal(root.left.score, 4); // original graph remains untouched
assert.equal(updated.label, 'root');

const untouched = { value: 1 };
assert.equal(replaceGraphNode(untouched, { value: 2 }, { value: 3 }), untouched);
const proto = { kind: 'record' };
const method = () => 42;
const timestamp = new Date(0);
const instance = Object.assign(Object.create(proto), { ref: shared, method, timestamp });
const rewrittenInstance = replaceGraphNode(instance, shared, replacement);
assert.equal(Object.getPrototypeOf(rewrittenInstance), proto);
assert.equal(rewrittenInstance.ref, replacement);
assert.equal(rewrittenInstance.method, method);
assert.equal(rewrittenInstance.method(), 42);
assert.equal(rewrittenInstance.timestamp, timestamp);
console.log('Object-graph rewrite examples passed.');

module.exports = { replaceGraphNode };
