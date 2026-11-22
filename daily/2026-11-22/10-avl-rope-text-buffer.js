/**
 * Exercise: Implement a persistent AVL-balanced rope for text editing.
 * Required operations: concat, split, insert, delete, slice, charAt, toString.
 * Leaves hold short strings; internal nodes cache length and height.
 * Run: node 10-avl-rope-text-buffer.js
 */
"use strict";
const assert = require("node:assert/strict");
const CHUNK = 16;

const height = node => node ? node.height : 0;
const length = node => node ? node.length : 0;
const leaf = text => text.length ? { text, left: null, right: null, length: text.length, height: 1 } : null;
function branch(left, right) {
  if (!left) return right;
  if (!right) return left;
  return { text: null, left, right, length: length(left) + length(right),
    height: 1 + Math.max(height(left), height(right)) };
}
function rebalance(left, right) {
  if (!left) return right;
  if (!right) return left;
  if (height(left) > height(right) + 1) {
    const a = left.left, b = left.right;
    if (height(a) >= height(b)) return branch(a, branch(b, right));
    return branch(branch(a, b.left), branch(b.right, right));
  }
  if (height(right) > height(left) + 1) {
    const a = right.left, b = right.right;
    if (height(b) >= height(a)) return branch(branch(left, a), b);
    return branch(branch(left, a.left), branch(a.right, b));
  }
  return branch(left, right);
}
function join(left, right) {
  if (!left) return right;
  if (!right) return left;
  if (height(left) > height(right) + 1) return rebalance(left.left, join(left.right, right));
  if (height(right) > height(left) + 1) return rebalance(join(left, right.left), right.right);
  return branch(left, right);
}
function fromString(text) {
  if (typeof text !== "string") throw new TypeError("text must be a string");
  const leaves = [];
  for (let i = 0; i < text.length; i += CHUNK) leaves.push(leaf(text.slice(i, i + CHUNK)));
  function build(lo, hi) {
    if (lo >= hi) return null;
    if (hi - lo === 1) return leaves[lo];
    const mid = (lo + hi) >> 1;
    return branch(build(lo, mid), build(mid, hi));
  }
  return new Rope(build(0, leaves.length));
}
function splitNode(node, index) {
  if (!node) return [null, null];
  if (index <= 0) return [null, node];
  if (index >= node.length) return [node, null];
  if (node.text !== null) return [leaf(node.text.slice(0, index)), leaf(node.text.slice(index))];
  if (index < node.left.length) {
    const [a, b] = splitNode(node.left, index);
    return [a, join(b, node.right)];
  }
  if (index === node.left.length) return [node.left, node.right];
  const [a, b] = splitNode(node.right, index - node.left.length);
  return [join(node.left, a), b];
}
function appendText(node, parts) {
  if (!node) return;
  if (node.text !== null) parts.push(node.text);
  else { appendText(node.left, parts); appendText(node.right, parts); }
}
class Rope {
  constructor(root = null) { this.root = root; }
  static from(text) { return fromString(text); }
  get length() { return length(this.root); }
  concat(other) {
    if (!(other instanceof Rope)) throw new TypeError("concat expects a Rope");
    return new Rope(join(this.root, other.root));
  }
  split(index) {
    if (!Number.isInteger(index) || index < 0 || index > this.length) throw new RangeError("split index out of range");
    const [left, right] = splitNode(this.root, index);
    return [new Rope(left), new Rope(right)];
  }
  insert(index, text) {
    const [left, right] = this.split(index);
    return left.concat(Rope.from(text)).concat(right);
  }
  delete(start, count) {
    if (!Number.isInteger(count) || count < 0 || start + count > this.length) throw new RangeError("invalid deletion");
    const [left, rest] = this.split(start);
    const [, right] = rest.split(count);
    return left.concat(right);
  }
  slice(start = 0, end = this.length) {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > this.length) {
      throw new RangeError("invalid slice");
    }
    const [, tail] = this.split(start);
    const [middle] = tail.split(end - start);
    return middle.toString();
  }
  charAt(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.length) return "";
    let node = this.root, i = index;
    while (node && node.text === null) {
      if (i < node.left.length) node = node.left;
      else { i -= node.left.length; node = node.right; }
    }
    return node ? node.text[i] : "";
  }
  toString() { const parts = []; appendText(this.root, parts); return parts.join(""); }
}

const source = Rope.from("the quick brown fox");
const edited = source.insert(4, "very ").delete(10, 6);
assert.equal(source.toString(), "the quick brown fox"); // persistent original
assert.equal(edited.toString(), "the very brown fox");
assert.equal(source.slice(4, 9), "quick");
assert.equal(source.charAt(0), "t");
assert.equal(source.charAt(99), "");
const [left, right] = source.split(10);
assert.equal(left.toString() + right.toString(), source.toString());
assert.equal(left.concat(right).toString(), source.toString());
assert.equal(Rope.from("").concat(Rope.from("x")).toString(), "x");
assert.throws(() => source.split(100), RangeError);
console.log("AVL rope tests passed");
module.exports = { Rope };
