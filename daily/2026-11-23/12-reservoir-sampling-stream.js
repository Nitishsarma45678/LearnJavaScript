// Exercise: Sample k items uniformly from a stream without storing the stream.
// Implement Algorithm R for sync and async iterables. Inject the random source
// so the algorithm is deterministic in tests.
//
// Run: node 12-reservoir-sampling-stream.js
const assert = require("node:assert/strict");

function validateArguments(k, random) {
  if (!Number.isInteger(k) || k < 0) throw new RangeError("k must be a non-negative integer");
  if (typeof random !== "function") throw new TypeError("random must be a function");
}

function drawIndex(random, upperExclusive) {
  const value = random();
  if (!(value >= 0 && value < 1)) throw new RangeError("random() must return a value in [0, 1)");
  return Math.floor(value * upperExclusive);
}

function reservoirSample(iterable, k, random = Math.random) {
  validateArguments(k, random);
  if (iterable == null || typeof iterable[Symbol.iterator] !== "function") {
    throw new TypeError("input must be iterable");
  }

  const sample = [];
  let seen = 0;
  for (const item of iterable) {
    seen += 1;
    if (sample.length < k) sample.push(item);
    else if (k > 0) {
      const slot = drawIndex(random, seen);
      if (slot < k) sample[slot] = item;
    }
  }
  return { sample, seen };
}

async function reservoirSampleAsync(iterable, k, random = Math.random) {
  validateArguments(k, random);
  if (iterable == null || typeof iterable[Symbol.asyncIterator] !== "function") {
    throw new TypeError("input must be an async iterable");
  }

  const sample = [];
  let seen = 0;
  for await (const item of iterable) {
    seen += 1;
    if (sample.length < k) sample.push(item);
    else if (k > 0) {
      const slot = drawIndex(random, seen);
      if (slot < k) sample[slot] = item;
    }
  }
  return { sample, seen };
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

// Example tests
(async () => {
  const sync = reservoirSample([1, 2, 3, 4, 5, 6], 3, seededRandom(42));
  assert.equal(sync.seen, 6);
  assert.equal(sync.sample.length, 3);
  assert.equal(new Set(sync.sample).size, 3);

  const empty = reservoirSample([1, 2], 0, () => 0.5);
  assert.deepEqual(empty, { sample: [], seen: 2 });
  const short = reservoirSample([1, 2], 5, () => 0.5);
  assert.deepEqual(short, { sample: [1, 2], seen: 2 });

  async function* source() {
    for (let i = 0; i < 20; i += 1) yield i;
  }
  const asyncResult = await reservoirSampleAsync(source(), 4, seededRandom(7));
  assert.equal(asyncResult.seen, 20);
  assert.equal(asyncResult.sample.length, 4);
  assert.equal(new Set(asyncResult.sample).size, 4);

  assert.throws(() => reservoirSample([], -1), /non-negative/);
  assert.throws(() => reservoirSample([1], 1, () => 1), /random/);
  console.log("reservoir sampling tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
