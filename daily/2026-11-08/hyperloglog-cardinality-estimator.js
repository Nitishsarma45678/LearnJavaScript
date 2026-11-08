'use strict';

// Exercise: Implement HyperLogLog for approximate distinct-string counting.
// Include a stable 64-bit hash, small-cardinality correction, register-wise
// merging, and portable JSON serialization.
//
// Memory is O(2^precision); add is O(1). The hash function is deterministic,
// not cryptographic, and is intended only for this learning exercise.

const assert = require('node:assert/strict');

const MASK_64 = (1n << 64n) - 1n;
const HASH_SPACE = 18446744073709551616;

function hash64(value) {
  if (typeof value !== 'string') throw new TypeError('HyperLogLog keys must be strings');
  const bytes = new TextEncoder().encode(value);
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & MASK_64;
  }

  // MurmurHash3-style finalizer to spread FNV's structured output.
  hash ^= hash >> 33n;
  hash = (hash * 0xff51afd7ed558ccdn) & MASK_64;
  hash ^= hash >> 33n;
  hash = (hash * 0xc4ceb9fe1a85ec53n) & MASK_64;
  hash ^= hash >> 33n;
  return hash & MASK_64;
}

class HyperLogLog {
  constructor(precision = 10) {
    if (!Number.isInteger(precision) || precision < 4 || precision > 16) {
      throw new RangeError('precision must be an integer from 4 through 16');
    }
    this.precision = precision;
    this.registerCount = 1 << precision;
    this.tailBits = 64 - precision;
    this.registers = new Uint8Array(this.registerCount);
  }

  add(value) {
    const hash = hash64(value);
    const index = Number(hash >> BigInt(this.tailBits));
    const tailMask = (1n << BigInt(this.tailBits)) - 1n;
    let tail = hash & tailMask;
    let rank = 1;
    let bit = 1n << BigInt(this.tailBits - 1);

    while (bit !== 0n && (tail & bit) === 0n) {
      rank += 1;
      bit >>= 1n;
    }

    if (rank > this.registers[index]) this.registers[index] = rank;
    return this;
  }

  addAll(values) {
    for (const value of values) this.add(value);
    return this;
  }

  merge(other) {
    if (!(other instanceof HyperLogLog) || other.precision !== this.precision) {
      throw new TypeError('Only HyperLogLog sketches with equal precision can merge');
    }
    for (let i = 0; i < this.registerCount; i += 1) {
      if (other.registers[i] > this.registers[i]) {
        this.registers[i] = other.registers[i];
      }
    }
    return this;
  }

  estimate() {
    const m = this.registerCount;
    const alpha = m === 16 ? 0.673
      : m === 32 ? 0.697
        : m === 64 ? 0.709
          : 0.7213 / (1 + 1.079 / m);

    let inverseSum = 0;
    let zeroRegisters = 0;
    for (const register of this.registers) {
      inverseSum += Math.pow(2, -register);
      if (register === 0) zeroRegisters += 1;
    }

    let estimate = alpha * m * m / inverseSum;
    if (estimate <= 2.5 * m && zeroRegisters > 0) {
      estimate = m * Math.log(m / zeroRegisters);
    } else if (estimate > HASH_SPACE / 30) {
      const ratio = Math.min(estimate / HASH_SPACE, 1 - Number.EPSILON);
      estimate = -HASH_SPACE * Math.log1p(-ratio);
    }
    return estimate;
  }

  toJSON() {
    return {
      precision: this.precision,
      registers: Array.from(this.registers)
    };
  }

  static fromJSON(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.registers)) {
      throw new TypeError('Invalid HyperLogLog snapshot');
    }
    const sketch = new HyperLogLog(snapshot.precision);
    if (snapshot.registers.length !== sketch.registerCount) {
      throw new RangeError('Register count does not match precision');
    }
    const maximumRank = sketch.tailBits + 1;
    snapshot.registers.forEach((value, index) => {
      if (!Number.isInteger(value) || value < 0 || value > maximumRank) {
        throw new RangeError('Invalid register value at index ' + index);
      }
      sketch.registers[index] = value;
    });
    return sketch;
  }
}

function runTests() {
  const tiny = new HyperLogLog(10).addAll(['alpha', 'alpha', 'beta']);
  assert.ok(Math.abs(tiny.estimate() - 2) < 0.1, 'small-range correction');
  assert.ok(new HyperLogLog(10).add('same').estimate() < 2);

  const all = new HyperLogLog(12);
  const left = new HyperLogLog(12);
  const right = new HyperLogLog(12);
  for (let i = 0; i < 20000; i += 1) {
    const key = 'customer-' + i;
    all.add(key);
    (i % 2 === 0 ? left : right).add(key);
  }
  const estimate = all.estimate();
  assert.ok(Math.abs(estimate - 20000) / 20000 < 0.08,
    'estimate should be within 8%, got ' + estimate);

  left.merge(right);
  assert.deepEqual(left.toJSON().registers, all.toJSON().registers);
  const restored = HyperLogLog.fromJSON(JSON.parse(JSON.stringify(all)));
  assert.equal(restored.estimate(), all.estimate());
  assert.throws(() => all.merge(new HyperLogLog(8)), /equal precision/);
  assert.throws(() => new HyperLogLog(3), /precision/);
  assert.throws(() => all.add(42), /strings/);

  console.log('HyperLogLog: all tests passed; estimate=' + estimate.toFixed(0));
}

if (require.main === module) runTests();
module.exports = { HyperLogLog, hash64 };
