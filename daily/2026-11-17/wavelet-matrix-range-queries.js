"use strict";

/**
 * Exercise: Build a static Wavelet Matrix over safe integers.
 *
 * Supports half-open index ranges [left, right), count-less-than, inclusive
 * value-range frequency, exact frequency, and k-th smallest queries. Values
 * are coordinate-compressed, so duplicates and negative integers are handled.
 */

const assert = require("node:assert/strict");

function lowerBound(values, target) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (values[mid] < target) low = mid + 1;
    else high = mid;
  }
  return low;
}

function upperBound(values, target) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (values[mid] <= target) low = mid + 1;
    else high = mid;
  }
  return low;
}

class WaveletMatrix {
  constructor(input) {
    if (!Array.isArray(input)) throw new TypeError("input must be an array");
    for (const value of input) {
      if (!Number.isSafeInteger(value)) {
        throw new TypeError("WaveletMatrix values must be safe integers");
      }
    }

    this.length = input.length;
    this.values = [...new Set(input)].sort((a, b) => a - b);
    this.levels = Math.max(1, Math.ceil(Math.log2(Math.max(1, this.values.length))));

    const rankOf = new Map(this.values.map((value, rank) => [value, rank]));
    let current = input.map(value => rankOf.get(value));
    this.prefixZeros = [];
    this.zeroCounts = [];

    for (let level = 0; level < this.levels; level++) {
      const bit = this.levels - level - 1;
      const prefix = new Uint32Array(this.length + 1);
      const zeros = [];
      const ones = [];

      for (let i = 0; i < current.length; i++) {
        const rank = current[i];
        const isOne = Math.floor(rank / (2 ** bit)) % 2 === 1;
        prefix[i + 1] = prefix[i] + (isOne ? 0 : 1);
        (isOne ? ones : zeros).push(rank);
      }

      this.prefixZeros.push(prefix);
      this.zeroCounts.push(zeros.length);
      current = zeros.concat(ones);
    }
  }

  _validateRange(left, right) {
    if (
      !Number.isInteger(left) ||
      !Number.isInteger(right) ||
      left < 0 ||
      right < left ||
      right > this.length
    ) {
      throw new RangeError("expected 0 <= left <= right <= length");
    }
  }

  _countRanksBelow(left, right, rankExclusive) {
    if (rankExclusive <= 0 || left === right) return 0;
    if (rankExclusive >= this.values.length) return right - left;

    let count = 0;
    for (let level = 0; level < this.levels; level++) {
      const bit = this.levels - level - 1;
      const prefix = this.prefixZeros[level];
      const zeroCount = this.zeroCounts[level];
      const zerosBeforeLeft = prefix[left];
      const zerosBeforeRight = prefix[right];
      const rankHasBit = Math.floor(rankExclusive / (2 ** bit)) % 2 === 1;

      if (rankHasBit) {
        count += zerosBeforeRight - zerosBeforeLeft;
        left = zeroCount + (left - zerosBeforeLeft);
        right = zeroCount + (right - zerosBeforeRight);
      } else {
        left = zerosBeforeLeft;
        right = zerosBeforeRight;
      }
    }
    return count;
  }

  countLessThan(left, right, value) {
    this._validateRange(left, right);
    if (!Number.isSafeInteger(value)) throw new TypeError("value must be a safe integer");
    return this._countRanksBelow(left, right, lowerBound(this.values, value));
  }

  countInRange(left, right, minimum, maximum) {
    this._validateRange(left, right);
    if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum)) {
      throw new TypeError("range bounds must be safe integers");
    }
    if (minimum > maximum) return 0;

    const beforeMinimum = lowerBound(this.values, minimum);
    const throughMaximum = upperBound(this.values, maximum);
    return this._countRanksBelow(left, right, throughMaximum) -
      this._countRanksBelow(left, right, beforeMinimum);
  }

  frequency(left, right, value) {
    this._validateRange(left, right);
    if (!Number.isSafeInteger(value)) throw new TypeError("value must be a safe integer");
    const first = lowerBound(this.values, value);
    const after = upperBound(this.values, value);
    return this._countRanksBelow(left, right, after) -
      this._countRanksBelow(left, right, first);
  }

  kthSmallest(left, right, k) {
    this._validateRange(left, right);
    if (!Number.isInteger(k) || k < 0 || k >= right - left) {
      throw new RangeError("k must be a valid zero-based rank in the range");
    }

    let rank = 0;
    for (let level = 0; level < this.levels; level++) {
      const bit = this.levels - level - 1;
      const prefix = this.prefixZeros[level];
      const zeroCount = this.zeroCounts[level];
      const zerosBeforeLeft = prefix[left];
      const zerosBeforeRight = prefix[right];
      const zerosInRange = zerosBeforeRight - zerosBeforeLeft;

      if (k < zerosInRange) {
        left = zerosBeforeLeft;
        right = zerosBeforeRight;
      } else {
        k -= zerosInRange;
        rank += 2 ** bit;
        left = zeroCount + (left - zerosBeforeLeft);
        right = zeroCount + (right - zerosBeforeRight);
      }
    }

    return this.values[rank];
  }

  rangeMinimum(left, right) {
    return this.kthSmallest(left, right, 0);
  }

  rangeMaximum(left, right) {
    return this.kthSmallest(left, right, right - left - 1);
  }
}

function runTests() {
  const matrix = new WaveletMatrix([5, 1, 5, -2, 9, 1, 0]);
  assert.equal(matrix.countLessThan(0, 7, 5), 4);
  assert.equal(matrix.countInRange(0, 7, 1, 5), 4);
  assert.equal(matrix.frequency(0, 7, 5), 2);
  assert.equal(matrix.kthSmallest(0, 7, 0), -2);
  assert.equal(matrix.kthSmallest(0, 7, 3), 1);
  assert.equal(matrix.rangeMinimum(1, 6), -2);
  assert.equal(matrix.rangeMaximum(1, 6), 9);

  const empty = new WaveletMatrix([]);
  assert.equal(empty.countLessThan(0, 0, 10), 0);
  assert.equal(empty.countInRange(0, 0, -5, 5), 0);
  assert.throws(() => empty.kthSmallest(0, 0, 0), RangeError);
  assert.throws(() => new WaveletMatrix([1, 1.5]), TypeError);
  assert.throws(() => matrix.countLessThan(-1, 2, 3), RangeError);
  assert.equal(matrix.countInRange(0, 7, 10, 2), 0);

  // Differential tests against sorting and scanning each requested slice.
  let seed = 0x7123ab;
  const random = max => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed % max;
  };

  for (let trial = 0; trial < 180; trial++) {
    const data = Array.from({ length: random(35) }, () => random(31) - 15);
    const index = new WaveletMatrix(data);

    for (let query = 0; query < 12; query++) {
      const left = random(data.length + 1);
      const right = left + random(data.length - left + 1);
      const slice = data.slice(left, right);
      const sorted = [...slice].sort((a, b) => a - b);
      const threshold = random(41) - 20;
      const low = random(41) - 20;
      const high = random(41) - 20;

      assert.equal(
        index.countLessThan(left, right, threshold),
        slice.filter(value => value < threshold).length
      );
      assert.equal(
        index.frequency(left, right, threshold),
        slice.filter(value => value === threshold).length
      );
      assert.equal(
        index.countInRange(left, right, Math.min(low, high), Math.max(low, high)),
        slice.filter(value => value >= Math.min(low, high) && value <= Math.max(low, high)).length
      );

      if (sorted.length > 0) {
        const k = random(sorted.length);
        assert.equal(index.kthSmallest(left, right, k), sorted[k]);
        assert.equal(index.rangeMinimum(left, right), sorted[0]);
        assert.equal(index.rangeMaximum(left, right), sorted[sorted.length - 1]);
      } else {
        assert.equal(index.countLessThan(left, right, threshold), 0);
      }
    }
  }

  console.log("Wavelet Matrix: all tests passed");
}

module.exports = { WaveletMatrix };

if (require.main === module) runTests();
