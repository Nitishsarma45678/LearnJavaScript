'use strict';

// Exercise: pack a bit sequence into 32-bit words and support rank/select.
// rank1(end) counts ones in [0, end); select1(k) returns the zero-based
// position of the k-th one, or -1 when k is out of range.

const assert = require('node:assert/strict');

function popcount32(value) {
  let x = value >>> 0;
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}

class SuccinctBitVector {
  constructor(bits) {
    if (typeof bits === 'string') {
      if (!/^[01]*$/.test(bits)) throw new TypeError('bit string may contain only 0 and 1');
      bits = Array.from(bits, Number);
    }
    if (!Array.isArray(bits) || bits.some((bit) => bit !== 0 && bit !== 1 && bit !== false && bit !== true)) {
      throw new TypeError('bits must be an array of zeroes and ones');
    }
    this.length = bits.length;
    this.words = new Uint32Array(Math.ceil(bits.length / 32));
    for (let i = 0; i < bits.length; i += 1) {
      if (bits[i]) this.words[i >>> 5] |= 1 << (i & 31);
    }
    this.prefix = new Uint32Array(this.words.length + 1);
    for (let i = 0; i < this.words.length; i += 1) {
      this.prefix[i + 1] = this.prefix[i] + popcount32(this.words[i]);
    }
  }

  _checkEnd(end) {
    if (!Number.isInteger(end) || end < 0 || end > this.length) {
      throw new RangeError('rank endpoint outside bitvector');
    }
  }

  rank1(end) {
    this._checkEnd(end);
    const word = end >>> 5;
    const offset = end & 31;
    let count = this.prefix[word];
    if (offset && word < this.words.length) {
      count += popcount32(this.words[word] & ((1 << offset) - 1));
    }
    return count;
  }

  rank0(end) {
    this._checkEnd(end);
    return end - this.rank1(end);
  }

  _select(k, rank) {
    if (!Number.isInteger(k) || k < 0 || k >= rank(this.length)) return -1;
    let low = 0, high = this.length - 1;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (rank(mid + 1) > k) high = mid;
      else low = mid + 1;
    }
    return low;
  }

  select1(k) { return this._select(k, (end) => this.rank1(end)); }
  select0(k) { return this._select(k, (end) => this.rank0(end)); }
}

const bits = new SuccinctBitVector('101001');
assert.equal(bits.rank1(4), 2);
assert.equal(bits.rank0(6), 3);
assert.equal(bits.select1(0), 0);
assert.equal(bits.select1(2), 5);
assert.equal(bits.select0(1), 2);
assert.equal(bits.select1(3), -1);
assert.equal(new SuccinctBitVector('').rank0(0), 0);
assert.throws(() => bits.rank1(7), RangeError);

module.exports = { SuccinctBitVector, popcount32 };
