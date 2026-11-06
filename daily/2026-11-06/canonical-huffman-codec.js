'use strict';

// Deterministic canonical Huffman codec for Unicode code points.
function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error((message || "Values differ") +
    ": expected " + String(expected) + ", got " + String(actual));
}
class MinHeap {
  constructor(compare) { this.items = []; this.compare = compare; }
  get size() { return this.items.length; }
  push(value) {
    const a = this.items; a.push(value); let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1; if (this.compare(a[p], value) <= 0) break;
      a[i] = a[p]; i = p;
    }
    a[i] = value;
  }
  pop() {
    if (!this.items.length) return undefined;
    const a = this.items, root = a[0], last = a.pop();
    if (a.length) {
      let i = 0;
      while (true) {
        let child = i * 2 + 1; if (child >= a.length) break;
        if (child + 1 < a.length && this.compare(a[child + 1], a[child]) < 0) child++;
        if (this.compare(last, a[child]) <= 0) break;
        a[i] = a[child]; i = child;
      }
      a[i] = last;
    }
    return root;
  }
}
function compareText(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function canonicalTable(lengthEntries) {
  if (!Array.isArray(lengthEntries)) throw new TypeError("code lengths must be an array");
  const entries = lengthEntries.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" ||
        Array.from(entry[0]).length !== 1 || !Number.isInteger(entry[1]) ||
        entry[1] < 1 || entry[1] > 4096) throw new TypeError("invalid code-length entry");
    return { symbol: entry[0], length: entry[1] };
  });
  if (new Set(entries.map((entry) => entry.symbol)).size !== entries.length) {
    throw new TypeError("duplicate symbol in code lengths");
  }
  entries.sort((a, b) => a.length - b.length || compareText(a.symbol, b.symbol));
  const table = new Map(); let code = 0n;
  let previousLength = entries.length ? entries[0].length : 0;
  for (const entry of entries) {
    code <<= BigInt(entry.length - previousLength);
    if (code >= (1n << BigInt(entry.length))) throw new RangeError("oversubscribed Huffman code lengths");
    table.set(entry.symbol, { code, length: entry.length });
    code++; previousLength = entry.length;
  }
  return table;
}
class CanonicalHuffmanCodec {
  static codeLengths(text) {
    if (typeof text !== "string") throw new TypeError("input must be a string");
    const frequencies = new Map();
    for (const symbol of Array.from(text)) frequencies.set(symbol, (frequencies.get(symbol) || 0) + 1);
    if (!frequencies.size) return [];
    let serial = 0;
    const compare = (a, b) => a.frequency - b.frequency ||
      compareText(a.minSymbol, b.minSymbol) || a.serial - b.serial;
    const heap = new MinHeap(compare);
    for (const [symbol, frequency] of frequencies) {
      heap.push({ symbol, frequency, minSymbol: symbol, serial: serial++, left: null, right: null });
    }
    if (heap.size === 1) return [[heap.pop().symbol, 1]];
    while (heap.size > 1) {
      const left = heap.pop(), right = heap.pop();
      heap.push({
        symbol: null, frequency: left.frequency + right.frequency,
        minSymbol: compareText(left.minSymbol, right.minSymbol) <= 0 ? left.minSymbol : right.minSymbol,
        serial: serial++, left, right
      });
    }
    const lengths = [], stack = [[heap.pop(), 0]];
    while (stack.length) {
      const [node, depth] = stack.pop();
      if (node.symbol !== null) lengths.push([node.symbol, depth]);
      else { stack.push([node.right, depth + 1]); stack.push([node.left, depth + 1]); }
    }
    return lengths;
  }
  encode(text) {
    if (typeof text !== "string") throw new TypeError("input must be a string");
    const symbols = Array.from(text), codeLengths = CanonicalHuffmanCodec.codeLengths(text);
    const codes = canonicalTable(codeLengths);
    let bitLength = 0;
    for (const symbol of symbols) bitLength += codes.get(symbol).length;
    const bytes = new Uint8Array(Math.ceil(bitLength / 8));
    let position = 0;
    for (const symbol of symbols) {
      const entry = codes.get(symbol);
      for (let bit = entry.length - 1; bit >= 0; bit--) {
        if (((entry.code >> BigInt(bit)) & 1n) === 1n) bytes[position >> 3] |= 1 << (7 - (position & 7));
        position++;
      }
    }
    return { bytes, bitLength, symbolCount: symbols.length, codeLengths };
  }
  decode(packet) {
    if (!packet || !(packet.bytes instanceof Uint8Array) || !Number.isInteger(packet.bitLength) ||
        packet.bitLength < 0 || packet.bitLength > packet.bytes.length * 8 ||
        packet.bytes.length !== Math.ceil(packet.bitLength / 8) ||
        !Number.isInteger(packet.symbolCount) || packet.symbolCount < 0) {
      throw new TypeError("invalid encoded packet");
    }
    const codes = canonicalTable(packet.codeLengths);
    if (packet.symbolCount === 0) {
      if (packet.bitLength !== 0 || codes.size !== 0) throw new Error("invalid empty packet");
      return "";
    }
    if (!codes.size) throw new Error("missing code table");
    const lookup = new Map(); let maxLength = 0;
    for (const [symbol, entry] of codes) {
      lookup.set(entry.length + ":" + entry.code, symbol);
      maxLength = Math.max(maxLength, entry.length);
    }
    const output = []; let code = 0n, length = 0;
    for (let position = 0; position < packet.bitLength; position++) {
      const bit = (packet.bytes[position >> 3] >> (7 - (position & 7))) & 1;
      code = (code << 1n) | BigInt(bit); length++;
      const symbol = lookup.get(length + ":" + code);
      if (symbol !== undefined) {
        output.push(symbol); code = 0n; length = 0;
        if (output.length > packet.symbolCount) throw new Error("decoded too many symbols");
      } else if (length >= maxLength) throw new Error("invalid Huffman bit sequence");
    }
    if (length !== 0 || output.length !== packet.symbolCount) throw new Error("truncated or inconsistent Huffman packet");
    return output.join("");
  }
}
function runTests() {
  const codec = new CanonicalHuffmanCodec();
  for (const text of ["", "aaaaaaaa", "abracadabra", "🙂 café 漢字 🙂",
    "the quick brown fox jumps over the lazy dog"]) {
    const packet = codec.encode(text);
    equal(codec.decode(packet), text, "round trip failed");
    equal(packet.bytes.length, Math.ceil(packet.bitLength / 8));
  }
  const first = codec.encode("deterministic huffman"), second = codec.encode("deterministic huffman");
  equal(first.bitLength, second.bitLength);
  equal(Array.from(first.bytes).join(","), Array.from(second.bytes).join(","));
  assert(first.codeLengths.length > 1);
  const malformed = codec.encode("abc"); let malformedRejected = false;
  try { codec.decode({ ...malformed, bitLength: malformed.bitLength + 1 }); }
  catch (_) { malformedRejected = true; }
  assert(malformedRejected);
  let oversubscribedRejected = false;
  try { canonicalTable([["a", 1], ["b", 1], ["c", 1]]); }
  catch (error) { oversubscribedRejected = error instanceof RangeError; }
  assert(oversubscribedRejected);
  console.log("Canonical Huffman codec: all tests passed");
}
if (typeof module !== "undefined" && require.main === module) runTests();
if (typeof module !== "undefined") module.exports = { CanonicalHuffmanCodec, canonicalTable };