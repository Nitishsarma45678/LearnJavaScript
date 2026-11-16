/**
 * Exercise: compose JavaScript traits using C3 linearization.
 * A single real prototype chain is built in method-resolution order; cooperative
 * methods call `superCall(this, Trait, key, ...args)` to continue after the
 * trait currently executing. Property descriptors and symbol keys are kept.
 *
 * Run: node c3-trait-composer.js
 */
'use strict';
const assert = require('node:assert/strict');
const MRO = Symbol('trait.mro');
const BASE = Symbol('trait.basePrototype');
const TRAIT = Symbol('trait.marker');

function createTrait(name, parents = [], members = {}) {
  if (typeof name !== 'string' || !name.trim()) throw new TypeError('Trait name must be a non-empty string');
  if (!Array.isArray(parents) || parents.some(parent => !parent || parent[TRAIT] !== true)) {
    throw new TypeError('Every parent must be a trait');
  }
  if (new Set(parents).size !== parents.length) throw new Error(`Trait ${name} repeats a parent`);
  if (members === null || (typeof members !== 'object' && typeof members !== 'function')) throw new TypeError('members must be an object');
  const copied = Object.create(null);
  for (const key of Reflect.ownKeys(members)) {
    if (key === MRO || key === BASE || key === TRAIT) throw new Error('Reserved trait metadata key');
    Object.defineProperty(copied, key, Object.getOwnPropertyDescriptor(members, key));
  }
  Object.freeze(copied);
  return Object.freeze({ [TRAIT]: true, name, parents: Object.freeze([...parents]), members: copied });
}

function mergeC3(inputSequences) {
  const sequences = inputSequences.map(sequence => sequence.slice());
  const result = [];
  while (sequences.some(sequence => sequence.length > 0)) {
    for (let i = sequences.length - 1; i >= 0; i--) if (sequences[i].length === 0) sequences.splice(i, 1);
    let candidate;
    for (const sequence of sequences) {
      const head = sequence[0];
      const appearsInTail = sequences.some(other => other.slice(1).includes(head));
      if (!appearsInTail) { candidate = head; break; }
    }
    if (candidate === undefined) {
      const names = sequences.map(sequence => sequence.map(item => item.name).join(' > ')).join(' | ');
      throw new Error(`Inconsistent C3 hierarchy: ${names}`);
    }
    result.push(candidate);
    for (const sequence of sequences) if (sequence[0] === candidate) sequence.shift();
  }
  return result;
}

function linearizeTrait(trait, memo = new Map(), active = new Set()) {
  if (!trait || trait[TRAIT] !== true) throw new TypeError('Expected a trait');
  if (memo.has(trait)) return memo.get(trait);
  if (active.has(trait)) throw new Error(`Trait inheritance cycle at ${trait.name}`);
  active.add(trait);
  const parentOrders = trait.parents.map(parent => linearizeTrait(parent, memo, active));
  const order = Object.freeze([trait, ...mergeC3([...parentOrders, trait.parents])]);
  active.delete(trait);
  memo.set(trait, order);
  return order;
}

function composeTraits(basePrototype, traits) {
  if (basePrototype !== null && (typeof basePrototype !== 'object' && typeof basePrototype !== 'function')) {
    throw new TypeError('basePrototype must be an object or null');
  }
  if (!Array.isArray(traits) || traits.some(trait => !trait || trait[TRAIT] !== true)) throw new TypeError('traits must be an array of traits');
  if (new Set(traits).size !== traits.length) throw new Error('A trait cannot be included twice');
  const memo = new Map();
  const mro = mergeC3([...traits.map(trait => linearizeTrait(trait, memo)), traits]);
  let prototype = basePrototype;
  for (let i = mro.length - 1; i >= 0; i--) {
    const layer = Object.create(prototype);
    for (const key of Reflect.ownKeys(mro[i].members)) {
      Object.defineProperty(layer, key, Object.getOwnPropertyDescriptor(mro[i].members, key));
    }
    prototype = layer;
  }
  if (prototype === null) prototype = Object.create(null);
  Object.defineProperties(prototype, {
    [MRO]: { value: Object.freeze(mro.slice()), configurable: false },
    [BASE]: { value: basePrototype, configurable: false },
  });
  return prototype;
}

function superCall(receiver, fromTrait, key, ...args) {
  if ((typeof receiver !== 'object' && typeof receiver !== 'function') || receiver === null) {
    throw new TypeError('superCall receiver must be an object');
  }
  const mro = receiver[MRO];
  if (!Array.isArray(mro)) throw new TypeError('Receiver was not created from a composed trait prototype');
  const start = mro.indexOf(fromTrait);
  if (start < 0) throw new Error(`Trait ${fromTrait?.name ?? '<unknown>'} is not in this receiver MRO`);
  for (let i = start + 1; i < mro.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(mro[i].members, key);
    if (!descriptor) continue;
    if (typeof descriptor.value !== 'function') throw new TypeError(`Next implementation of ${String(key)} is not a method`);
    return Reflect.apply(descriptor.value, receiver, args);
  }
  let base = receiver[BASE];
  while (base !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(base, key);
    if (descriptor) {
      if (typeof descriptor.value !== 'function') throw new TypeError(`Base implementation of ${String(key)} is not a method`);
      return Reflect.apply(descriptor.value, receiver, args);
    }
    base = Object.getPrototypeOf(base);
  }
  throw new Error(`No implementation of ${String(key)} follows ${fromTrait.name}`);
}

function getMethodResolutionOrder(composedPrototype) {
  const mro = composedPrototype?.[MRO];
  if (!Array.isArray(mro)) throw new TypeError('Expected a composed trait prototype');
  return mro.map(trait => trait.name);
}

function runTests() {
  const rootSymbol = Symbol('rootSymbol');
  const Root = createTrait('Root', [], {
    describe() { return 'root'; },
    get category() { return 'base'; },
    [rootSymbol]() { return 'symbol-method'; },
  });
  const Left = createTrait('Left', [Root], {
    describe() { return `left>${superCall(this, Left, 'describe')}`; },
  });
  const Right = createTrait('Right', [Root], {
    describe() { return `right>${superCall(this, Right, 'describe')}`; },
  });
  const composed = composeTraits(Object.prototype, [Left, Right]);
  const instance = Object.create(composed);
  assert.equal(instance.describe(), 'left>right>root');
  assert.equal(instance.category, 'base');
  assert.equal(instance[rootSymbol](), 'symbol-method');
  assert.deepEqual(getMethodResolutionOrder(composed), ['Left', 'Right', 'Root']);
  assert.equal(Object.getPrototypeOf(instance), composed);
  assert.equal(Object.hasOwn(instance, 'describe'), false);
  assert.equal(Object.hasOwn(Left.members, 'describe'), true);

  const before = Object.getOwnPropertyDescriptors(Root.members);
  composeTraits(null, [Right, Left]);
  assert.deepEqual(Object.getOwnPropertyDescriptors(Root.members), before, 'composition must not mutate source traits');

  const O = createTrait('O');
  const X = createTrait('X', [O]);
  const Y = createTrait('Y', [O]);
  const A = createTrait('A', [X, Y]);
  const B = createTrait('B', [Y, X]);
  assert.throws(() => composeTraits(null, [A, B]), /Inconsistent C3 hierarchy/);
  assert.throws(() => composeTraits(null, [Left, Left]), /included twice/);
  assert.throws(() => superCall({}, Left, 'describe'), /not created/);
  assert.throws(() => superCall(instance, O, 'describe'), /not in this receiver MRO/);
  assert.throws(() => createTrait('Bad', [{}]), /parent must be a trait/);
  console.log('C3 trait composer: all tests passed');
}

if (require.main === module) runTests();
module.exports = { createTrait, linearizeTrait, composeTraits, superCall, getMethodResolutionOrder };
