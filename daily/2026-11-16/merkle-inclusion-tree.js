'use strict';

/**
 * Exercise: implement a Merkle inclusion tree with domain-separated hashes.
 *
 * Leaves are SHA-256(0x00 || data), internal nodes are SHA-256(0x01 || left
 * || right). An unpaired final node is promoted unchanged to the next level.
 * Proofs carry only the sibling hashes and their left/right positions.
 *
 * This is an educational, append/rebuild tree (O(n) rebuild), not a streaming
 * Merkle Mountain Range. Inputs are UTF-8 strings or byte arrays.
 */
const { createHash } = require('node:crypto');

function bytesOf(value) {
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return Buffer.from(value);
  throw new TypeError('leaf values must be strings or byte arrays');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function hashLeaf(value) {
  return sha256(Buffer.concat([Buffer.from([0x00]), bytesOf(value)]));
}

function hashPair(leftHex, rightHex) {
  const left = Buffer.from(leftHex, 'hex');
  const right = Buffer.from(rightHex, 'hex');
  if (left.length !== 32 || right.length !== 32) throw new TypeError('invalid SHA-256 node hash');
  return sha256(Buffer.concat([Buffer.from([0x01]), left, right]));
}

class MerkleInclusionTree {
  constructor(leaves = []) {
    if (!Array.isArray(leaves)) throw new TypeError('leaves must be an array');
    this.leaves = leaves.map(value => bytesOf(value));
    this._rebuild();
  }

  _rebuild() {
    if (this.leaves.length === 0) {
      this.levels = [];
      this.root = sha256(Buffer.from([0x02])); // distinct empty-tree domain
      return;
    }
    const levels = [this.leaves.map(hashLeaf)];
    while (levels[levels.length - 1].length > 1) {
      const current = levels[levels.length - 1];
      const next = [];
      for (let i = 0; i < current.length; i += 2) {
        next.push(i + 1 < current.length ? hashPair(current[i], current[i + 1]) : current[i]);
      }
      levels.push(next);
    }
    this.levels = levels;
    this.root = levels[levels.length - 1][0];
  }

  get size() { return this.leaves.length; }
  getRoot() { return this.root; }

  append(value) {
    this.leaves.push(bytesOf(value));
    this._rebuild();
    return this.size - 1;
  }

  update(index, value) {
    this._assertIndex(index);
    this.leaves[index] = bytesOf(value);
    this._rebuild();
    return this.root;
  }

  _assertIndex(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.size) {
      throw new RangeError('leaf index is out of range');
    }
  }

  getProof(index) {
    this._assertIndex(index);
    const proof = [];
    let position = index;
    for (let level = 0; level < this.levels.length - 1; level++) {
      const nodes = this.levels[level];
      const sibling = position ^ 1;
      if (sibling < nodes.length) {
        proof.push({ side: sibling < position ? 'left' : 'right', hash: nodes[sibling] });
      }
      position = Math.floor(position / 2);
    }
    return proof;
  }

  verify(value, proof, expectedRoot = this.root) {
    return MerkleInclusionTree.verifyProof(value, proof, expectedRoot);
  }

  static verifyProof(value, proof, expectedRoot) {
    if (!Array.isArray(proof) || typeof expectedRoot !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedRoot)) {
      return false;
    }
    let current;
    try { current = hashLeaf(value); } catch { return false; }
    for (const step of proof) {
      if (!step || !/^[a-f0-9]{64}$/i.test(step.hash) ||
          (step.side !== 'left' && step.side !== 'right')) return false;
      try {
        current = step.side === 'left'
          ? hashPair(step.hash, current)
          : hashPair(current, step.hash);
      } catch { return false; }
    }
    return current === expectedRoot.toLowerCase();
  }
}

module.exports = { MerkleInclusionTree };

if (require.main === module) {
  const assert = require('node:assert/strict');
  const empty = new MerkleInclusionTree();
  assert.equal(empty.size, 0);
  assert.equal(empty.getRoot().length, 64);
  assert.throws(() => empty.getProof(0), RangeError);

  for (let count = 1; count <= 10; count++) {
    const leaves = Array.from({ length: count }, (_, i) => `record-${i}`);
    const tree = new MerkleInclusionTree(leaves);
    for (let i = 0; i < count; i++) {
      const proof = tree.getProof(i);
      assert.equal(tree.verify(leaves[i], proof), true, `proof ${i}/${count}`);
      assert.equal(tree.verify(`tampered-${i}`, proof), false);
    }
  }

  const tree = new MerkleInclusionTree(['a', 'b', 'c']);
  const oldRoot = tree.getRoot();
  const proof = tree.getProof(2); // odd final node is promoted without a sibling
  assert.equal(tree.verify('c', proof, oldRoot), true);
  tree.update(1, 'changed');
  assert.notEqual(tree.getRoot(), oldRoot);
  assert.equal(MerkleInclusionTree.verifyProof('c', proof, oldRoot), true);
  assert.equal(tree.append('d'), 3);
  assert.equal(tree.size, 4);
  assert.throws(() => tree.update(9, 'x'), RangeError);
  assert.equal(MerkleInclusionTree.verifyProof('x', [{ side: 'up', hash: 'bad' }], oldRoot), false);
  console.log('Merkle inclusion tree tests passed');
}
