/**
 * Binary SHA-256 Merkle tree with inclusion proofs.
 *
 * Leaves are domain-separated with 0x00 and internal nodes with 0x01.
 * An odd node is paired with itself. Empty trees have a dedicated root hash.
 * Inputs may be strings, Buffers, or Uint8Arrays.
 *
 * Run: node merkle-tree-inclusion-proofs.js
 */
"use strict";

const crypto = require("node:crypto");
const LEAF_PREFIX = Buffer.from([0x00]);
const NODE_PREFIX = Buffer.from([0x01]);
const EMPTY_PREFIX = Buffer.from([0x02]);

function toBytes(value) {
  if (typeof value === "string") return Buffer.from(value, "utf8");
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return Buffer.from(value);
  throw new TypeError("Merkle leaves must be strings, Buffers, or Uint8Arrays");
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest();
}

function hashLeaf(value) {
  return sha256(Buffer.concat([LEAF_PREFIX, toBytes(value)]));
}

function hashPair(left, right) {
  return sha256(Buffer.concat([NODE_PREFIX, left, right]));
}

function isHashHex(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

class MerkleTree {
  constructor(values) {
    if (!Array.isArray(values)) throw new TypeError("MerkleTree expects an array");
    this.leafCount = values.length;
    this.levels = [values.map(hashLeaf)];
    while (this.levels[this.levels.length - 1].length > 1) {
      const previous = this.levels[this.levels.length - 1];
      const next = [];
      for (let i = 0; i < previous.length; i += 2) {
        const left = previous[i];
        const right = previous[i + 1] || left;
        next.push(hashPair(left, right));
      }
      this.levels.push(next);
    }
    this.emptyRoot = sha256(EMPTY_PREFIX);
  }

  get root() {
    const top = this.levels[this.levels.length - 1];
    return (top.length ? top[0] : this.emptyRoot).toString("hex");
  }

  get height() {
    return this.leafCount === 0 ? 0 : this.levels.length - 1;
  }

  getProof(index) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.leafCount) {
      throw new RangeError("Leaf index is outside the tree");
    }
    const proof = [];
    let position = index;
    for (let level = 0; level < this.levels.length - 1; level++) {
      const nodes = this.levels[level];
      const siblingIndex = position ^ 1;
      const sibling = nodes[siblingIndex] || nodes[position];
      proof.push({
        side: position % 2 === 0 ? "right" : "left",
        hash: sibling.toString("hex")
      });
      position = Math.floor(position / 2);
    }
    return { index, leafCount: this.leafCount, proof };
  }

  static verify(value, proofBundle, expectedRoot) {
    try {
      if (!proofBundle || !Number.isSafeInteger(proofBundle.index) ||
          !Number.isSafeInteger(proofBundle.leafCount) ||
          proofBundle.leafCount < 1 || proofBundle.index < 0 ||
          proofBundle.index >= proofBundle.leafCount ||
          !Array.isArray(proofBundle.proof) || !isHashHex(expectedRoot)) {
        return false;
      }

      let expectedSteps = 0;
      for (let width = proofBundle.leafCount; width > 1; width = Math.ceil(width / 2)) {
        expectedSteps++;
      }
      if (proofBundle.proof.length !== expectedSteps) return false;

      let current = hashLeaf(value);
      let position = proofBundle.index;
      let width = proofBundle.leafCount;

      for (const step of proofBundle.proof) {
        if (!step || !isHashHex(step.hash)) return false;
        const isLeftChild = position % 2 === 0;
        const requiredSide = isLeftChild ? "right" : "left";
        if (step.side !== requiredSide) return false;

        const sibling = Buffer.from(step.hash, "hex");
        if (isLeftChild && position + 1 >= width && !sibling.equals(current)) {
          return false;
        }
        current = isLeftChild
          ? hashPair(current, sibling)
          : hashPair(sibling, current);
        position = Math.floor(position / 2);
        width = Math.ceil(width / 2);
      }
      return current.toString("hex") === expectedRoot.toLowerCase();
    } catch {
      return false;
    }
  }
}

function runTests() {
  const assert = require("node:assert/strict");
  const leaves = ["alpha", "beta", "gamma", "delta", "epsilon"];
  const tree = new MerkleTree(leaves);
  assert.equal(tree.leafCount, 5);
  assert.equal(tree.height, 3);
  assert.equal(/^[0-9a-f]{64}$/.test(tree.root), true);
  for (let index = 0; index < leaves.length; index++) {
    const proof = tree.getProof(index);
    assert.equal(MerkleTree.verify(leaves[index], proof, tree.root), true);
    assert.equal(MerkleTree.verify(leaves[index] + "!", proof, tree.root), false);
  }

  const oddProof = tree.getProof(4);
  assert.equal(oddProof.proof[0].hash, tree.levels[0][4].toString("hex"));
  const tampered = structuredClone(tree.getProof(2));
  tampered.proof[0].hash = "0".repeat(64);
  assert.equal(MerkleTree.verify("gamma", tampered, tree.root), false);
  const wrongSide = structuredClone(tree.getProof(1));
  wrongSide.proof[0].side = "right";
  assert.equal(MerkleTree.verify("beta", wrongSide, tree.root), false);

  const one = new MerkleTree([Buffer.from([0, 255, 1])]);
  assert.equal(one.height, 0);
  assert.equal(MerkleTree.verify(new Uint8Array([0, 255, 1]), one.getProof(0), one.root), true);
  const empty = new MerkleTree([]);
  assert.equal(empty.root, new MerkleTree([]).root);
  assert.equal(empty.height, 0);
  assert.throws(() => empty.getProof(0), RangeError);
  assert.equal(MerkleTree.verify("x", { index: 0, leafCount: 0, proof: [] }, empty.root), false);
  assert.throws(() => new MerkleTree("not an array"), TypeError);
  assert.throws(() => new MerkleTree([42]), TypeError);

  for (let count = 1; count <= 35; count++) {
    const items = Array.from({ length: count }, (_, i) => "item-" + count + "-" + i);
    const candidate = new MerkleTree(items);
    for (let i = 0; i < count; i++) {
      assert.equal(MerkleTree.verify(items[i], candidate.getProof(i), candidate.root), true);
    }
  }
  return { passed: 25 + 630, randomizedLeafCounts: 35 };
}

if (typeof require !== "undefined" && require.main === module) {
  const result = runTests();
  console.log("Merkle proofs: " + result.passed + " checks passed");
}
if (typeof module !== "undefined") {
  module.exports = { MerkleTree, hashLeaf, hashPair, runTests };
}
