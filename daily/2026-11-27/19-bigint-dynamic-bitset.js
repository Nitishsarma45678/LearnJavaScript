'use strict';

// Exercise: implement a dynamically sized bit set with BigInt-backed storage.
// Support set algebra, cardinality, iteration and efficient lowest-set-bit scans.

class BitSet {
  constructor(bits = 0n) {
    if (typeof bits !== 'bigint' || bits < 0n) throw new TypeError('bits must be a non-negative BigInt');
    this.bits = bits;
  }
  add(index) {
    this.#check(index);
    this.bits |= 1n << BigInt(index);
    return this;
  }
  delete(index) {
    this.#check(index);
    this.bits &= ~(1n << BigInt(index));
    return this;
  }
  has(index) {
    this.#check(index);
    return (this.bits & (1n << BigInt(index))) !== 0n;
  }
  union(other) { return new BitSet(this.bits | other.bits); }
  intersect(other) { return new BitSet(this.bits & other.bits); }
  difference(other) { return new BitSet(this.bits & ~other.bits); }
  symmetricDifference(other) { return new BitSet(this.bits ^ other.bits); }
  isSubsetOf(other) { return (this.bits & other.bits) === this.bits; }
  get size() {
    let value = this.bits;
    let count = 0;
    while (value) {
      value &= value - 1n;
      count += 1;
    }
    return count;
  }
  *values() {
    let remaining = this.bits;
    while (remaining) {
      const lowest = remaining & -remaining;
      yield lowest.toString(2).length - 1;
      remaining ^= lowest;
    }
  }
  #check(index) {
    if (!Number.isSafeInteger(index) || index < 0) throw new RangeError('Index must be a non-negative safe integer');
  }
}

const assert = require('node:assert/strict');
const a = new BitSet().add(1).add(65).add(130);
const b = new BitSet().add(65).add(66);
assert.equal(a.size, 3);
assert.equal(a.has(130), true);
assert.deepEqual([...a.union(b).values()], [1, 65, 66, 130]);
assert.deepEqual([...a.intersect(b).values()], [65]);
assert.deepEqual([...a.difference(b).values()], [1, 130]);
assert.equal(new BitSet().add(1).isSubsetOf(a), true);
a.delete(65);
assert.equal(a.has(65), false);
console.log('BigInt bitset tests passed');

module.exports = { BitSet };
