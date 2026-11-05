"use strict";

const assert = require("node:assert/strict");

/**
 * Wavelet Matrix over unsigned 32-bit integers.
 *
 * Supports kth-smallest, count-less-than, frequency and range-frequency
 * queries on half-open subarrays. Construction uses 32 stable partitions and
 * O(32n) memory; each query takes O(32) time.
 */
class WaveletMatrix {
  constructor(values) {
    if (!Array.isArray(values)) throw new TypeError("values must be an array");
    for (const value of values) {
      if (!Number.isInteger(value) || value < 0 || value > 0xFFFFFFFF) {
        throw new RangeError("wavelet values must be unsigned 32-bit integers");
      }
    }

    this.length = values.length;
    this.levels = 32;
    this.zeroCounts = new Uint32Array(this.levels);
    this.prefixZeros = new Array(this.levels);
    let current = Uint32Array.from(values);

    for (let level = 0; level < this.levels; level++) {
      const bit = 31 - level;
      const prefix = new Uint32Array(current.length + 1);
      const zeros = [];
      const ones = [];
      for (let i = 0; i < current.length; i++) {
        const value = current[i];
        const isZero = ((value >>> bit) & 1) === 0;
        prefix[i + 1] = prefix[i] + (isZero ? 1 : 0);
        (isZero ? zeros : ones).push(value);
      }
      this.prefixZeros[level] = prefix;
      this.zeroCounts[level] = zeros.length;
      current = Uint32Array.from(zeros.concat(ones));
    }
  }

  _checkRange(left, right) {
    if (!Number.isInteger(left) || !Number.isInteger(right) ||
        left < 0 || right < left || right > this.length) {
      throw new RangeError("expected 0 <= left <= right <= length");
    }
  }

  kthSmallest(left, right, k) {
    this._checkRange(left, right);
    if (!Number.isInteger(k) || k < 0 || k >= right - left) {
      throw new RangeError("k must index an element in the selected range");
    }
    let answer = 0;
    for (let level = 0; level < this.levels; level++) {
      const prefix = this.prefixZeros[level];
      const zerosBeforeLeft = prefix[left];
      const zeroCount = prefix[right] - zerosBeforeLeft;
      if (k < zeroCount) {
        left = zerosBeforeLeft;
        right = prefix[right];
      } else {
        answer = (answer | (1 << (31 - level))) >>> 0;
        k -= zeroCount;
        left = this.zeroCounts[level] + left - zerosBeforeLeft;
        right = this.zeroCounts[level] + right - prefix[right];
      }
    }
    return answer >>> 0;
  }

  // Counts values strictly less than limit in [left, right).
  countLessThan(left, right, limit) {
    this._checkRange(left, right);
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > 0x100000000) {
      throw new RangeError("limit must be between 0 and 2^32");
    }
    if (limit === 0 || left === right) return 0;
    if (limit === 0x100000000) return right - left;

    let count = 0;
    for (let level = 0; level < this.levels; level++) {
      const bit = 31 - level;
      const prefix = this.prefixZeros[level];
      const zerosBeforeLeft = prefix[left];
      const zerosInRange = prefix[right] - zerosBeforeLeft;
      if (((limit >>> bit) & 1) === 1) {
        count += zerosInRange;
        left = this.zeroCounts[level] + left - zerosBeforeLeft;
        right = this.zeroCounts[level] + right - prefix[right];
      } else {
        left = zerosBeforeLeft;
        right = prefix[right];
      }
    }
    return count;
  }

  frequency(left, right, value) {
    if (!Number.isInteger(value) || value < 0 || value > 0xFFFFFFFF) {
      throw new RangeError("value must be an unsigned 32-bit integer");
    }
    return this.countLessThan(left, right, value + 1) -
      this.countLessThan(left, right, value);
  }

  // Counts values in the half-open value interval [low, high).
  rangeFrequency(left, right, low, high) {
    if (!Number.isSafeInteger(low) || !Number.isSafeInteger(high) ||
        low < 0 || high < low || high > 0x100000000) {
      throw new RangeError("invalid value interval");
    }
    return this.countLessThan(left, right, high) -
      this.countLessThan(left, right, low);
  }
}

function runTests() {
  const matrix = new WaveletMatrix([7, 1, 9, 1, 0, 0xFFFFFFFF, 4, 7]);
  assert.equal(matrix.kthSmallest(0, 8, 0), 0);
  assert.equal(matrix.kthSmallest(0, 8, 4), 7);
  assert.equal(matrix.kthSmallest(1, 7, 2), 1);
  assert.equal(matrix.countLessThan(0, 8, 7), 5);
  assert.equal(matrix.frequency(0, 8, 1), 2);
  assert.equal(matrix.frequency(0, 8, 0xFFFFFFFF), 1);
  assert.equal(matrix.rangeFrequency(0, 8, 1, 8), 4);
  assert.equal(matrix.rangeFrequency(2, 6, 0, 10), 3);
  assert.equal(matrix.countLessThan(0, 8, 0x100000000), 8);
  assert.throws(() => matrix.kthSmallest(0, 2, 2), RangeError);
  assert.throws(() => matrix.countLessThan(0, 8, -1), RangeError);

  let state = 918273;
  const random = max => ((state = (state * 48271) % 2147483647) % max);
  for (let trial = 0; trial < 30; trial++) {
    const data = Array.from({ length: 50 }, () => random(1 << 20));
    const wavelet = new WaveletMatrix(data);
    for (let query = 0; query < 70; query++) {
      const left = random(data.length + 1);
      const right = left + random(data.length - left + 1);
      const sorted = data.slice(left, right).sort((a, b) => a - b);
      if (sorted.length) {
        const k = random(sorted.length);
        assert.equal(wavelet.kthSmallest(left, right, k), sorted[k]);
      }
      const limit = random(1 << 20);
      assert.equal(
        wavelet.countLessThan(left, right, limit),
        data.slice(left, right).filter(value => value < limit).length
      );
      const low = random(1 << 20);
      const high = low + random((1 << 20) - low + 1);
      assert.equal(
        wavelet.rangeFrequency(left, right, low, high),
        data.slice(left, right).filter(value => value >= low && value < high).length
      );
    }
  }
  console.log("Wavelet matrix tests passed.");
}

if (require.main === module) runTests();

module.exports = { WaveletMatrix };
