// Sliding-window minimum and maximum in O(n) time.
// Each deque stores indices in monotonic value order; expired indices leave
// from the front and dominated indices leave from the back.

function windowExtrema(values, windowSize) {
  if (!Array.isArray(values)) throw new TypeError('values must be an array');
  if (!Number.isInteger(windowSize) || windowSize < 1 || windowSize > values.length) {
    throw new RangeError('windowSize must be an integer from 1 to values.length');
  }
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError('values must contain only finite numbers');
    }
  }

  const minDeque = [];
  const maxDeque = [];
  let minHead = 0;
  let maxHead = 0;
  const result = [];

  for (let i = 0; i < values.length; i += 1) {
    while (minHead < minDeque.length && minDeque[minHead] <= i - windowSize) minHead += 1;
    while (maxHead < maxDeque.length && maxDeque[maxHead] <= i - windowSize) maxHead += 1;

    while (minDeque.length > minHead && values[minDeque[minDeque.length - 1]] >= values[i]) {
      minDeque.pop();
    }
    while (maxDeque.length > maxHead && values[maxDeque[maxDeque.length - 1]] <= values[i]) {
      maxDeque.pop();
    }

    minDeque.push(i);
    maxDeque.push(i);

    if (i >= windowSize - 1) {
      result.push({
        start: i - windowSize + 1,
        min: values[minDeque[minHead]],
        max: values[maxDeque[maxHead]]
      });
    }

    // Periodically compact consumed prefixes so arrays do not retain a large
    // dead prefix for the entire scan.
    if (minHead > 1024 && minHead * 2 > minDeque.length) {
      minDeque.splice(0, minHead);
      minHead = 0;
    }
    if (maxHead > 1024 && maxHead * 2 > maxDeque.length) {
      maxDeque.splice(0, maxHead);
      maxHead = 0;
    }
  }
  return result;
}

const assert = require('node:assert/strict');

assert.deepEqual(windowExtrema([4, 2, 12, 3, -1, 6, 8], 3), [
  { start: 0, min: 2, max: 12 },
  { start: 1, min: 2, max: 12 },
  { start: 2, min: -1, max: 12 },
  { start: 3, min: -1, max: 6 },
  { start: 4, min: -1, max: 8 }
]);
assert.deepEqual(windowExtrema([5, 5, 5], 2), [
  { start: 0, min: 5, max: 5 },
  { start: 1, min: 5, max: 5 }
]);
assert.deepEqual(windowExtrema([-3, -7, -2], 1), [
  { start: 0, min: -3, max: -3 },
  { start: 1, min: -7, max: -7 },
  { start: 2, min: -2, max: -2 }
]);
assert.throws(() => windowExtrema([1, 2], 0), RangeError);
assert.throws(() => windowExtrema([1, Infinity], 1), TypeError);

console.log('monotonic deque tests passed');
