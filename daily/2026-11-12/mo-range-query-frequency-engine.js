'use strict';

/**
 * Mo's algorithm for offline range statistics over a static finite-number array.
 * Queries use half-open [left,right) ranges. Answers include distinct count,
 * equal-value pairs, maximum frequency, sum, and optional value frequency.
 */
function answerMoQueries(values, queries, { blockSize = null } = {}) {
  if (!Array.isArray(values) || values.some(value => !Number.isFinite(value))) {
    throw new TypeError('values must be an array of finite numbers');
  }
  if (!Array.isArray(queries)) throw new TypeError('queries must be an array');
  const n = values.length;
  const size = blockSize ?? Math.max(1, Math.floor(Math.sqrt(Math.max(1, n))));
  if (!Number.isInteger(size) || size < 1) throw new RangeError('blockSize must be positive');

  const unique = [...new Set(values)].sort((a, b) => a - b);
  const idByValue = new Map(unique.map((value, id) => [value, id]));
  const compressed = values.map(value => idByValue.get(value));
  const frequency = new Int32Array(unique.length);
  const frequencyBuckets = new Int32Array(n + 1);
  frequencyBuckets[0] = unique.length;

  const ordered = queries.map((query, index) => {
    if (!query || !Number.isInteger(query.left) || !Number.isInteger(query.right) ||
        query.left < 0 || query.right < query.left || query.right > n) {
      throw new RangeError(`query ${index} must satisfy 0 <= left <= right <= ${n}`);
    }
    return { ...query, index, block: Math.floor(query.left / size) };
  });

  ordered.sort((a, b) => a.block - b.block ||
    (a.block % 2 === 0 ? a.right - b.right : b.right - a.right));

  let left = 0;
  let right = 0;
  let distinctCount = 0;
  let equalPairs = 0;
  let maximumFrequency = 0;
  let sum = 0;

  function add(position) {
    const id = compressed[position];
    const oldCount = frequency[id];
    frequencyBuckets[oldCount]--;
    frequency[id]++;
    frequencyBuckets[oldCount + 1]++;
    if (oldCount === 0) distinctCount++;
    equalPairs += oldCount;
    maximumFrequency = Math.max(maximumFrequency, oldCount + 1);
    sum += values[position];
  }

  function remove(position) {
    const id = compressed[position];
    const oldCount = frequency[id];
    if (oldCount <= 0) throw new Error('internal frequency underflow');
    frequencyBuckets[oldCount]--;
    frequency[id]--;
    frequencyBuckets[oldCount - 1]++;
    if (oldCount === 1) distinctCount--;
    equalPairs -= oldCount - 1;
    sum -= values[position];
    while (maximumFrequency > 0 && frequencyBuckets[maximumFrequency] === 0) {
      maximumFrequency--;
    }
  }

  const answers = new Array(queries.length);
  for (const query of ordered) {
    while (left > query.left) add(--left);
    while (right < query.right) add(right++);
    while (left < query.left) remove(left++);
    while (right > query.right) remove(--right);

    const answer = {
      distinctCount,
      equalPairs,
      maximumFrequency,
      sum
    };
    if (Object.prototype.hasOwnProperty.call(query, 'value')) {
      const id = idByValue.get(query.value);
      answer.requestedFrequency = id === undefined ? 0 : frequency[id];
    }
    answers[query.index] = Object.freeze(answer);
  }
  return answers;
}

function runTests() {
  const assert = require('node:assert/strict');
  const values = [1, 2, 1, 3, 2, 1, -4];
  assert.deepEqual(answerMoQueries(values, [
    { left: 0, right: 6, value: 1 },
    { left: 1, right: 5, value: 9 },
    { left: 3, right: 3 },
    { left: 0, right: 7 }
  ]), [
    { distinctCount: 3, equalPairs: 4, maximumFrequency: 3, sum: 10, requestedFrequency: 3 },
    { distinctCount: 3, equalPairs: 1, maximumFrequency: 2, sum: 8, requestedFrequency: 0 },
    { distinctCount: 0, equalPairs: 0, maximumFrequency: 0, sum: 0 },
    { distinctCount: 4, equalPairs: 4, maximumFrequency: 3, sum: 6 }
  ]);
  assert.deepEqual(answerMoQueries([], [{ left: 0, right: 0 }]), [
    { distinctCount: 0, equalPairs: 0, maximumFrequency: 0, sum: 0 }
  ]);
  assert.throws(() => answerMoQueries([1, 2], [{ left: 2, right: 1 }]), RangeError);

  function brute(data, query) {
    const slice = data.slice(query.left, query.right);
    const counts = new Map();
    for (const value of slice) counts.set(value, (counts.get(value) || 0) + 1);
    const frequencies = [...counts.values()];
    return {
      distinctCount: counts.size,
      equalPairs: frequencies.reduce((total, count) => total + count * (count - 1) / 2, 0),
      maximumFrequency: frequencies.length ? Math.max(...frequencies) : 0,
      sum: slice.reduce((total, value) => total + value, 0),
      ...(Object.prototype.hasOwnProperty.call(query, 'value')
        ? { requestedFrequency: counts.get(query.value) || 0 } : {})
    };
  }

  let seed = 0x0a0b0c;
  const random = max => {
    seed = (Math.imul(seed, 22695477) + 1) >>> 0;
    return seed % max;
  };
  for (let trial = 0; trial < 220; trial++) {
    const data = Array.from({ length: random(55) }, () => random(13) - 6);
    const batch = [];
    for (let i = 0; i < 50; i++) {
      const left = random(data.length + 1);
      const right = left + random(data.length - left + 1);
      const query = { left, right };
      if (random(2)) query.value = random(17) - 8;
      batch.push(query);
    }
    assert.deepEqual(answerMoQueries(data, batch), batch.map(query => brute(data, query)));
  }
  console.log('Mo range-query tests passed');
}

if (require.main === module) runTests();
module.exports = { answerMoQueries };
