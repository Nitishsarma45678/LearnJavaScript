'use strict';

// Exercise: implement a greedy LZ77 encoder and decoder over Unicode code points.
// Match tokens use backward distance and length; overlapping copies are supported.

const assert = require('node:assert/strict');

function lz77Compress(text, { windowSize = 64, lookaheadSize = 32, minMatch = 3 } = {}) {
  if (typeof text !== 'string' || !Number.isInteger(windowSize) || windowSize < 1 ||
      !Number.isInteger(lookaheadSize) || lookaheadSize < 1 ||
      !Number.isInteger(minMatch) || minMatch < 2) {
    throw new TypeError('invalid input or LZ77 configuration');
  }
  const input = Array.from(text);
  const tokens = [];

  for (let i = 0; i < input.length;) {
    let bestLength = 0;
    let bestDistance = 0;
    const earliest = Math.max(0, i - windowSize);

    for (let candidate = i - 1; candidate >= earliest; candidate -= 1) {
      const distance = i - candidate;
      let length = 0;
      while (length < lookaheadSize && i + length < input.length &&
        input[candidate + length] === input[i + length]) {
        length += 1;
      }
      if (length > bestLength) {
        bestLength = length;
        bestDistance = distance;
      }
    }

    if (bestLength >= minMatch) {
      tokens.push({ type: 'match', distance: bestDistance, length: bestLength });
      i += bestLength;
    } else {
      tokens.push({ type: 'literal', value: input[i] });
      i += 1;
    }
  }
  return tokens;
}

function lz77Decompress(tokens) {
  if (!Array.isArray(tokens)) throw new TypeError('tokens must be an array');
  const output = [];
  for (const token of tokens) {
    if (token?.type === 'literal' && typeof token.value === 'string' &&
        Array.from(token.value).length === 1) {
      output.push(token.value);
    } else if (token?.type === 'match' && Number.isInteger(token.distance) &&
      Number.isInteger(token.length) && token.distance > 0 &&
      token.distance <= output.length && token.length > 0) {
      for (let i = 0; i < token.length; i += 1) {
        output.push(output[output.length - token.distance]);
      }
    } else {
      throw new TypeError('invalid LZ77 token');
    }
  }
  return output.join('');
}

const samples = ['', 'abracadabra abracadabra', 'aaaaaaaaaaaa', '🙂🙃🙂🙃🙂'];
for (const sample of samples) {
  assert.equal(lz77Decompress(lz77Compress(sample)), sample);
}
assert.ok(lz77Compress('aaaaaaaaaaaa').some((token) => token.type === 'match'));
assert.throws(() => lz77Decompress([{ type: 'match', distance: 1, length: 2 }]), TypeError);

module.exports = { lz77Compress, lz77Decompress };
