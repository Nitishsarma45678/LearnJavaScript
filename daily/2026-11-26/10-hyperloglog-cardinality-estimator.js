'use strict';

// Exercise: implement HyperLogLog with a deterministic 64-bit FNV-1a hash,
// register updates, small-range correction, and relative-error estimates.

const assert = require('node:assert/strict');

const MASK_64 = (1n << 64n) - 1n;

function hash64(value) {
  const bytes = Buffer.from(String(value), 'utf8');
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & MASK_64;
  }
  return hash;
}

class HyperLogLog {
  constructor(precision = 10) {
    if (!Number.isInteger(precision) || precision < 4 || precision > 16) {
      throw new RangeError('precision must be between 4 and 16');
    }
    this.precision = precision;
    this.m = 1 << precision;
    this.registers = new Uint8Array(this.m);
    this.remainingBits = 64 - precision;
  }

  add(value) {
    const hash = hash64(value);
    const index = Number(hash >> BigInt(this.remainingBits));
    const remainder = hash & ((1n << BigInt(this.remainingBits)) - 1n);
    let rank = 1;
    while (rank <= this.remainingBits &&
      ((remainder >> BigInt(this.remainingBits - rank)) & 1n) === 0n) rank += 1;
    if (rank > this.registers[index]) this.registers[index] = rank;
    return this;
  }

  merge(other) {
    if (!(other instanceof HyperLogLog) || other.precision !== this.precision) {
      throw new TypeError('HyperLogLog precision must match');
    }
    for (let i = 0; i < this.m; i += 1) {
      this.registers[i] = Math.max(this.registers[i], other.registers[i]);
    }
    return this;
  }

  estimate() {
    const alpha = this.m === 16 ? 0.673 : this.m === 32 ? 0.697 :
      this.m === 64 ? 0.709 : 0.7213 / (1 + 1.079 / this.m);
    let denominator = 0;
    let zeros = 0;
    for (const register of this.registers) {
      denominator += 2 ** -register;
      if (register === 0) zeros += 1;
    }
    let estimate = alpha * this.m * this.m / denominator;
    if (estimate <= 2.5 * this.m && zeros > 0) {
      estimate = this.m * Math.log(this.m / zeros);
    }
    return estimate;
  }
}

const left = new HyperLogLog(10);
const right = new HyperLogLog(10);
for (let i = 0; i < 5000; i += 1) (i % 2 ? left : right).add('user-' + i);
left.merge(right);
const estimate = left.estimate();
assert.ok(Math.abs(estimate - 5000) / 5000 < 0.12, String(estimate));
assert.ok(new HyperLogLog(10).estimate() === 0);
assert.equal(new HyperLogLog(8).add('same').add('same').estimate() < 2, true);
assert.throws(() => new HyperLogLog(3), RangeError);

module.exports = { HyperLogLog, hash64 };
