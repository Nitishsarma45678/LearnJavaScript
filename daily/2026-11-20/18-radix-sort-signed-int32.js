// Exercise: Stable LSD radix sort for signed 32-bit integers.
// XOR with the sign bit maps signed order to unsigned lexicographic byte order.
// Run: node daily/2026-11-20/18-radix-sort-signed-int32.js
"use strict";
const assert = require("node:assert/strict");
function radixSortInt32(values) {
  if (!Array.isArray(values) || values.some(value =>
    !Number.isInteger(value) || value < -0x80000000 || value > 0x7fffffff)) {
    throw new TypeError("values must contain only signed 32-bit integers");
  }
  let source = values.map(value => (value ^ 0x80000000) >>> 0);
  let target = new Array(source.length);
  for (let shift = 0; shift < 32; shift += 8) {
    const counts = new Array(256).fill(0);
    for (const value of source) counts[(value >>> shift) & 0xff]++;
    let total = 0;
    for (let i = 0; i < counts.length; i++) {
      const frequency = counts[i]; counts[i] = total; total += frequency;
    }
    for (const value of source) {
      const bucket = (value >>> shift) & 0xff;
      target[counts[bucket]++] = value;
    }
    [source, target] = [target, source];
  }
  return source.map(value => (value ^ 0x80000000) | 0);
}
assert.deepEqual(radixSortInt32([3, -1, 0, -2147483648, 2147483647, -7, 3]),
  [-2147483648, -7, -1, 0, 3, 3, 2147483647]);
assert.deepEqual(radixSortInt32([]), []);
assert.deepEqual(radixSortInt32([5]), [5]);
const input = [9, -3, 2, -3, 0];
const copy = input.slice();
assert.deepEqual(radixSortInt32(input), [-3, -3, 0, 2, 9]);
assert.deepEqual(input, copy, "sorting must not mutate input");
assert.throws(() => radixSortInt32([1.5]), /32-bit/);
assert.throws(() => radixSortInt32([2147483648]), /32-bit/);
console.log("signed int32 radix sort: all tests passed");
