'use strict';

/**
 * Persistent AVL rope for editing large strings without copying the whole text.
 * Leaves hold short chunks; internal nodes cache subtree length and height.
 * Every edit returns a new Rope and shares untouched subtrees with old versions.
 */
const LEAF_LIMIT = 32;

function height(tree) { return tree ? tree.height : 0; }
function length(tree) { return tree ? tree.length : 0; }
function leaf(text) {
  return text.length === 0 ? null : { type: 'leaf', text, length: text.length, height: 1 };
}
function branch(left, right) {
  if (!left) return right;
  if (!right) return left;
  return { type: 'branch', left, right, length: length(left) + length(right), height: 1 + Math.max(height(left), height(right)) };
}
function rotateRight(root) {
  const pivot = root.left;
  return branch(pivot.left, branch(pivot.right, root.right));
}
function rotateLeft(root) {
  const pivot = root.right;
  return branch(branch(root.left, pivot.left), pivot.right);
}
function balance(root) {
  if (!root || root.type === 'leaf') return root;
  const factor = height(root.left) - height(root.right);
  if (factor > 1) {
    if (height(root.left.left) < height(root.left.right)) {
      root = branch(rotateLeft(root.left), root.right);
    }
    return rotateR, rightTree.left), rightTree.right));
  }
  return branch(leftTree, rightTree);
}

function build(text) {
  if (!text) return null;
  const leaves = [];
  for (let i = 0; i < text.length; i += LEAF_LIMIT) leaves.push(leaf(text.slice(i, i + LEAF_LIMIT)));
  while (leaves.length > 1) {
    const next = [];
    for (let i = 0; i < leaves.length; i += 2) {
      next.push(i + 1 < leaves.length ? branch(leaves[i], leaves[i + 1]) : leaves[i]);
    }
    leaves.splice(0, leaves.length, ...next);
  }
  return leaves[0];
}

function split(tree, index) {
  if (!tree) return [null, null];
  if (index <= 0) return [null, tree];
  if (index >= tree.length) return [tree, null];
  if (tree.type === 'leaf') return [leaf(tree.text.slice(0, index)), leaf(tree.text.slice(index))];
  const leftLength = length(tree.left);
  if (index < leftLength) {
    const [a, b] = split(tree.left, index);
    return [a, concat(b, tree.right)];
  }
  if (index > leftLength) {
    const [a, b] = split(tree.right, index - leftLength);
    return [concat(tree.left, a), b];
  }
  return [tree.left, tree.right];
}

function appendText(tree, parts) {
  if (!tree) return;
  if (tree.type === 'leaf') parts.push(tree.text);
  else { appendText(tree.left, parts); appendText(tree.right, parts); }
}
function clampIndex(index, max) {
  if (!Number.isInteger(index)) throw new TypeError('index must be an integer');
  return Math.max(0, Math.min(max, index < 0 ? max + index : index));
}

class Rope {
  constructor(text = '') {
    if (typeof text !== 'string') throw new TypeError('Rope input must be a string');
    this.root = build(text);
    Object.freeze(this);
  }
  static fromRoot(root) {
    const rope = Object.create(Rope.prototype);
    Object.defineProperty(rope, 'root', { value: root, enumerable: true });
    return Object.freeze(rope);
  }
  get length() { return length(this.root); }
  toString() { const parts = []; appendText(this.root, parts); return parts.join(''); }
  slice(start = 0, end = this.length) {
    const from = clampIndex(start, this.length);
    const to = clampIndex(end, this.length);
    if (to <= from) return '';
    const [, tail] = split(this.root, from);
    const [middle] = split(tail, to - from);
    const parts = []; appendText(middle, parts); return parts.join('');
  }
  insert(index, text) {
    if (typeof text !== 'string') throw new TypeError('inserted text must be a string');
    const at = clampIndex(index, this.length);
    const [left, right] = split(this.root, at);
    return Rope.fromRoot(concat(concat(left, build(text)), right));
  }
  delete(start, end) {
    const from = clampIndex(start, this.length);
    const to = clampIndex(end, this.length);
    if (to <= from) return this;
    const [left, tail] = split(this.root, from);
    const [, right] = split(tail, to - from);
    return Rope.fromRoot(concat(left, right));
  }
  replace(start, end, text) {
    if (typeof text !== 'string') throw new TypeError('replacement must be a string');
    const from = clampIndex(start, this.length);
    const to = clampIndex(end, this.length);
    const [left, tail] = split(this.root, from);
    const [, right] = split(tail, Math.max(0, to - from));
    return Rope.fromRoot(concat(concat(left, build(text)), right));
  }
  concat(other) {
    if (!(other instanceof Rope)) throw new TypeError('expected another Rope');
    return Rope.fromRoot(concat(this.root, other.root));
  }
  assertValid() {
    function visit(node) {
      if (!node) return { length: 0, height: 0 };
      if (node.type === 'leaf') {
        if (!node.text || node.text.length > LEAF_LIMIT || node.length !== node.text.length || node.height !== 1) throw new Error('invalid leaf');
        return { length: node.text.length, height: 1 };
      }
      const left = visit(node.left), right = visit(node.right);
      if (Math.abs(left.height - right.height) > 1) throw new Error('AVL balance violated');
      if (node.length !== left.length + right.length || node.height !== 1 + Math.max(left.height, right.height)) throw new Error('cached metadata mismatch');
      return { length: node.length, height: node.height };
    }
    visit(this.root);
    return true;
  }
}

function runTests() {
  const assert = require('node:assert/strict');
  let rope = new Rope('The quick brown fox');
  const original = rope;
  rope = rope.insert(4, 'agile ');
  assert.equal(rope.toString(), 'The agile quick brown fox');
  assert.equal(original.toString(), 'The quick brown fox', 'old versions remain unchanged');
  assert.equal(rope.slice(4, 9), 'agile');
  rope = rope.delete(4, 10);
  assert.equal(rope.toString(), 'The quick brown fox');
  rope = rope.replace(4, 9, 'slow');
  assert.equal(rope.toString(), 'The slow brown fox');
  assert.equal(new Rope('abc').concat(new Rope('def')).toString(), 'abcdef');
  assert.equal(new Rope('abc').slice(-2), 'bc');
  assert.throws(() => rope.insert(1.5, 'x'), TypeError);

  // Differential test: edits are checked against native strings after every step.
  let seed = 0x51f15e;
  const random = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
  let expected = 'seed';
  let versions = [new Rope(expected)];
  for (let i = 0; i < 700; i++) {
    const start = random(expected.length + 1);
    if (random(3) === 0) {
      const end = start + random(expected.length - start + 1);
      rope = versions[versions.length - 1].delete(start, end);
      expected = expected.slice(0, start) + expected.slice(end);
    } else {
      const value = ['x', 'YZ', '🙂', 'abc'][random(4)];
      rope = versions[versions.length - 1].insert(start, value);
      expected = expected.slice(0, start) + value + expected.slice(start);
    }
    versions.push(rope);
    assert.equal(rope.toString(), expected);
    assert.equal(rope.length, expected.length);
    assert.equal(rope.assertValid(), true);
    if (versions.length > 8) versions.shift();
  }
  assert.equal(original.toString(), 'The quick brown fox');
  console.log('AVL rope tests passed');
}

if (require.main === module) runTests();
module.exports = { Rope };
