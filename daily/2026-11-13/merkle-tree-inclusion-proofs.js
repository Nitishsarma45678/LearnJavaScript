'use strict';

/*
 * Exercise: Build a domain-separated SHA-256 Merkle tree.
 *
 * Leaves are hashed as H(0x00 || data), internal nodes as
 * H(0x01 || leftHash || rightHash). For non-power-of-two leaf counts,
 * each subtree is split at the largest power of two smaller than its size.
 *
 * Produce compact inclusion proofs and verify both the hashes and the
 * proof's left/right shape for the claimed leaf index and tree size.
 */

const assert = require('node:assert/strict');
const { createHash, timingSafeEqual } = require('node:crypto');

function toBytes(value) {
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  throw new TypeError('leaf data must be a string, Buffer, or Uint8Array');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function hashLeaf(value) {
  return sha256(Buffer.concat([Buffer.from([0]), toBytes(value)]));
}

function isHash(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}

function hashNode(leftHex, rightHex) {
  if (!isHash(leftHex) || !isHash(rightHex)) {
    throw new TypeError('internal nodes require two SHA-256 hashes');
  }
  return sha256(Buffer.concat([
    Buffer.from([1]),
    Buffer.from(leftHex, 'hex'),
    Buffer.from(rightHex, 'hex')
  ]));
}

function splitPoint(size) {
  if (!Number.isInteger(size) || size < 2) {
    throw new RangeError('splitPoint requires a size of at least two');
  }
  let power = 1;
  while (power * 2 < size) power *= 2;
  return power;
}

function rootFromHashes(hashes) {
  if (hashes.length === 0) return sha256(Buffer.alloc(0));
  if (hashes.length === 1) return hashes[0];
  const split = splitPoint(hashes.length);
  return hashNode(
    rootFromHashes(hashes.slice(0, split)),
    rootFromHashes(hashes.slice(split))
  );
}

function expectedProofSides(index, total) {
  if (total <= 1) return [];
  const split = splitPoint(total);
  if (index < split) {
    return expectedProofSides(index, split).concat('right');
  }
  return expectedProofSides(index - split, total - split).concat('left');
}

class MerkleTree {
  constructor(leaves = []) {
    if (!Array.isArray(leaves)) throw new TypeError('leaves must be an array');
    this.leaves = leaves.map(toBytes);
    this.leafHashes = this.leaves.map(hashLeaf);
    this.root = rootFromHashes(this.leafHashes);
  }

  get size() {
    return this.leaves.length;
  }

  getInclusionProof(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.size) {
      throw new RangeError('leaf index is outside the tree');
    }

    const build = (start, count, localIndex) => {
      if (count === 1) return [];
      const split = splitPoint(count);

      if (localIndex < split) {
        const path = build(start, split, localIndex);
        const siblingRoot = rootFromHashes(
          this.leafHashes.slice(start + split, start + count)
        );
        path.push({ side: 'right', hash: siblingRoot });
        return path;
      }

      const path = build(start + split, count - split, localIndex - split);
      const siblingRoot = rootFromHashes(
        this.leafHashes.slice(start, start + split)
      );
      path.push({ side: 'left', hash: siblingRoot });
      return path;
    };

    return {
      index,
      total: this.size,
      steps: build(0, this.size, index)
    };
  }

  static verifyInclusion(data, proof, expectedRoot) {
    try {
      if (!proof || !Number.isInteger(proof.index) ||
          !Number.isInteger(proof.total) || proof.total <= 0 ||
          proof.index < 0 || proof.index >= proof.total ||
          !Array.isArray(proof.steps) || !isHash(expectedRoot)) {
        return false;
      }

      const sides = expectedProofSides(proof.index, proof.total);
      if (sides.length !== proof.steps.length) return false;

      let computed = hashLeaf(data);
      for (let index = 0; index < proof.steps.length; index += 1) {
        const step = proof.steps[index];
        if (!step || step.side !== sides[index] || !isHash(step.hash)) {
          return false;
        }
        computed = step.side === 'left'
          ? hashNode(step.hash, computed)
          : hashNode(computed, step.hash);
      }

      return timingSafeEqual(
        Buffer.from(computed, 'hex'),
        Buffer.from(expectedRoot, 'hex')
      );
    } catch {
      return false;
    }
  }
}

// Example usage and tests.
function runTests() {
  const tree = new MerkleTree(['alpha', 'beta', 'gamma', 'delta', 'epsilon']);
  assert.equal(tree.size, 5);
  for (let index = 0; index < tree.size; index += 1) {
    const proof = tree.getInclusionProof(index);
    assert.equal(
      MerkleTree.verifyInclusion(tree.leaves[index], proof, tree.root),
      true
    );
  }

  const betaProof = tree.getInclusionProof(1);
  assert.equal(MerkleTree.verifyInclusion('beta', betaProof, tree.root), true);
  assert.equal(MerkleTree.verifyInclusion('BETA', betaProof, tree.root), false);
  assert.equal(MerkleTree.verifyInclusion('beta', betaProof, '0'.repeat(64)), false);

  const changedHash = {
    ...betaProof,
    steps: betaProof.steps.map((step, index) =>
      index === 0 ? { ...step, hash: 'f'.repeat(64) } : { ...step }
    )
  };
  assert.equal(MerkleTree.verifyInclusion('beta', changedHash, tree.root), false);

  const changedShape = {
    ...betaProof,
    steps: betaProof.steps.map(step => ({
      ...step,
      side: step.side === 'left' ? 'right' : 'left'
    }))
  };
  assert.equal(MerkleTree.verifyInclusion('beta', changedShape, tree.root), false);
  assert.throws(() => tree.getInclusionProof(-1), RangeError);
  assert.throws(() => new MerkleTree('not-an-array'), TypeError);
  assert.throws(() => new MerkleTree([42]), TypeError);

  // Exercise every tree shape, including singleton, powers of two and
  // uneven right-hand subtrees.
  for (let size = 1; size <= 40; size += 1) {
    const leaves = Array.from({ length: size }, (_, index) =>
      'record:' + size + ':' + index
    );
    const current = new MerkleTree(leaves);
    for (let index = 0; index < size; index += 1) {
      const proof = current.getInclusionProof(index);
      assert.equal(
        MerkleTree.verifyInclusion(leaves[index], proof, current.root),
        true,
        'failed for size ' + size + ' at index ' + index
      );
      assert.equal(
        MerkleTree.verifyInclusion(leaves[index] + 'tampered', proof, current.root),
        false
      );
    }
  }

  const empty = new MerkleTree([]);
  assert.equal(empty.size, 0);
  assert.equal(empty.root.length, 64);
  assert.equal(MerkleTree.verifyInclusion('anything', {
    index: 0, total: 0, steps: []
  }, empty.root), false);

  const binary = new MerkleTree([Buffer.from([0, 255]), new Uint8Array([1, 2])]);
  assert.equal(
    MerkleTree.verifyInclusion(Buffer.from([0, 255]), binary.getInclusionProof(0), binary.root),
    true
  );

  console.log('MerkleTree: all tests passed');
}

if (require.main === module) runTests();

module.exports = { MerkleTree, hashLeaf, hashNode };
