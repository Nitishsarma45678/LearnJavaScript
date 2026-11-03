const assert = require('node:assert/strict');

function makeLeaf(text) {
  return text.length ? { text, left: null, right: null, length: text.length, height: 1 } : null;
}
function makeBranch(left, right) {
  if (!left) return right;
  if (!right) return left;
  return { text: null, left, right, length: left.length + right.length,
    height: 1 + Math.max(left.height, right.height) };
}
function collectLeaves(node, out = []) {
  if (!node) return out;
  if (node.text !== null) out.push(node);
  else { collectLeaves(node.left, out); collectLeaves(node.right, out); }
  return out;
}
function buildBalanced(leaves, lo = 0, hi = leaves.length) {
  if (lo >= hi) return null;
  if (hi - lo === 1) return leaves[lo];
  const mid = (lo + hi) >> 1;
  return makeBranch(buildBalanced(leaves, lo, mid), buildBalanced(leaves, mid, hi));
}
function join(left, right) {
  if (!left) return right;
  if (!right) return left;
  const combined = makeBranch(left, right);
  if (Math.abs(left.height - right.height) <= 2) return combined;
  return buildBalanced(collectLeaves(combined));
}
function split(node, index) {
  if (!node) return [null, null];
  if (index <= 0) return [null, node];
  if (index >= node.length) return [node, null];
  if (node.text !== null) {
    return [makeLeaf(node.text.slice(0, index)), makeLeaf(node.text.slice(index))];
  }
  if (index < node.left.length) {
    const [a, b] = split(node.left, index);
    return [a, join(b, node.right)];
  }
  if (index === node.left.length) return [node.left, node.right];
  const [a, b] = split(node.right, index - node.left.length);
  return [join(node.left, a), b];
}
function stringify(node, out = []) {
  if (!node) return out.join('');
  if (node.text !== null) out.push(node.text);
  else { stringify(node.left, out); stringify(node.right, out); }
  return out.join('');
}
function charAt(node, index) {
  if (!node || index < 0 || index >= node.length) return '';
  if (node.text !== null) return node.text[index];
  return index < node.left.length ? charAt(node.left, index) : charAt(node.right, index - node.left.length);
}
function normalizeIndex(index, length, fallback) {
  if (index === undefined) return fallback;
  const n = Math.trunc(index);
  return n < 0 ? Math.max(length + n, 0) : Math.min(n, length);
}

class Rope {
  constructor(root = null) { this.root = root; }
  static from(value, chunkSize = 16) {
    const text = String(value);
    if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new RangeError('chunkSize must be positive');
    const leaves = [];
    for (let i = 0; i < text.length; i += chunkSize) leaves.push(makeLeaf(text.slice(i, i + chunkSize)));
    return new Rope(buildBalanced(leaves));
  }
  get length() { return this.root ? this.root.length : 0; }
  toString() { return stringify(this.root); }
  charAt(index) { return charAt(this.root, Math.trunc(index)); }
  concat(other) {
    const rhs = other instanceof Rope ? other : Rope.from(other);
    return new Rope(join(this.root, rhs.root));
  }
  split(index) {
    const at = normalizeIndex(index, this.length, 0);
    const [left, right] = split(this.root, at);
    return [new Rope(left), new Rope(right)];
  }
  slice(start = 0, end = this.length) {
    const from = normalizeIndex(start, this.length, 0);
    const to = Math.max(from, normalizeIndex(end, this.length, this.length));
    const [, tail] = split(this.root, from);
    const [middle] = split(tail, to - from);
    return new Rope(middle);
  }
  insert(index, value) {
    const [left, right] = this.split(index);
    return left.concat(value).concat(right);
  }
  delete(start, end) {
    const from = normalizeIndex(start, this.length, 0);
    const to = Math.max(from, normalizeIndex(end, this.length, this.length));
    const [left, tail] = split(this.root, from);
    const [, right] = split(tail, to - from);
    return new Rope(join(left, right));
  }
}

// Indices intentionally follow JavaScript UTF-16 string offsets.
const original = Rope.from('persistent-rope-data-structure', 4);
const edited = original.insert(11, '[new]').delete(11, 16);
assert.equal(original.toString(), 'persistent-rope-data-structure');
assert.equal(edited.toString(), original.toString());
assert.equal(original.slice(0, 10).toString(), 'persistent');
assert.equal(original.slice(-5).toString(), 'ture');
const [head, tail] = original.split(10);
assert.equal(head.concat(tail).toString(), original.toString());
assert.equal(head.toString(), 'persistent');
assert.equal(tail.toString(), '-rope-data-structure');
assert.equal(Rope.from('').concat('abc').charAt(1), 'b');
assert.equal(original.charAt(999), '');
assert.throws(() => Rope.from('x', 0), RangeError);
console.log('Persistent rope tests passed');