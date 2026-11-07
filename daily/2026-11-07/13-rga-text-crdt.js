'use strict';

/**
 * Exercise: build a state-based Replicated Growable Array (RGA) text CRDT.
 *
 * Requirements:
 * - Concurrent inserts after the same element converge deterministically.
 * - Deletes are monotonic tombstones; duplicate operations are idempotent.
 * - Merge is commutative, associative, and idempotent for valid replicas.
 * - Out-of-order inserts remain pending until their parent arrives.
 *
 * Run: node 13-rga-text-crdt.js
 */

const assert = require('node:assert/strict');
const HEAD = '@@HEAD@@';

function compareIds(a, b) {
  if (a.actor < b.actor) return -1;
  if (a.actor > b.actor) return 1;
  return a.counter - b.counter;
}

function normalizeId(id) {
  if (id === HEAD) return HEAD;
  if (!id || typeof id.actor !== 'string' || id.actor.length === 0 ||
      !Number.isSafeInteger(id.counter) || id.counter < 1) {
    throw new TypeError('id must contain a non-empty actor and positive safe counter');
  }
  return `${id.actor}\u0000${id.counter}`;
}

function parseId(key) {
  if (key === HEAD) return HEAD;
  const split = key.lastIndexOf('\u0000');
  return { actor: key.slice(0, split), counter: Number(key.slice(split + 1)) };
}

class RgaText {
  constructor(actor) {
    if (typeof actor !== 'string' || actor.length === 0) throw new TypeError('actor is required');
    this.actor = actor;
    this.counter = 0;
    this.nodes = new Map();
    this.tombstones = new Set();
  }

  insertAfter(after, character) {
    if (typeof character !== 'string' || Array.from(character).length !== 1) {
      throw new TypeError('insert exactly one Unicode code point');
    }
    const afterKey = normalizeId(after);
    const id = { actor: this.actor, counter: ++this.counter };
    const operation = { type: 'insert', id, after: afterKey === HEAD ? HEAD : parseId(afterKey), value: character };
    this.apply(operation);
    return operation;
  }

  delete(id) {
    const key = normalizeId(id);
    const operation = { type: 'delete', id: key === HEAD ? HEAD : parseId(key) };
    this.apply(operation);
    return operation;
  }

  apply(operation) {
    if (!operation || (operation.type !== 'insert' && operation.type !== 'delete')) {
      throw new TypeError('unknown operation');
    }
    const key = normalizeId(operation.id);
    if (key === HEAD) throw new TypeError('HEAD cannot be changed');

    if (operation.type === 'delete') {
      this.tombstones.add(key);
      return this;
    }

    const afterKey = normalizeId(operation.after);
    if (key === afterKey) throw new Error('an element cannot follow itself');
    if (typeof operation.value !== 'string' || Array.from(operation.value).length !== 1) {
      throw new TypeError('insert value must be one Unicode code point');
    }
    const existing = this.nodes.get(key);
    if (existing) {
      if (existing.after !== afterKey || existing.value !== operation.value) {
        throw new Error(`conflicting insert for element ${key}`);
      }
      return this;
    }
    const id = parseId(key);
    this.nodes.set(key, { id, after: afterKey, value: operation.value });
    if (id.actor === this.actor) this.counter = Math.max(this.counter, id.counter);
    return this;
  }

  merge(other) {
    if (!(other instanceof RgaText)) throw new TypeError('can only merge another RgaText');
    for (const [key, node] of other.nodes) {
      const existing = this.nodes.get(key);
      if (existing && (existing.after !== node.after || existing.value !== node.value)) {
        throw new Error(`conflicting element during merge: ${key}`);
      }
      if (!existing) this.nodes.set(key, { id: { ...node.id }, after: node.after, value: node.value });
    }
    for (const key of other.tombstones) this.tombstones.add(key);
    if (other.actor === this.actor) this.counter = Math.max(this.counter, other.counter);
    return this;
  }

  _orderedNodes() {
    const children = new Map();
    for (const [key, node] of this.nodes) {
      if (!children.has(node.after)) children.set(node.after, []);
      children.get(node.after).push([key, node]);
    }
    for (const siblings of children.values()) siblings.sort((a, b) => compareIds(a[1].id, b[1].id));

    const result = [];
    const visited = new Set();
    const active = new Set();
    const visit = parent => {
      for (const [key, node] of children.get(parent) || []) {
        if (active.has(key)) throw new Error('cycle detected in RGA state');
        if (visited.has(key)) continue;
        active.add(key);
        visited.add(key);
        result.push([key, node]);
        visit(key);
        active.delete(key);
      }
    };
    visit(HEAD);
    return result;
  }

  toString() {
    return this._orderedNodes()
      .filter(([key]) => !this.tombstones.has(key))
      .map(([, node]) => node.value)
      .join('');
  }

  visibleIds() {
    return this._orderedNodes()
      .filter(([key]) => !this.tombstones.has(key))
      .map(([key]) => parseId(key));
  }

  get length() {
    return this.visibleIds().length;
  }

  snapshot() {
    return {
      nodes: [...this.nodes.entries()].map(([key, node]) => [key, { id: { ...node.id }, after: node.after, value: node.value }]),
      tombstones: [...this.tombstones].sort()
    };
  }
}

function runTests() {
  const a = new RgaText('A');
  const first = a.insertAfter(HEAD, 'H');
  a.insertAfter(first.id, 'i');
  assert.equal(a.toString(), 'Hi');
  assert.equal(a.length, 2);

  const left = new RgaText('left');
  const right = new RgaText('right');
  const leftInsert = left.insertAfter(HEAD, 'L');
  const rightInsert = right.insertAfter(HEAD, 'R');
  const leftView = new RgaText('left-view').merge(left).merge(right);
  const rightView = new RgaText('right-view').merge(right).merge(left);
  assert.equal(leftView.toString(), rightView.toString(), 'concurrent siblings must converge');

  // A child may arrive before its parent; it becomes visible when the parent arrives.
  const outOfOrder = new RgaText('receiver');
  const parent = { type: 'insert', id: { actor: 'remote', counter: 1 }, after: HEAD, value: 'P' };
  const child = { type: 'insert', id: { actor: 'remote', counter: 2 }, after: parent.id, value: 'C' };
  outOfOrder.apply(child);
  assert.equal(outOfOrder.toString(), '');
  outOfOrder.apply(parent);
  assert.equal(outOfOrder.toString(), 'PC');

  // Deletion before insertion is retained as a tombstone.
  const lateDelete = new RgaText('late');
  lateDelete.delete(child.id);
  lateDelete.apply(parent).apply(child);
  assert.equal(lateDelete.toString(), 'P');
  assert.equal(lateDelete.tombstones.size, 1);

  // Merge is idempotent and order-independent for valid states.
  const x = new RgaText('x');
  const x1 = x.insertAfter(HEAD, 'x');
  x.insertAfter(x1.id, '1');
  const y = new RgaText('y');
  const y1 = y.insertAfter(HEAD, 'y');
  y.insertAfter(y1.id, '2');
  const xy = new RgaText('xy').merge(x).merge(y);
  const yx = new RgaText('yx').merge(y).merge(x);
  const xyAgain = new RgaText('xy2').merge(xy).merge(xy);
  assert.equal(xy.toString(), yx.toString());
  assert.equal(xy.toString(), xyAgain.toString());

  const beforeDelete = xy.toString();
  const visible = xy.visibleIds();
  xy.delete(visible[0]);
  assert.equal(xy.length, beforeDelete.length - 1);
  const afterDelete = xy.toString();
  assert.notEqual(afterDelete, beforeDelete);
  yx.merge(xy);
  assert.equal(yx.toString(), afterDelete, 'deletion propagates after merge');

  const unicode = new RgaText('unicode');
  unicode.insertAfter(HEAD, '\ud83e\uddea');
  unicode.insertAfter(unicode.visibleIds()[0], '\u00e9');
  assert.equal(unicode.toString(), '\ud83e\uddea\u00e9');
  assert.throws(() => unicode.insertAfter(HEAD, 'ab'), TypeError);
  assert.throws(() => unicode.apply({ type: 'insert', id: { actor: 'z', counter: 1 }, after: { actor: 'z', counter: 1 }, value: 'z' }), /follow itself/);

  console.log('RGA CRDT tests passed');
}

if (require.main === module) runTests();
module.exports = { RgaText, HEAD };
