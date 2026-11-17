'use strict';

/**
 * Canonical Huffman Codec
 * ----------------------
 * Compress UTF-8 text with a deterministic canonical Huffman code. The encoded
 * packet contains a symbol/bit-length codebook, exact bit count, original byte
 * length, and packed MSB-first payload. Canonical codes make the codebook
 * reproducible from lengths alone and avoid serializing an explicit tree.
 *
 * This is an educational codec, not a production container format: callers
 * should authenticate packets before decoding untrusted input.
 */

class MinHeap {
  constructor(compare) { this.items = []; this.compare = compare; }
  get size() { return this.items.length; }
  push(value) {
    const items = this.items;
    items.push(value);
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.compare(items[parent], value) <= 0) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = value;
  }
  pop() {
    if (this.items.length === 0) return undefined;
    const root = this.items[0];
    const last = this.items.pop();
    if (this.items.length) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= this.items.length) break;
        let child = left;
        if (right < this.items.length && this.compare(this.items[right], this.items[left]) < 0) child = right;
        if (this.compare(last, this.items[child]) <= 0) break;
        this.items[index] = this.items[child];
        index = child;
      }
      this.items[index] = last;
    }
    return root;
  }
}

function buildCodeLengths(bytes) {
  const frequencies = new Map();
  for (const byte of bytes) frequencies.set(byte, (frequencies.get(byte) ?? 0) + 1);
  if (frequencies.size === 0) return [];
  const compare = (a, b) => a.frequency - b.frequency || a.minSymbol - b.minSymbol || a.sequence - b.sequence;
  const heap = new MinHeap(compare);
  let sequence = 0;
  for (const [symbol, frequency] of frequencies) {
    heap.push({ symbol, frequency, minSymbol: symbol, sequence: sequence++, left: null, right: null });
  }
  while (heap.size > 1) {
    const left = heap.pop();
    const right = heap.pop();
    heap.push({
      symbol: null,
      frequency: left.frequency + right.frequency,
      minSymbol: Math.min(left.minSymbol, right.minSymbol),
      sequence: sequence++, left, right,
    });
  }
  const lengths = [];
  const stack = [[heap.pop(), 0]];
  while (stack.length) {
    const [node, depth] = stack.pop();
    if (node.symbol !== null) lengths.push([node.symbol, Math.max(1, depth)]);
    else {
      stack.push([node.right, depth + 1], [node.left, depth + 1]);
    }
  }
  return lengths.sort((a, b) => a[0] - b[0]);
}

function canonicalCodes(codeLengths) {
  if (!Array.isArray(codeLengths)) throw new TypeError('codeLengths must be an array');
  const seen = new Set();
  const entries = codeLengths.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 2) throw new TypeError('each code length must be [symbol, length]');
    const [symbol, length] = entry;
    if (!Number.isInteger(symbol) || symbol < 0 || symbol > 255) throw new RangeError('symbol must be a byte');
    if (!Number.isInteger(length) || length < 1 || length > 255) throw new RangeError('code length must be in [1, 255]');
    if (seen.has(symbol)) throw new Error(`duplicate symbol ${symbol}`);
    seen.add(symbol);
    return { symbol, length };
  }).sort((a, b) => a.length - b.length || a.symbol - b.symbol);

  const codes = new Map();
  let code = 0n;
  let previousLength = 0;
  for (const entry of entries) {
    code <<= BigInt(entry.length - previousLength);
    if (code >= (1n << BigInt(entry.length))) throw new Error('oversubscribed Huffman code lengths');
    codes.set(entry.symbol, { code, length: entry.length });
    code += 1n;
    previousLength = entry.length;
  }
  return codes;
}

function encode(text) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  const bytes = new TextEncoder().encode(text);
  const codeLengths = buildCodeLengths(bytes);
  const codes = canonicalCodes(codeLengths);
  let bitLength = 0;
  for (const byte of bytes) bitLength += codes.get(byte).length;
  const payload = new Uint8Array(Math.ceil(bitLength / 8));
  let cursor = 0;
  for (const byte of bytes) {
    const { code, length } = codes.get(byte);
    for (let bit = length - 1; bit >= 0; bit -= 1) {
      if ((code >> BigInt(bit)) & 1n) payload[cursor >> 3] |= 1 << (7 - (cursor & 7));
      cursor += 1;
    }
  }
  return { codeLengths, bitLength, byteLength: bytes.length, payload };
}

function decode(packet) {
  if (!packet || typeof packet !== 'object') throw new TypeError('packet must be an object');
  const { codeLengths, bitLength, byteLength, payload } = packet;
  if (!Number.isSafeInteger(bitLength) || bitLength < 0) throw new RangeError('invalid bitLength');
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) throw new RangeError('invalid byteLength');
  if (!(payload instanceof Uint8Array)) throw new TypeError('payload must be a Uint8Array');
  if (payload.length !== Math.ceil(bitLength / 8)) throw new Error('payload length does not match bitLength');
  if (bitLength % 8 && payload.length) {
    const unusedMask = (1 << (8 - (bitLength % 8))) - 1;
    if ((payload[payload.length - 1] & unusedMask) !== 0) throw new Error('non-zero padding bits');
  }
  if (byteLength === 0) {
    if (bitLength !== 0 || payload.length !== 0 || codeLengths.length !== 0) throw new Error('invalid empty packet');
    return '';
  }
  const codes = canonicalCodes(codeLengths);
  if (codes.size === 0) throw new Error('non-empty packet has no codebook');
  const root = {};
  for (const [symbol, entry] of codes) {
    let node = root;
    for (let bit = entry.length - 1; bit >= 0; bit -= 1) {
      if (node.symbol !== undefined) throw new Error('codebook has a prefix collision');
      const direction = Number((entry.code >> BigInt(bit)) & 1n);
      node[direction] ??= {};
      node = node[direction];
    }
    if (node.symbol !== undefined || node[0] || node[1]) throw new Error('codebook has a duplicate or prefix collision');
    node.symbol = symbol;
  }

  const output = new Uint8Array(byteLength);
  let outputLength = 0;
  let node = root;
  for (let position = 0; position < bitLength; position += 1) {
    const bit = (payload[position >> 3] >> (7 - (position & 7))) & 1;
    node = node[bit];
    if (!node) throw new Error('payload contains an invalid code');
    if (node.symbol !== undefined) {
      if (outputLength >= byteLength) throw new Error('decoded more bytes than declared');
      output[outputLength++] = node.symbol;
      node = root;
    }
  }
  if (node !== root) throw new Error('payload ends in the middle of a code');
  if (outputLength !== byteLength) throw new Error(`decoded ${outputLength} bytes; expected ${byteLength}`);
  return new TextDecoder('utf-8', { fatal: true }).decode(output);
}

function runTests() {
  const assert = require('node:assert/strict');
  const examples = ['', 'a', 'aaaaaa', 'banana bandana', '😀 café 東京', 'the quick brown fox jumps over the lazy dog'];
  for (const text of examples) assert.equal(decode(encode(text)), text);
  const packet = encode('mississippi river');
  assert.deepEqual(encode('mississippi river').codeLengths, packet.codeLengths);
  assert.deepEqual(encode('mississippi river').payload, packet.payload);
  assert.equal(packet.payload.length, Math.ceil(packet.bitLength / 8));
  assert.throws(() => canonicalCodes([[1, 1], [2, 1], [3, 1]]), /oversubscribed/);
  assert.throws(() => canonicalCodes([[1, 2], [1, 3]]), /duplicate/);
  assert.throws(() => decode({ ...packet, bitLength: packet.bitLength + 8 }), /payload length/);
  assert.throws(() => decode({ ...packet, payload: new Uint8Array([0xff, ...packet.payload.slice(1)]) }), /invalid code|decoded more|middle|decoded /);

  let seed = 0x1234abcd;
  const random = (limit) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % limit;
  };
  const alphabet = ['a', 'b', 'c', 'd', '🙂', '界', 'é'];
  for (let trial = 0; trial < 150; trial += 1) {
    const text = Array.from({ length: random(100) }, () => alphabet[random(alphabet.length)]).join('');
    assert.equal(decode(encode(text)), text);
  }
}

if (require.main === module) {
  runTests();
  console.log('Canonical Huffman Codec: all tests passed');
}

module.exports = { encode, decode, canonicalCodes, buildCodeLengths };
