'use strict';

/**
 * Persistent Hash Array Mapped Trie (HAMT) for string keys.
 *
 * Updates return new maps and reuse untouched trie branches. Five hash bits are
 * consumed per level, yielding a 32-way bitmap-indexed node. Equal 32-bit hashes
 * are stored in collision nodes. This is an educational immutable map, not a
 * cryptographic hash table; callers may inject a hash function for testing.
 */

const assert = require('node:assert/strict');

const LEAF = 0;
const COLLISION = 1;
const BITMAP = 2;

function hashString(key) {
  let hash = 0x811c9dc5;
  for (const character of key) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function popcount32(value) {
  value >>>= 0;
  value -= (value >>> 1) & 0x55555555;
  value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
  return (((value + (value >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function leaf(hash, key, value) {
  return Object.freeze({ type: LEAF, hash, key, value });
}
function collision(hash, entries) {
  return Object.freeze({ type: COLLISION, hash, entries: Object.freeze(entries) });
}
function bitmapNode(bitmap, children) {
  return Object.freeze({ type: BITMAP, bitmap: bitmap >>> 0, children: Object.freeze(children) });
}
function nodeHash(node) { return node.hash; }

function mergeNodes(shift, left, right) {
  const leftHash = nodeHash(left);
  const rightHash = nodeHash(right);
  if (leftHash === rightHash) {
    const entries = [];
    const append = node => {
      if (node.type === LEAF) entries.push([node.key, node.value]);
      else if (node.type === COLLISION) entries.push(...node.entries);
      else throw new Error('Cannot merge bitmap nodes with identical full hashes');
    };
    append(left);
    append(right);
    return collision(leftHash, entries);
  }
  const leftIndex = (leftHash >>> shift) & 31;
  const rightIndex = (rightHash >>> shift) & 31;
  const leftBit = (1 << leftIndex) >>> 0;
  const rightBit = (1 << rightIndex) >>> 0;
  if (leftIndex === rightIndex) {
    return bitmapNode(leftBit, [mergeNodes(shift + 5, left, right)]);
  }
  return leftIndex < rightIndex
    ? bitmapNode((leftBit | rightBit) >>> 0, [left, right])
    : bitmapNode((leftBit | rightBit) >>> 0, [right, left]);
}

function assoc(node, shift, incoming) {
  if (node === null) return { node: incoming, added: true };
  if (node.type === LEAF) {
    if (node.hash === incoming.hash && node.key === incoming.key) {
      if (Object.is(node.value, incoming.value)) return { node, added: false };
      return { node: incoming, added: false };
    }
    if (node.hash === incoming.hash) {
      return { node: collision(node.hash, [[node.key, node.value], [incoming.key, incoming.value]]), added: true };
    }
    return { node: mergeNodes(shift, node, incoming), added: true };
  }
  if (node.type === COLLISION) {
    if (node.hash !== incoming.hash) return { node: mergeNodes(shift, node, incoming), added: true };
    const index = node.entries.findIndex(([key]) => key === incoming.key);
    const entries = node.entries.slice();
    if (index === -1) {
      entries.push([incoming.key, incoming.value]);
      return { node: collision(node.hash, entries), added: true };
    }
    if (Object.is(entries[index][1], incoming.value)) return { node, added: false };
    entries[index] = [incoming.key, incoming.value];
    return { node: collision(node.hash, entries), added: false };
  }

  const index = (incoming.hash >>> shift) & 31;
  const bit = (1 << index) >>> 0;
  const position = popcount32(node.bitmap & (bit - 1));
  if ((node.bitmap & bit) === 0) {
    const children = node.children.slice();
    children.splice(position, 0, incoming);
    return { node: bitmapNode(node.bitmap | bit, children), added: true };
  }
  const result = assoc(node.children[position], shift + 5, incoming);
  if (result.node === node.children[position]) return { node, added: result.added };
  const children = node.children.slice();
  children[position] = result.node;
  return { node: bitmapNode(node.bitmap, children), added: result.added };
}

function find(node, shift, hash, key) {
  if (node === null) return { found: false, value: undefined };
  if (node.type === LEAF) {
    return node.hash === hash && node.key === key
      ? { found: true, value: node.value }
      : { found: false, value: undefined };
  }
  if (node.type === COLLISION) {
    if (node.hash !== hash) return { found: false, value: undefined };
    const entry = node.entries.find(([candidate]) => candidate === key);
    return entry ? { found: true, value: entry[1] } : { found: false, value: undefined };
  }
  const bit = (1 << ((hash >>> shift) & 31)) >>> 0;
  if ((node.bitmap & bit) === 0) return { found: false, value: undefined };
  const position = popcount32(node.bitmap & (bit - 1));
  return find(node.children[position], shift + 5, hash, key);
}

function dissoc(node, shift, hash, key) {
  if (node === null) return { node, removed: false };
  if (node.type === LEAF) {
    return node.hash === hash && node.key === key
      ? { node: null, removed: true }
      : { node, removed: false };
  }
  if (node.type === COLLISION) {
    if (node.hash !== hash) return { node, removed: false };
    const index = node.entries.findIndex(([candidate]) => candidate === key);
    if (index === -1) return { node, removed: false };
    const entries = node.entries.slice();
    entries.splice(index, 1);
    if (entries.length === 1) return { node: leaf(hash, entries[0][0], entries[0][1]), removed: true };
    return { node: collision(hash, entries), removed: true };
  }

  const bit = (1 << ((hash >>> shift) & 31)) >>> 0;
  if ((node.bitmap & bit) === 0) return { node, removed: false };
  const position = popcount32(node.bitmap & (bit - 1));
  const result = dissoc(node.children[position], shift + 5, hash, key);
  if (!result.removed) return { node, removed: false };
  const children = node.children.slice();
  let bitmap = node.bitmap;
  if (result.node === null) {
    children.splice(position, 1);
    bitmap = (bitmap & ~bit) >>> 0;
  } else {
    children[position] = result.node;
  }
  if (children.length === 0) return { node: null, removed: true };
  if (children.length === 1 && children[0].type !== BITMAP) {
    return { node: children[0], removed: true };
  }
  return { node: bitmapNode(bitmap, children), removed: true };
}

function* walk(node) {
  if (node === null) return;
  if (node.type === LEAF) {
    yield [node.key, node.value];
  } else if (node.type === COLLISION) {
    yield* node.entries;
  } else {
    for (const child of node.children) yield* walk(child);
  }
}

class PersistentHamtMap {
  constructor(root = null, size = 0, hashFn = hashString) {
    this._root = root;
    this.size = size;
    this._hashFn = hashFn;
    Object.freeze(this);
  }
  _hash(key) {
    if (typeof key !== 'string') throw new TypeError('PersistentHamtMap keys must be strings');
    const value = this._hashFn(key);
    if (!Number.isInteger(value)) throw new TypeError('Hash function must return an integer');
    return value >>> 0;
  }
  has(key) { return find(this._root, 0, this._hash(key), key).found; }
  get(key, fallback = undefined) {
    const result = find(this._root, 0, this._hash(key), key);
    return result.found ? result.value : fallback;
  }
  set(key, value) {
    const result = assoc(this._root, 0, leaf(this._hash(key), key, value));
    if (result.node === this._root) return this;
    return new PersistentHamtMap(result.node, this.size + (result.added ? 1 : 0), this._hashFn);
  }
  delete(key) {
    const result = dissoc(this._root, 0, this._hash(key), key);
    return result.removed
      ? new PersistentHamtMap(result.node, this.size - 1, this._hashFn)
      : this;
  }
  *entries() { yield* walk(this._root); }
  *keys() { for (const [key] of this.entries()) yield key; }
  *values() { for (const [, value] of this.entries()) yield value; }
  [Symbol.iterator]() { return this.entries(); }
  forEach(callback, thisArg) {
    if (typeof callback !== 'function') throw new TypeError('callback must be a function');
    for (const [key, value] of this.entries()) callback.call(thisArg, value, key, this);
  }
}

function runTests() {
  const empty = new PersistentHamtMap();
  const one = empty.set('alpha', 1);
  const two = one.set('beta', 2).set('gamma', 3);
  assert.equal(empty.size, 0);
  assert.equal(one.get('alpha'), 1);
  assert.equal(one.has('beta'), false);
  assert.deepEqual([...two].sort(), [['alpha', 1], ['beta', 2], ['gamma', 3]]);
  assert.equal(two.set('alpha', 1), two, 'identical value update should preserve identity');
  assert.equal(two.delete('missing'), two);
  assert.equal(two.delete('beta').has('beta'), false);
  assert.equal(two.has('beta'), true, 'older snapshots must remain unchanged');

  const forcedCollision = new PersistentHamtMap(null, 0, () => 42)
    .set('north', 1).set('south', 2).set('east', 3).set('west', 4);
  assert.equal(forcedCollision.size, 4);
  assert.equal(forcedCollision.get('west'), 4);
  const afterCollisionDelete = forcedCollision.delete('south').delete('north');
  assert.equal(afterCollisionDelete.get('east'), 3);
  assert.equal(afterCollisionDelete.get('west'), 4);
  assert.equal(forcedCollision.get('south'), 2);

  let seed = 0xdecafbad;
  const random = () => ((seed = (1103515245 * seed + 12345) >>> 0) / 0x100000000);
  let persistent = new PersistentHamtMap();
  const reference = new Map();
  const snapshots = [];
  for (let step = 0; step < 2500; step++) {
    const key = `key-${Math.floor(random() * 180)}`;
    if (random() < 0.68) {
      const value = Math.floor(random() * 10000);
      persistent = persistent.set(key, value);
      reference.set(key, value);
    } else {
      persistent = persistent.delete(key);
      reference.delete(key);
    }
    if (step % 250 === 0) snapshots.push([persistent, new Map(reference)]);
    assert.equal(persistent.size, reference.size);
    for (const [candidate, value] of reference) assert.equal(persistent.get(candidate), value);
  }
  for (const [snapshot, expected] of snapshots) {
    assert.equal(snapshot.size, expected.size);
    for (const [key, value] of expected) assert.equal(snapshot.get(key), value);
  }
  assert.throws(() => persistent.set(12, 'no'), /string/);
  console.log('Persistent HAMT Map: all tests passed');
}

if (require.main === module) runTests();
module.exports = { PersistentHamtMap, hashString, popcount32, runTests };
