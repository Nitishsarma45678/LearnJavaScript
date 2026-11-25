'use strict';

// Exercise: compose JavaScript prototype layers using C3 linearization.
// Preserve property descriptors and reject inconsistent multiple-inheritance
// orders instead of silently choosing an arbitrary precedence.

function createTrait(name, parents = [], members = {}) {
  if (typeof name !== 'string' || !name) throw new TypeError('trait name is required');
  return Object.freeze({
    name,
    parents: Object.freeze([...parents]),
    descriptors: Object.freeze(Object.getOwnPropertyDescriptors(members))
  });
}

function c3Merge(sequences) {
  const lists = sequences.map(sequence => [...sequence]).filter(sequence => sequence.length);
  const result = [];
  while (lists.length) {
    let candidate = null;
    for (const list of lists) {
      const head = list[0];
      const appearsInTail = lists.some(other => other.slice(1).includes(head));
      if (!appearsInTail) { candidate = head; break; }
    }
    if (!candidate) throw new Error('inconsistent trait precedence; C3 linearization is impossible');
    result.push(candidate);
    for (let i = lists.length - 1; i >= 0; i--) {
      if (lists[i][0] === candidate) lists[i].shift();
      if (!lists[i].length) lists.splice(i, 1);
    }
  }
  return result;
}

function composePrototype(name, parents, members = {}) {
  const memo = new Map();
  const visiting = new Set();

  function linearize(trait) {
    if (memo.has(trait)) return memo.get(trait);
    if (visiting.has(trait)) throw new Error('cyclic trait inheritance');
    visiting.add(trait);
    const parentOrders = trait.parents.map(linearize);
    const order = [trait, ...c3Merge([...parentOrders, trait.parents])];
    visiting.delete(trait);
    memo.set(trait, order);
    return order;
  }

  const root = createTrait(name, parents, members);
  const mro = linearize(root);
  let prototype = null;
  for (let i = mro.length - 1; i >= 0; i--) {
    const layer = Object.create(prototype);
    Object.defineProperties(layer, mro[i].descriptors);
    prototype = layer;
  }
  return Object.freeze({ prototype, mro: Object.freeze(mro.map(trait => trait.name)) });
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  const A = createTrait('A', [], { identify() { return 'A'; }, shared: 'A' });
  const B = createTrait('B', [A], { fromB() { return 'B'; }, shared: 'B' });
  const C = createTrait('C', [A], { fromC() { return 'C'; }, shared: 'C' });
  const D = composePrototype('D', [B, C], {
    identify() { return 'D'; },
    get label() { return this.identify() + ':' + this.shared; }
  });
  const instance = Object.create(D.prototype);
  assert.deepEqual(D.mro, ['D', 'B', 'C', 'A']);
  assert.equal(instance.identify(), 'D');
  assert.equal(instance.fromB(), 'B');
  assert.equal(instance.fromC(), 'C');
  assert.equal(instance.shared, 'B');
  assert.equal(instance.label, 'D:B');

  const X = createTrait('X');
  const Y = createTrait('Y');
  const P = createTrait('P', [X, Y]);
  const Q = createTrait('Q', [Y, X]);
  assert.throws(() => composePrototype('Bad', [P, Q]), /inconsistent/);
  console.log('C3 prototype composition: all tests passed');
}

module.exports = { createTrait, composePrototype, c3Merge };
