'use strict';

/**
 * Exercise: implement an immutable Hash Array Mapped Trie (HAMT).
 *
 * Requirements:
 * - String keys, 32-bit hashes, 5-bit trie fragments.
 * - Persistent set/delete: old versions must remain unchanged.
 * - Bitmap-indexed nodes, collision nodes, and structural sharing.
 * - Iteration and correct size accounting.
 *
 * Run: node 11-persistent-hamt-map.js
 */

const assert = require('node:assert/strict');

const LEAF = 0;
const COLLISION = 1;
const BITMAP = 2;

const leaf = (hash, key, value) => ({ type: LEAF, hash, key, value });
const collision = (hash, entries) => ({ type: COLLISION, hash, entries });
const bitmapNode = (bitmap, children) => ({ type: BITMAP, bitmap: bitmap >>> 0, children });

function popcount32(value) {
  value >>>= 0;
  value -= (value >>> 1) & 0x55555555;
  value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
  return (((value + (value >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function defaultHash(key) {
  // FNV-1a over UTF-16 code units; deterministic across runtimes.
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function fragment(hash, shift) {
  return (hash >>> shift) & 31;
}

function bitPosition(index) {
  return (1 << index) >>> 0;
}

function childIndex(bitmap, bit) {
  return popcount32(bitmap & ((bit - 1) >>> 0));
}

function mergeLeaves(shift, first, second) {
  if (first.hash === second.hash) {
    return collision(first.hash, [first, second]);
  }
  return mergeHashedNode(shift, first, first.hash, second);
}

function mergeHashedNode(shift, existingNode, existingHash, incomingLeaf) {
  const existingBit = bitPosition(fragment(existingHash, shift));
  const incomingBit = bitPosition(fragment(incomingLeaf.hash, shift));
  if (existingBit !== incomingBit) {
    const children = existingBit < incomingBit
      ? [existingNode, incomingLeaf]
      : [incomingLeaf, existingNode];
    return bitmapNode((existingBit | incomingBit) >>> 0, children);
  }
  return bitmapNode(existingBit, [
    mergeHashedNode(shift + 5, existingNode, existingHash, incomingLeaf)
  ]);
}

function lookup(node, shift, hash, key) {
  if (node === null) return undefined;
  if (node.type === LEAF) {
    return node.hash === hash && node.key === key ? node.value : undefined;
  }
  if (node.type === COLLISION) {
    if (node.hash !== hash) return undefined;
    const found = node.entries.find(entry => entry.key === key);
    return found ? found.value : undefined;
  }

  const bit = bitPosition(fragment(hash, shift));
  if ((node.bitmap & bit) === 0) return undefined;
  return lookup(node.children[childIndex(node.bitmap, bit)], shift + 5, hash, key);
}

function hasKey(node, shift, hash, key) {
  if (node === null) return false;
  if (node.type === LEAF) return node.hash === hash && node.key === key;
  if (node.type === COLLISION) {
    return node.hash === hash && node.entries.some(entry => entry.key === key);
  }
  const bit = bitPosition(fragment(hash, shift));
  return (node.bitmap & bit) !== 0 && hasKey(
    node.children[childIndex(node.bitmap, bit)], shift + 5, hash, key
  );
}

function associate(node, shift, incoming, change) {
  if (node === null) {
    change.added = true;
    return incoming;
  }

  if (node.type === LEAF) {
    if (node.hash === incoming.hash && node.key === incoming.key) {
      if (Object.is(node.value, incoming.value)) return node;
      return incoming;
    }
    change.added = true;
    return mergeLeaves(shift, node, incoming);
  }

  if (node.type === COLLISION) {
    if (node.hash !== incoming.hash) {
      change.added = true;
      return mergeHashedNode(shift, node, node.hash, incoming);
    }
    const position = node.entries.findIndex(entry => entry.key === incoming.key);
    if (position < 0) {
      change.added = true;
      return collision(node.hash, [...node.entries, incoming]);
    }
    if (Object.is(node.entries[position].value, incoming.value)) return node;
    const entries = node.entries.slice();
    entries[position] = incoming;
    return collision(node.hash, entries);
  }

  const bit = bitPosition(fragment(incoming.hash, shift));
  const position = childIndex(node.bitmap, bit);
  if ((node.bitmap & bit) === 0) {
    change.added = true;
    const children = node.children.slice();
    children.splice(position, 0, incoming);
    return bitmapNode(node.bitmap | bit, children);
  }

  const previous = node.children[position];
  const next = associate(previous, shift + 5, incoming, change);
  if (next === previous) return node;
  const children = node.children.slice();
  children[position] = next;
  return bitmapNode(node.bitmap, children);
}

function remove(node, shift, hash, key, change) {
  if (node === null) return null;

  if (node.type === LEAF) {
    if (node.hash !== hash || node.key !== key) return node;
    change.removed = true;
    return null;
  }

  if (node.type === COLLISION) {
    if (node.hash !== hash) return node;
    const position = node.entries.findIndex(entry => entry.key === key);
    if (position < 0) return node;
    change.removed = true;
    const entries = node.entries.filter((_, index) => index !== position);
    return entries.length === 1 ? entries[0] : collision(node.hash, entries);
  }

  const bit = bitPosition(fragment(hash, shift));
  if ((node.bitmap & bit) === 0) return node;
  const position = childIndex(node.bitmap, bit);
  const previous = node.children[position];
  const next = remove(previous, shift + 5, hash, key, change);
  if (next === previous) return node;

  if (next !== null) {
    const children = node.children.slice();
    children[position] = next;
    return bitmapNode(node.bitmap, children);
  }

  const bitmap = (node.bitmap & ~bit) >>> 0;
  const children = node.children.slice();
  children.splice(position, 1);
  if (children.length === 0) return null;
  // A non-bitmap child can be promoted because it does not depend on a shift.
  if (children.length === 1 && children[0].type !== BITMAP) return children[0];
  return bitmapNode(bitmap, children);
}

function *walk(node) {
  if (node === null) return;
  if (node.type === LEAF) {
    yield [node.key, node.value];
    return;
  }
  if (node.type === COLLISION) {
    for (const entry of node.entries) yield [entry.key, entry.value];
    return;
  }
  for (const child of node.children) yield *walk(child);
}

class PersistentHashMap {
  constructor(root = null, size = 0, hashFunction = defaultHash) {
    this._root = root;
    this.size = size;
    this._hash = hashFunction;
  }

  _hashKey(key) {
    if (typeof key !== 'string') throw new TypeError('HAMT keys must be strings');
    const hash = this._hash(key);
    if (!Number.isInteger(hash)) throw new TypeError('hash function must return an integer');
    return hash >>> 0;
  }

  has(key) {
    const hash = this._hashKey(key);
    return hasKey(this._root, 0, hash, key);
  }

  get(key) {
    const hash = this._hashKey(key);
    return lookup(this._root, 0, hash, key);
  }

  set(key, value) {
    const hash = this._hashKey(key);
    const change = { added: false };
    const root = associate(this._root, 0, leaf(hash, key, value), change);
    if (root === this._root) return this;
    return new PersistentHashMap(root, this.size + (change.added ? 1 : 0), this._hash);
  }

  delete(key) {
    const hash = this._hashKey(key);
    const change = { removed: false };
    const root = remove(this._root, 0, hash, key, change);
    if (!change.removed) return this;
    return new PersistentHashMap(root, this.size - 1, this._hash);
  }

  *entries() {
    yield *walk(this._root);
  }

  [Symbol.iterator]() {
    return this.entries();
  }

  toObject() {
    return Object.fromEntries(this.entries());
  }
}

function runTests() {
  let map = new PersistentHashMap();
  const empty = map;
  map = map.set('alpha', 1).set('beta', 2).set('gamma', 3);
  assert.equal(empty.size, 0);
  assert.equal(map.size, 3);
  assert.equal(map.get('beta'), 2);
  assert.equal(map.has('missing'), false);

  const updated = map.set('beta', 20);
  assert.equal(updated.size, 3);
  assert.equal(updated.get('beta'), 20);
  assert.equal(map.get('beta'), 2, 'previous version must remain unchanged');
  assert.equal(updated.set('beta', 20), updated, 'identical update is a no-op');

  const deleted = updated.delete('alpha');
  assert.equal(deleted.size, 2);
  assert.equal(deleted.has('alpha'), false);
  assert.equal(updated.has('alpha'), true);
  assert.equal(deleted.delete('not-there'), deleted);
  assert.deepEqual(Object.fromEntries(deleted), { beta: 20, gamma: 3 });

  const collisions = new PersistentHashMap(null, 0, () => 7);
  const crowded = ['a', 'b', 'c', 'd'].reduce((acc, key) => acc.set(key, key.toUpperCase()), collisions);
  assert.equal(crowded.size, 4);
  assert.equal(crowded.get('c'), 'C');
  const afterCollisionDelete = crowded.delete('b');
  assert.deepEqual(Object.fromEntries(afterCollisionDelete), { a: 'A', c: 'C', d: 'D' });
  assert.equal(crowded.has('b'), true);
  const mixedHashes = new PersistentHashMap(null, 0, key => key === 'z' ? 39 : 7);
  const mixed = ['a', 'b', 'c'].reduce((acc, key) => acc.set(key, key), mixedHashes).set('z', 'z');
  assert.deepEqual(new Map(mixed), new Map([['a', 'a'], ['b', 'b'], ['c', 'c'], ['z', 'z']]));
  assert.equal(mixed.delete('z').size, 3, 'splitting a collision node must retain every colliding entry');

  // Deterministic differential test against native Map.
  let seed = 0x12345678;
  const random = max => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % max;
  };
  let persistent = new PersistentHashMap();
  const reference = new Map();
  const versions = [];
  for (let i = 0; i < 1800; i += 1) {
    const key = `key-${random(140)}`;
    if (random(4) === 0) {
      persistent = persistent.delete(key);
      reference.delete(key);
    } else {
      const value = random(10000);
      persistent = persistent.set(key, value);
      reference.set(key, value);
    }
    if (i % 100 === 0) versions.push([persistent, new Map(reference)]);
    assert.equal(persistent.size, reference.size);
    for (const [probe, value] of reference) assert.equal(persistent.get(probe), value);
  }
  for (const [version, snapshot] of versions) {
    assert.equal(version.size, snapshot.size);
    assert.deepEqual(new Map(version), snapshot);
  }

  assert.throws(() => map.get(1), TypeError);
  console.log('Persistent HAMT tests passed');
}

if (require.main === module) runTests();
module.exports = { PersistentHashMap };
