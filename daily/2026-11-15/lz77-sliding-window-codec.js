'use strict';

/**
 * Educational LZ77 codec using (offset, length, nextByte) tokens.
 * The encoder searches a bounded sliding window and indexes 3-byte prefixes
 * to avoid scanning every prior position. The decoder supports overlapping
 * copies, which are essential for compressing repeated runs such as "aaaaaa".
 * This is a clear reference implementation, not a production wire format.
 */
function asBytes(input) {
  if (typeof input === 'string') return new TextEncoder().encode(input);
  if (input instanceof Uint8Array) return input.slice();
  throw new TypeError('input must be a string or Uint8Array');
}

function prefixKey(bytes, index) {
  if (index + 2 >= bytes.length) return -1;
  return (bytes[index] << 16) | (bytes[index + 1] << 8) | bytes[index + 2];
}

function compress(input, options = {}) {
  const bytes = asBytes(input);
  const windowSize = options.windowSize ?? 4096;
  const maxLookahead = options.maxLookahead ?? 255;
  const minMatch = options.minMatch ?? 3;
  const maxCandidates = options.maxCandidates ?? 128;
  for (const [name, value] of Object.entries({ windowSize, maxLookahead, minMatch, maxCandidates })) {
    if (!Number.isInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer`);
  }
  if (minMatch > maxLookahead) throw new RangeError('minMatch cannot exceed maxLookahead');

  const chains = new Map();
  const tokens = [];
  const remember = position => {
    const key = prefixKey(bytes, position);
    if (key < 0) return;
    let chain = chains.get(key);
    if (!chain) chains.set(key, chain = []);
    chain.push(position);
  };

  for (let position = 0; position < bytes.length;) {
    const key = prefixKey(bytes, position);
    const chain = key < 0 ? null : chains.get(key);
    let bestOffset = 0, bestLength = 0;
    const limit = Math.min(maxLookahead, bytes.length - position);
    if (chain) {
      let inspected = 0;
      for (let i = chain.length - 1; i >= 0 && inspected < maxCandidates; i--) {
        const candidate = chain[i];
        const offset = position - candidate;
        if (offset > windowSize) break;
        inspected++;
        let length = 0;
        while (length < limit && bytes[candidate + length] === bytes[position + length]) length++;
        if (length > bestLength) {
          bestLength = length;
          bestOffset = offset;
          if (length === limit) break;
        }
      }
    }

    let consumed;
    if (bestLength >= minMatch) {
      const nextIndex = position + bestLength;
      const next = nextIndex < bytes.length ? bytes[nextIndex] : null;
      tokens.push({ offset: bestOffset, length: bestLength, next });
      consumed = bestLength + (next === null ? 0 : 1);
    } else {
      tokens.push({ offset: 0, length: 0, next: bytes[position] });
      consumed = 1;
    }
    for (let i = 0; i < consumed; i++) remember(position + i);
    position += consumed;
  }
  return { originalLength: bytes.length, tokens };
}

function decompress(encoded) {
  if (!encoded || !Array.isArray(encoded.tokens) || !Number.isInteger(encoded.originalLength) || encoded.originalLength < 0) {
    throw new TypeError('encoded input must contain tokens and a non-negative originalLength');
  }
  const output = [];
  for (let index = 0; index < encoded.tokens.length; index++) {
    const token = encoded.tokens[index];
    if (!token || !Number.isInteger(token.offset) || !Number.isInteger(token.length) || token.offset < 0 || token.length < 0) {
      throw new TypeError(`invalid token at index ${index}`);
    }
    const next = token.next;
    if (next !== null && (!Number.isInteger(next) || next < 0 || next > 255)) throw new RangeError(`invalid next byte at token ${index}`);
    if (token.offset === 0) {
      if (token.length !== 0 || next === null) throw new RangeError(`invalid literal token at index ${index}`);
      output.push(next);
    } else {
      if (token.offset > output.length || token.length < 1) throw new RangeError(`invalid back-reference at index ${index}`);
      for (let i = 0; i < token.length; i++) output.push(output[output.length - token.offset]);
      if (next !== null) output.push(next);
    }
    if (output.length > encoded.originalLength) throw new RangeError('decoded output exceeds declared length');
  }
  if (output.length !== encoded.originalLength) throw new RangeError(`decoded ${output.length} bytes; expected ${encoded.originalLength}`);
  return Uint8Array.from(output);
}

function decompressToString(encoded) {
  return new TextDecoder('utf-8', { fatal: true }).decode(decompress(encoded));
}

function runTests() {
  const assert = require('node:assert/strict');
  for (const sample of ['', 'a', 'abc', 'aaaaaaaaaaaaaaaaaaaa', 'abracadabra abracadabra', 'The quick brown fox jumps over the lazy dog.']) {
    assert.equal(decompressToString(compress(sample)), sample);
  }
  const unicode = 'JavaScript 🧠 strings are UTF-8 encoded before compression — naïve café';
  assert.equal(decompressToString(compress(unicode)), unicode);
  const binary = Uint8Array.from([0, 255, 0, 255, 0, 255, 17, 17, 17, 17, 17]);
  assert.deepEqual([...decompress(compress(binary))], [...binary]);

  const repeated = compress('z'.repeat(1000));
  assert.ok(repeated.tokens.length < 20, 'repeated data should collapse into a few references');
  assert.equal(decompressToString(repeated), 'z'.repeat(1000));
  assert.throws(() => decompress({ originalLength: 2, tokens: [{ offset: 1, length: 2, next: null }] }), RangeError);
  assert.throws(() => decompress({ originalLength: 1, tokens: [{ offset: 0, length: 0, next: 999 }] }), RangeError);
  assert.throws(() => compress('abc', { windowSize: 0 }), RangeError);

  // Randomized round trips across small alphabets and varied match windows.
  let seed = 0x1234abcd;
  const random = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
  for (let trial = 0; trial < 300; trial++) {
    const size = random(400);
    const data = Uint8Array.from({ length: size }, () => random(8));
    const options = { windowSize: 8 + random(64), maxLookahead: 8 + random(48), minMatch: 2 + random(4), maxCandidates: 8 + random(32) };
    if (options.minMatch > options.maxLookahead) options.minMatch = options.maxLookahead;
    assert.deepEqual([...decompress(compress(data, options))], [...data], `round trip ${trial}`);
  }
  console.log('LZ77 sliding-window codec tests passed');
}

if (require.main === module) runTests();
module.exports = { compress, decompress, decompressToString };
