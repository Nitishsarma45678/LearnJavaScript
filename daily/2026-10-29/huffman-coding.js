/**
 * Huffman coding
 *
 * Build an optimal prefix-code tree from symbol frequencies, then encode and
 * decode strings. This implementation uses a small binary min-heap and
 * deterministic tie-breaking so equal frequencies produce repeatable codes.
 */
"use strict";
const assert = require("node:assert/strict");

class MinHeap {
  constructor(compare) { this.items = []; this.compare = compare; }
  push(value) {
    const a = this.items; a.push(value);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.compare(a[p], a[i]) <= 0) break;
      [a[p], a[i]] = [a[i], a[p]]; i = p;
    }
  }
  pop() {
    const a = this.items;
    if (!a.length) return undefined;
    const first = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      while (true) {
        const l = i * 2 + 1, r = l + 1;
        let best = i;
        if (l < a.length && this.compare(a[l], a[best]) < 0) best = l;
        if (r < a.length && this.compare(a[r], a[best]) < 0) best = r;
        if (best === i) break;
        [a[i], a[best]] = [a[best], a[i]]; i = best;
      }
    }
    return first;
  }
  get size() { return this.items.length; }
}

function buildHuffmanCodec(text) {
  if (typeof text !== "string") throw new TypeError("text must be a string");
  if (text.length === 0) {
    return { codes: new Map(), encode: () => "", decode: bits => {
      if (bits !== "") throw new Error("non-empty bitstream for empty alphabet");
      return "";
    }};
  }
  const frequency = new Map();
  for (const symbol of text) frequency.set(symbol, (frequency.get(symbol) || 0) + 1);
  let order = 0;
  const heap = new MinHeap((a, b) => a.freq - b.freq || a.order - b.order);
  for (const [symbol, freq] of frequency) heap.push({ symbol, freq, order: order++ });
  while (heap.size > 1) {
    const left = heap.pop(), right = heap.pop();
    heap.push({ symbol: null, freq: left.freq + right.freq, left, right, order: order++ });
  }
  const root = heap.pop();
  const codes = new Map();
  function visit(node, prefix) {
    if (node.symbol !== null) {
      codes.set(node.symbol, prefix || "0"); // single-symbol alphabet
      return;
    }
    visit(node.left, prefix + "0");
    visit(node.right, prefix + "1");
  }
  visit(root, "");

  function encode(input) {
    let output = "";
    for (const symbol of input) {
      const code = codes.get(symbol);
      if (code === undefined) throw new RangeError("symbol not present in codec alphabet");
      output += code;
    }
    return output;
  }
  function decode(bits) {
    if (typeof bits !== "string" || /[^01]/.test(bits)) {
      throw new TypeError("bitstream must contain only 0 and 1");
    }
    let output = "", node = root;
    for (const bit of bits) {
      node = bit === "0" ? node.left : node.right;
      if (!node) {
        // A one-symbol tree has no children; its only valid code is "0".
        if (root.symbol !== null && bit === "0") { output += root.symbol; node = root; continue; }
        throw new Error("invalid bitstream");
      }
      if (node.symbol !== null) { output += node.symbol; node = root; }
    }
    if (node !== root) throw new Error("incomplete trailing code");
    return output;
  }
  return { codes, encode, decode };
}

const codec = buildHuffmanCodec("this is an example of a huffman tree");
const encoded = codec.encode("huffman");
assert.equal(codec.decode(encoded), "huffman");
assert.equal(codec.decode(codec.encode("this is an example")), "this is an example");
assert.throws(() => codec.encode("not-in-alphabet"), RangeError);
const single = buildHuffmanCodec("xxxxx");
assert.equal(single.encode("xxx"), "000");
assert.equal(single.decode("000"), "xxx");
assert.equal(buildHuffmanCodec("").decode(""), "");
assert.throws(() => codec.decode("102"), TypeError);

module.exports = { buildHuffmanCodec };
