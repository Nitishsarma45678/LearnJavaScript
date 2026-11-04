'use strict';

const assert = require('node:assert/strict');

function keyToken(key) {
  if (key === null) return 'null:';
  switch (typeof key) {
    case 'string': return 'string:' + key;
    case 'number':
      if (Number.isNaN(key)) return 'number:NaN';
      return 'number:' + (key === 0 ? '0' : String(key));
    case 'bigint': return 'bigint:' + key.toString();
    case 'boolean': return 'boolean:' + String(key);
    case 'undefined': return 'undefined:';
    default: throw new TypeError('HAMT keys must be supported primitive values');
  }
}

function hashToken(token) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function bitCount(value) {
  let x = value >>> 0;
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

const leaf = (hash, token, key, value) => ({ type: 'leaf', hash, token, key, value });
const bitmapNode = (bitmap, children) => ({ type: 'bitmap', bitmap: bitmap >>> 0, children });
const collisionNode = (hash, entries) => ({ type: 'collision', hash, entries });

function mergeNodes(a, b, shift) {
  const indexA = (a.hash >>> shift) & 31;
  const indexB = (b.hash >>> shift) & 31;
  const bitA = (1 << indexA) >>> 0;
  const bitB = (1 << indexB) >>> 0;
  if (indexA === indexB) return bitmapNode(bitA, [mergeNodes(a, b, shift + 5)]);
  return indexA < indexB
    ? bitmapNode((bitA | bitB) >>> 0, [a, b])
    : bitmapNode((bitA | bitB) >>> 0, [b, a]);
}

function findLeaf(node, hash, token, shift = 0) {
  if (node === null) return null;
  if (node.type === 'leaf') return node.hash === hash && node.token === token ? node : null;
  if (node.type === 'collision') {
    if (node.hash !== hash) return null;
    return node.entries.find(entry => entry.token === token) || null;
  }
  const index = (hash >>> shift) & 31;
  const bit = (1 << index) >>> 0;
  if ((node.bitmap & bit) === 0) return null;
  const offset = bitCount(node.bitmap & (bit - 1));
  return findLeaf(node.children[offset], hash, token, shift + 5);
}

function associate(node, incoming, shift = 0) {
  if (node === null) return { node: incoming, added: true, changed: true };

  if (node.type === 'leaf') {
    if (node.token === incoming.token) {
      if (Object.is(node.value, incoming.value)) return { node, added: false, changed: false };
      return { node: incoming, added: false, changed: true };
    }
    if (node.hash === incoming.hash) {
      return { node: collisionNode(node.hash, [node, incoming]), added: true, changed: true };
    }
    return { node: mergeNodes(node, incoming, shift), added: true, changed: true };
  }

  if (node.type === 'collision') {
    if (node.hash !== incoming.hash) {
      return { node: mergeNodes(node, incoming, shift), added: true, changed: true };
    }
    const index = node.entries.findIndex(entry => entry.token === incoming.token);
    if (index === -1) {
      return { node: collisionNode(node.hash, [...node.entries, incoming]), added: true, changed: true };
    }
    if (Object.is(node.entries[index].value, incoming.value)) {
      return { node, added: false, changed: false };
    }
    const entries = node.entries.slice();
    entries[index] = incoming;
    return { node: collisionNode(node.hash, entries), added: false, changed: true };
  }

  const index = (incoming.hash >>> shift) & 31;
  const bit = (1 << index) >>> 0;
  const offset = bitCount(node.bitmap & (bit - 1));
  if ((node.bitmap & bit) === 0) {
    const children = node.children.slice();
    children.splice(offset, 0, incoming);
    return { node: bitmapNode(node.bitmap | bit, children), added: true, changed: true };
  }

  const result = associate(node.children[offset], incoming, shift + 5);
  if (!result.changed) return { node, added: false, changed: false };
  const children = node.children.slice();
  children[offset] = result.node;
  return { node: bitmapNode(node.bitmap, children), added: result.added, changed: true };
}

function dissociate(node, hash, token, shift = 0) {
  if (node === null) return { node: null, removed: false };
  if (node.type === 'leaf') {
    return node.hash === hash && node.token === token
      ? { node: null, removed: true }
      : { node, removed: false };
  }

  if (node.type === 'collision') {
    if (node.hash !== hash) return { node, removed: false };
    const index = node.entries.findIndex(entry => entry.token === token);
    if (index === -1) return { node, removed: false };
    const entries = node.entries.filter((_, i) => i !== index);
    return {
      node: entries.length === 1 ? entries[0] : collisionNode(hash, entries),
      removed: true
    };
  }

  const index = (hash >>> shift) & 31;
  const bit = (1 << index) >>> 0;
  if ((node.bitmap & bit) === 0) return { node, removed: false };
  const offset = bitCount(node.bitmap & (bit - 1));
  const result = dissociate(node.children[offset], hash, token, shift + 5);
  if (!result.removed) return { node, removed: false };

  const children = node.children.slice();
  let bitmap = node.bitmap;
  if (result.node === null) {
    children.splice(offset, 1);
    bitmap = (bitmap & ~bit) >>> 0;
  } else {
    children[offset] = result.node;
  }

  if (children.length === 0) return { node: null, removed: true };
  if (children.length === 1 &&
      (children[0].type === 'leaf' || children[0].type === 'collision')) {
    return { node: children[0], removed: true };
  }
  return { node: bitmapNode(bitmap, children), removed: true };
}

function collectEntries(node, output) {
  if (node === null) return;
  if (node.type === 'leaf') output.push([node.key, node.value]);
  else if (node.type === 'collision') {
    for (const entry of node.entries) output.push([entry.key, entry.value]);
  } else {
    for (const child of node.children) collectEntries(child, output);
  }
}

class PersistentHamtMap {
  constructor(root = null, size = 0) {
    this._root = root;
    this.size = size;
  }
  has(key) {
    const token = keyToken(key);
    return findLeaf(this._root, hashToken(token), token) !== null;
  }
  get(key) {
    const token = keyToken(key);
    const found = findLeaf(this._root, hashToken(token), token);
    return found === null ? undefined : found.value;
  }
  set(key, value) {
    const token = keyToken(key);
    const incoming = leaf(hashToken(token), token, key, value);
    const result = associate(this._root, incoming);
    if (!result.changed) return this;
    return new PersistentHamtMap(result.node, this.size + (result.added ? 1 : 0));
  }
  delete(key) {
    const token = keyToken(key);
    const result = dissociate(this._root, hashToken(token), token);
    return result.removed ? new PersistentHamtMap(result.node, this.size - 1) : this;
  }
  entries() {
    const output = [];
    collectEntries(this._root, output);
    return output[Symbol.iterator]();
  }
  [Symbol.iterator]() {
    return this.entries();
  }
}

let original = new PersistentHamtMap();
for (let i = 0; i < 300; i++) original = original.set('key-' + i, i);
const newer = original.set('key-150', 999).set('new-key', 301);
assert.equal(original.get('key-150'), 150);
assert.equal(newer.get('key-150'), 999);
assert.equal(newer.size, 301);
assert.equal(newer.delete('missing'), newer);
assert.equal(newer.delete('new-key').has('new-key'), false);
assert.equal(newer.has('new-key'), true);

// These keys deliberately collide under the map's FNV-1a token hash.
const collisionMap = new PersistentHamtMap()
  .set('vwXmo3FC', 'first')
  .set('ioSMtz78', 'second');
assert.equal(collisionMap.get('vwXmo3FC'), 'first');
assert.equal(collisionMap.get('ioSMtz78'), 'second');
assert.equal(collisionMap.delete('vwXmo3FC').get('ioSMtz78'), 'second');

const primitives = new PersistentHamtMap()
  .set(null, 'null')
  .set(undefined, 'undefined')
  .set(0, 'zero')
  .set(-0, 'updated zero')
  .set(NaN, 'not-a-number')
  .set(12n, 'bigint')
  .set(false, 'false');
assert.equal(primitives.size, 6);
assert.equal(primitives.get(0), 'updated zero');
assert.equal(primitives.get(-0), 'updated zero');
assert.equal(primitives.get(NaN), 'not-a-number');
assert.equal(primitives.get(null), 'null');
assert.equal(primitives.get(undefined), 'undefined');
assert.throws(() => primitives.set({}, 'unsupported'), TypeError);

const snapshotEntries = [...newer].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
assert.equal(snapshotEntries.length, newer.size);

console.log('Persistent HAMT map tests passed');