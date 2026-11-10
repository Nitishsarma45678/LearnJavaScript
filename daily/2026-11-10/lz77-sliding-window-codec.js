'use strict';

/**
 * LZ77 sliding-window codec.
 *
 * Tokens are triples { distance, length, nextByte }. A literal is encoded as
 * distance=0,length=0,nextByte=<byte>; a match copies `length` bytes from
 * `distance` bytes behind the current output, then emits nextByte when present.
 * The decoder intentionally supports overlapping copies (e.g. distance 1).
 */
function assertByte(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new TypeError(`${label} must be an integer byte`);
  }
}

function findLongestMatch(input, position, windowSize, lookaheadSize, minMatch) {
  const maxDistance = Math.min(windowSize, position);
  const maxLength = Math.min(lookaheadSize, input.length - position);
  let best = { distance: 0, length: 0 };

  // Searching distances from nearest to farthest makes equal-length ties stable.
  for (let distance = 1; distance <= maxDistance; distance += 1) {
    let length = 0;
    while (
      length < maxLength &&
      input[position + length] === input[position + length - distance]
    ) {
      length += 1;
    }
    if (length > best.length) best = { distance, length };
    if (best.length === maxLength) break;
  }
  return best.length >= minMatch ? best : { distance: 0, length: 0 };
}

function compressBytes(input, options = {}) {
  if (!(input instanceof Uint8Array)) throw new TypeError('input must be a Uint8Array');
  const windowSize = options.windowSize ?? 64;
  const lookaheadSize = options.lookaheadSize ?? 32;
  const minMatch = options.minMatch ?? 3;
  for (const [name, value] of Object.entries({ windowSize, lookaheadSize, minMatch })) {
    if (!Number.isInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer`);
  }

  const tokens = [];
  for (let position = 0; position < input.length;) {
    const match = findLongestMatch(input, position, windowSize, lookaheadSize, minMatch);
    if (match.length === 0) {
      tokens.push({ distance: 0, length: 0, nextByte: input[position] });
      position += 1;
      continue;
    }

    const afterMatch = position + match.length;
    const nextByte = afterMatch < input.length ? input[afterMatch] : null;
    tokens.push({ distance: match.distance, length: match.length, nextByte });
    position = afterMatch + (nextByte === null ? 0 : 1);
  }
  return { byteLength: input.length, windowSize, lookaheadSize, minMatch, tokens };
}

function decompressBytes(encoded, options = {}) {
  if (!encoded || !Array.isArray(encoded.tokens)) throw new TypeError('encoded.tokens must be an array');
  if (!Number.isSafeInteger(encoded.byteLength) || encoded.byteLength < 0) {
    throw new RangeError('encoded.byteLength must be a non-negative safe integer');
  }
  const maxOutputBytes = options.maxOutputBytes ?? 64 * 1024 * 1024;
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 0) {
    throw new RangeError('maxOutputBytes must be a non-negative safe integer');
  }
  if (encoded.byteLength > maxOutputBytes) throw new RangeError('declared output exceeds maxOutputBytes');

  const output = [];
  for (const [index, token] of encoded.tokens.entries()) {
    if (!token || !Number.isInteger(token.distance) || !Number.isInteger(token.length)) {
      throw new TypeError(`invalid token at index ${index}`);
    }
    if (token.distance === 0 && token.length === 0) {
      assertByte(token.nextByte, `token ${index}.nextByte`);
      output.push(token.nextByte);
    } else {
      if (token.distance < 1 || token.distance > output.length || token.length < 1) {
        throw new RangeError(`invalid back-reference at token ${index}`);
      }
      for (let copied = 0; copied < token.length; copied += 1) {
        output.push(output[output.length - token.distance]);
        if (output.length > encoded.byteLength || output.length > maxOutputBytes) {
          throw new RangeError('decoded output exceeds declared length');
        }
      }
      if (token.nextByte !== null) {
        assertByte(token.nextByte, `token ${index}.nextByte`);
        output.push(token.nextByte);
      }
    }
    if (output.length > encoded.byteLength) throw new RangeError('decoded output exceeds declared length');
  }
  if (output.length !== encoded.byteLength) {
    throw new Error(`decoded ${output.length} bytes; expected ${encoded.byteLength}`);
  }
  return Uint8Array.from(output);
}

function compressText(text, options) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  return compressBytes(new TextEncoder().encode(text), options);
}

function decompressText(encoded, options) {
  return new TextDecoder('utf-8', { fatal: true }).decode(decompressBytes(encoded, options));
}

function runTests() {
  const assert = require('node:assert/strict');
  const samples = [
    '', 'a', 'aaaaaa', 'abcabcabcabc', 'abracadabra abracadabra',
    '😀🙂😀🙂 — Unicode survives UTF-8 byte encoding',
    'the quick brown fox jumps over the lazy dog'.repeat(8)
  ];
  for (const sample of samples) {
    const encoded = compressText(sample, { windowSize: 48, lookaheadSize: 24 });
    assert.equal(decompressText(encoded), sample);
  }

  const binary = Uint8Array.from([0, 255, 0, 255, 0, 255, 17, 17, 17, 17]);
  assert.deepEqual(decompressBytes(compressBytes(binary)), binary);
  const overlap = { byteLength: 12, tokens: [
    { distance: 0, length: 0, nextByte: 0 },
    { distance: 1, length: 11, nextByte: null }
  ] };
  assert.deepEqual(Array.from(decompressBytes(overlap)), Array(12).fill(0));
  assert.throws(() => decompressBytes({ byteLength: 2, tokens: [{ distance: 1, length: 2, nextByte: null }] }), /back-reference/);
  assert.throws(() => decompressBytes({ byteLength: 1, tokens: [{ distance: 0, length: 0, nextByte: 300 }] }), /byte/);

  let seed = 0x12345678;
  for (let trial = 0; trial < 250; trial += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const length = seed % 180;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      bytes[i] = (seed >>> 24) % 12;
    }
    assert.deepEqual(decompressBytes(compressBytes(bytes, { windowSize: 31, lookaheadSize: 19 })), bytes);
  }
  console.log('LZ77 codec: all tests passed (250 randomized byte arrays).');
}

if (require.main === module) runTests();
module.exports = { compressBytes, decompressBytes, compressText, decompressText };
