'use strict';

/**
 * Exercise: build a canonical Huffman codec for byte streams.
 *
 * Construct deterministic Huffman code lengths with a min-heap, derive
 * canonical BigInt codes, pack bits MSB-first, and decode from the compact
 * header { data, codeLengths, originalLength, bitLength }. The explicit bit
 * length distinguishes payload bits from zero padding in the last byte.
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
    if (this.items.length === 0) return root;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.items.length) break;
      let child = left;
      if (right < this.items.length &&
          this.compare(this.items[right], this.items[left]) < 0) child = right;
      if (this.compare(last, this.items[child]) <= 0) break;
      this.items[index] = this.items[child];
      index = child;
    }
    this.items[index] = last;
    return root;
  }
}

function normalizeBytes(input) {
  if (input == null || typeof input[Symbol.iterator] !== 'function') {
    throw new TypeError('input must be an iterable of bytes');
  }
  const bytes = Array.from(input);
  if (bytes.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
    throw new RangeError('every input value must be an integer byte');
  }
  return bytes;
}

function buildCodeLengths(bytes) {
  const frequencies = new Uint32Array(256);
  for (const byte of bytes) frequencies[byte] += 1;
  const heap = new MinHeap((a, b) =>
    a.frequency - b.frequency || a.minimumSymbol - b.minimumSymbol
  );
  for (let symbol = 0; symbol < frequencies.length; symbol += 1) {
    if (frequencies[symbol] > 0) {
      heap.push({ symbol, frequency: frequencies[symbol], minimumSymbol: symbol, left: null, right: null });
    }
  }

  const lengths = new Uint8Array(256);
  if (heap.size === 0) return lengths;
  if (heap.size === 1) {
    lengths[heap.pop().symbol] = 1;
    return lengths;
  }

  while (heap.size > 1) {
    const left = heap.pop();
    const right = heap.pop();
    heap.push({
      symbol: null,
      frequency: left.frequency + right.frequency,
      minimumSymbol: Math.min(left.minimumSymbol, right.minimumSymbol),
      left, right
    });
  }

  function visit(node, depth) {
    if (node.symbol !== null) {
      if (depth > 255) throw new RangeError('Huffman code length exceeds 255 bits');
      lengths[node.symbol] = depth;
    } else {
      visit(node.left, depth + 1);
      visit(node.right, depth + 1);
    }
  }
  visit(heap.pop(), 0);
  return lengths;
}

function canonicalCodes(codeLengths) {
  if (!Array.isArray(codeLengths)) throw new TypeError('codeLengths must be an array');
  const seen = new Set();
  const entries = codeLengths.map(pair => {
    if (!Array.isArray(pair) || pair.length !== 2) throw new TypeError('each code length must be [symbol, length]');
    const [symbol, length] = pair;
    if (!Number.isInteger(symbol) || symbol < 0 || symbol > 255 ||
        !Number.isInteger(length) || length < 1 || length > 255) {
      throw new RangeError('symbols must be bytes and lengths must be 1..255');
    }
    if (seen.has(symbol)) throw new Error('duplicate symbol in code lengths');
    seen.add(symbol);
    return { symbol, length };
  }).sort((a, b) => a.length - b.length || a.symbol - b.symbol);

  const codes = new Map();
  let code = 0n;
  let previousLength = entries.length ? entries[0].length : 0;
  entries.forEach((entry, index) => {
    if (index > 0) code = (code + 1n) << BigInt(entry.length - previousLength);
    if (code >= (1n << BigInt(entry.length))) throw new Error('oversubscribed Huffman code lengths');
    codes.set(entry.symbol, { code, length: entry.length });
    previousLength = entry.length;
  });
  return codes;
}

function buildDecodeTrie(codes) {
  const root = { children: [null, null], symbol: null };
  for (const [symbol, descriptor] of codes) {
    let node = root;
    const { code, length } = descriptor;
    for (let offset = length - 1; offset >= 0; offset -= 1) {
      if (node.symbol !== null) throw new Error('a code extends an existing prefix');
      const bit = Number((code >> BigInt(offset)) & 1n);
      if (node.children[bit] === null) node.children[bit] = { children: [null, null], symbol: null };
      node = node.children[bit];
      if (offset === 0) {
        if (node.symbol !== null || node.children[0] || node.children[1]) {
          throw new Error('duplicate or prefix-conflicting Huffman code');
        }
        node.symbol = symbol;
      }
    }
  }
  return root;
}

function encodeBytes(input) {
  const bytes = normalizeBytes(input);
  const lengths = buildCodeLengths(bytes);
  const codeLengths = [];
  for (let symbol = 0; symbol < lengths.length; symbol += 1) {
    if (lengths[symbol] > 0) codeLengths.push([symbol, lengths[symbol]]);
  }
  if (bytes.length === 0) {
    return { data: new Uint8Array(0), codeLengths, originalLength: 0, bitLength: 0 };
  }

  const codes = canonicalCodes(codeLengths);
  let bitLength = 0;
  for (const byte of bytes) bitLength += codes.get(byte).length;
  const data = new Uint8Array(Math.ceil(bitLength / 8));
  let position = 0;
  for (const byte of bytes) {
    const { code, length } = codes.get(byte);
    for (let offset = length - 1; offset >= 0; offset -= 1) {
      const bit = Number((code >> BigInt(offset)) & 1n);
      if (bit) data[position >> 3] |= 1 << (7 - (position & 7));
      position += 1;
    }
  }
  return { data, codeLengths, originalLength: bytes.length, bitLength };
}

function decodeBytes(encoded) {
  if (!encoded || !Array.isArray(encoded.codeLengths)) throw new TypeError('encoded value must contain codeLengths');
  const { originalLength, bitLength } = encoded;
  const data = normalizeBytes(encoded.data);
  if (!Number.isInteger(originalLength) || originalLength < 0 ||
      !Number.isInteger(bitLength) || bitLength < 0) {
    throw new RangeError('originalLength and bitLength must be non-negative integers');
  }
  if (data.length !== Math.ceil(bitLength / 8)) throw new Error('payload byte count does not match bitLength');
  if (bitLength > data.length * 8) throw new Error('bitLength exceeds payload capacity');

  if (originalLength === 0) {
    if (bitLength !== 0 || encoded.codeLengths.length !== 0) throw new Error('empty payload must have no codes or bits');
    return new Uint8Array(0);
  }
  if (bitLength === 0 || encoded.codeLengths.length === 0) throw new Error('non-empty output requires at least one code bit');

  const remainder = bitLength & 7;
  if (remainder !== 0) {
    const paddingMask = (1 << (8 - remainder)) - 1;
    if ((data[data.length - 1] & paddingMask) !== 0) throw new Error('non-zero padding bits');
  }

  const trie = buildDecodeTrie(canonicalCodes(encoded.codeLengths));
  const output = new Uint8Array(originalLength);
  let outputLength = 0;
  let node = trie;
  for (let position = 0; position < bitLength; position += 1) {
    const bit = (data[position >> 3] >> (7 - (position & 7))) & 1;
    node = node.children[bit];
    if (node === null) throw new Error('payload follows a missing Huffman branch');
    if (node.symbol !== null) {
      if (outputLength >= originalLength) throw new Error('decoded more bytes than declared');
      output[outputLength++] = node.symbol;
      node = trie;
    }
  }
  if (node !== trie) throw new Error('payload ends in the middle of a Huffman code');
  if (outputLength !== originalLength) throw new Error('decoded byte count does not match originalLength');
  return output;
}

function encodeText(text) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  return encodeBytes(new TextEncoder().encode(text));
}
function decodeText(encoded) {
  return new TextDecoder('utf-8', { fatal: true }).decode(decodeBytes(encoded));
}

function runTests() {
  const assert = require('node:assert/strict');
  const empty = encodeBytes([]);
  assert.deepEqual(Array.from(decodeBytes(empty)), []);
  const repeated = encodeBytes([7, 7, 7, 7, 7, 7, 7]);
  assert.deepEqual(Array.from(decodeBytes(repeated)), [7, 7, 7, 7, 7, 7, 7]);
  assert.equal(repeated.bitLength, 7);

  const allBytes = Array.from({ length: 256 }, (_, index) => index);
  assert.deepEqual(Array.from(decodeBytes(encodeBytes(allBytes))), allBytes);
  const phrase = 'Canonical Huffman: café 🧠 — 日本語';
  assert.equal(decodeText(encodeText(phrase)), phrase);

  assert.throws(() => encodeBytes([0, 256]), /integer byte/);
  assert.throws(() => canonicalCodes([[1, 1], [2, 1], [3, 1]]), /oversubscribed/);
  assert.throws(() => canonicalCodes([[1, 2], [1, 3]]), /duplicate symbol/);

  const sample = encodeBytes([1, 1, 1, 2, 2, 3, 4, 4, 4, 4]);
  const corrupted = { ...sample, data: sample.data.slice(), bitLength: sample.bitLength + 8 };
  assert.throws(() => decodeBytes(corrupted), /byte count/);

  let seed = 0x2468ace0;
  const random = limit => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % limit;
  };
  let trials = 0;
  for (let trial = 0; trial < 140; trial += 1) {
    const length = random(180);
    const alphabetSize = 1 + random(32);
    const input = Array.from({ length }, () => random(alphabetSize));
    assert.deepEqual(Array.from(decodeBytes(encodeBytes(input))), input);
    trials += 1;
  }
  return { checks: 9 + trials, randomizedTrials: trials };
}

if (typeof module !== 'undefined') {
  module.exports = { encodeBytes, decodeBytes, encodeText, decodeText, canonicalCodes, runTests };
}
