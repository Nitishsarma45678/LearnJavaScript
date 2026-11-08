"use strict";

// FKM de Bruijn sequence generator.
// A cyclic sequence of length |alphabet|^order in which every possible
// order-length word occurs exactly once as a cyclic window.

const assert = require("node:assert/strict");

function generateDeBruijnSequence(alphabet, order, options = {}) {
  if (!Array.isArray(alphabet) || alphabet.length === 0) {
    throw new TypeError("alphabet must be a non-empty array");
  }
  if (!Number.isInteger(order) || order <= 0) {
    throw new RangeError("order must be a positive integer");
  }
  if (alphabet.some(symbol =>
    symbol === null || !["string", "number", "boolean", "bigint"].includes(typeof symbol)
  )) {
    throw new TypeError("alphabet symbols must be non-null primitive values");
  }
  if (new Set(alphabet).size !== alphabet.length) {
    throw new RangeError("alphabet symbols must be unique");
  }

  const maxSymbols = options.maxSymbols ?? 1_000_000;
  if (!Number.isSafeInteger(maxSymbols) || maxSymbols <= 0) {
    throw new RangeError("maxSymbols must be a positive safe integer");
  }

  const k = alphabet.length;
  const outputLength = BigInt(k) ** BigInt(order);
  if (outputLength > BigInt(maxSymbols)) {
    throw new RangeError("requested sequence exceeds maxSymbols");
  }

  // With one symbol there is exactly one cyclic word, regardless of order.
  if (k === 1) {
    const result = [alphabet[0]];
    return options.linear ? result.concat(Array(order - 1).fill(alphabet[0])) : result;
  }

  const digits = new Array(order * k + 1).fill(0);
  const indices = [];

  function build(position, period) {
    if (position > order) {
      if (order % period === 0) {
        for (let i = 1; i <= period; i++) indices.push(digits[i]);
      }
      return;
    }

    digits[position] = digits[position - period];
    build(position + 1, period);

    for (let symbol = digits[position - period] + 1; symbol < k; symbol++) {
      digits[position] = symbol;
      build(position + 1, position);
    }
  }

  build(1, 1);

  const sequence = indices.map(index => alphabet[index]);
  if (sequence.length !== Number(outputLength)) {
    throw new Error("internal error: generated sequence has an invalid length");
  }

  return options.linear
    ? sequence.concat(sequence.slice(0, order - 1))
    : sequence;
}

// ------------------------------- Tests ---------------------------------

function assertDeBruijn(sequence, alphabet, order) {
  const cyclicLength = alphabet.length ** order;
  assert.equal(sequence.length, cyclicLength);

  const words = new Set();
  for (let start = 0; start < cyclicLength; start++) {
    const word = [];
    for (let offset = 0; offset < order; offset++) {
      word.push(sequence[(start + offset) % cyclicLength]);
    }
    words.add(JSON.stringify(word));
  }

  assert.equal(words.size, cyclicLength, "every cyclic word must occur exactly once");
}

function runTests() {
  const binary = generateDeBruijnSequence(["0", "1"], 3);
  assertDeBruijn(binary, ["0", "1"], 3);
  assert.equal(binary.length, 8);

  const ternary = generateDeBruijnSequence([0, 1, 2], 2);
  assertDeBruijn(ternary, [0, 1, 2], 2);
  assert.equal(ternary.length, 9);

  const symbols = ["red", "green"];
  const custom = generateDeBruijnSequence(symbols, 4);
  assertDeBruijn(custom, symbols, 4);

  const linear = generateDeBruijnSequence(["a", "b"], 3, { linear: true });
  assert.equal(linear.length, 10);
  for (let i = 0; i < 8; i++) {
    assert.deepEqual(linear.slice(i, i + 3), [
      linear[i], linear[i + 1], linear[i + 2]
    ]);
  }

  assert.deepEqual(generateDeBruijnSequence(["x"], 5), ["x"]);
  assert.deepEqual(generateDeBruijnSequence(["x"], 5, { linear: true }),
    ["x", "x", "x", "x", "x"]);
  assert.throws(() => generateDeBruijnSequence([], 2), TypeError);
  assert.throws(() => generateDeBruijnSequence(["a", "a"], 2), RangeError);
  assert.throws(() => generateDeBruijnSequence(["a", "b"], 0), RangeError);
  assert.throws(() => generateDeBruijnSequence(["a", "b"], 30), RangeError);

  console.log("De Bruijn sequence generator: all tests passed.");
}

if (require.main === module) runTests();

module.exports = { generateDeBruijnSequence };
