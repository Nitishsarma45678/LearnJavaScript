'use strict';

// Exercise: build a 32-bit wavelet matrix supporting range kth and count-less
// queries. Ranges are half-open [left, right).

class WaveletMatrix {
  constructor(values) {
    if (values.some(value => !Number.isInteger(value) || value < 0 || value > 0xffffffff)) {
      throw new RangeError('Values must be unsigned 32-bit integers');
    }
    this.length = values.length;
    this.levels = [];
    let current = values.slice();
    for (let bit = 31; bit >= 0; bit -= 1) {
      const prefixZeros = new Uint32Array(current.length + 1);
      const zeros = [];
      const ones = [];
      for (let i = 0; i < current.length; i += 1) {
        const isZero = Math.floor(current[i] / (2 ** bit)) % 2 === 0;
        prefixZeros[i + 1] = prefixZeros[i] + (isZero ? 1 : 0);
        (isZero ? zeros : ones).push(current[i]);
      }
      this.levels.push({ bit, prefixZeros, zeroCount: zeros.length });
      current = zeros.concat(ones);
    }
  }

  #checkRange(left, right) {
    if (!Number.isInteger(left) || !Number.isInteger(right) ||
        left < 0 || right < left || right > this.length) {
      throw new RangeError('Invalid half-open range');
    }
  }

  countLessThan(left, right, value) {
    this.#checkRange(left, right);
    if (value <= 0) return 0;
    if (value >= 0x100000000) return right - left;
    let count = 0;
    for (const level of this.levels) {
      const zl = level.prefixZeros[left];
      const zr = level.prefixZeros[right];
      const zerosInRange = zr - zl;
      const bitIsOne = Math.floor(value / (2 ** level.bit)) % 2 === 1;
      if (bitIsOne) {
        count += zerosInRange;
        left = level.zeroCount + (left - zl);
        right = level.zeroCount + (right - zr);
      } else {
        left = zl;
        right = zr;
      }
    }
    return count;
  }

  kth(left, right, k) {
    this.#checkRange(left, right);
    if (!Number.isInteger(k) || k < 0 || k >= right - left) {
      throw new RangeError('k is outside the selected range');
    }
    let value = 0;
    for (const level of this.levels) {
      const zl = level.prefixZeros[left];
      const zr = level.prefixZeros[right];
      const zerosInRange = zr - zl;
      if (k < zerosInRange) {
        left = zl;
        right = zr;
      } else {
        k -= zerosInRange;
        value += 2 ** level.bit;
        left = level.zeroCount + (left - zl);
        right = level.zeroCount + (right - zr);
      }
    }
    return value;
  }
}

const assert = require('node:assert/strict');
const matrix = new WaveletMatrix([7, 1, 9, 3, 3, 12, 0]);
assert.equal(matrix.kth(1, 6, 0), 1);
assert.equal(matrix.kth(1, 6, 3), 7);
assert.equal(matrix.kth(0, 7, 6), 12);
assert.equal(matrix.countLessThan(1, 6, 4), 3);
assert.equal(matrix.countLessThan(0, 7, 8), 5);
assert.throws(() => matrix.kth(0, 2, 2), RangeError);
console.log('Wavelet matrix tests passed');

module.exports = { WaveletMatrix };
