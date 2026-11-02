const assert = require('node:assert/strict');

function popcount32(value) {
  let x = value >>> 0;
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
}

class BitSet {
  constructor(size) {
    if (!Number.isInteger(size) || size < 0) throw new RangeError('size must be non-negative');
    this.size = size;
    this.words = new Uint32Array(Math.ceil(size / 32));
  }

  check(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.size) {
      throw new RangeError('bit index out of range');
    }
  }

  add(index) {
    this.check(index);
    this.words[index >>> 5] |= (1 << (index & 31));
    return this;
  }

  delete(index) {
    this.check(index);
    this.words[index >>> 5] &= ~(1 << (index & 31));
    return this;
  }

  has(index) {
    this.check(index);
    return (this.words[index >>> 5] & (1 << (index & 31))) !== 0;
  }

  clear() {
    this.words.fill(0);
    return this;
  }

  assertCompatible(other) {
    if (!(other instanceof BitSet) || other.size !== this.size) {
      throw new TypeError('bitsets must have the same size');
    }
  }

  union(other) {
    this.assertCompatible(other);
    const result = new BitSet(this.size);
    for (let i = 0; i < this.words.length; i++) result.words[i] = this.words[i] | other.words[i];
    return result;
  }

  intersection(other) {
    this.assertCompatible(other);
    const result = new BitSet(this.size);
    for (let i = 0; i < this.words.length; i++) result.words[i] = this.words[i] & other.words[i];
    return result;
  }

  difference(other) {
    this.assertCompatible(other);
    const result = new BitSet(this.size);
    for (let i = 0; i < this.words.length; i++) result.words[i] = this.words[i] & ~other.words[i];
    return result;
  }

  count() {
    let total = 0;
    for (const word of this.words) total += popcount32(word);
    return total;
  }

  toArray() {
    const values = [];
    for (let i = 0; i < this.size; i++) if (this.has(i)) values.push(i);
    return values;
  }
}

const a = new BitSet(70).add(0).add(31).add(32).add(69);
const b = new BitSet(70).add(31).add(33).add(69);
assert.deepEqual(a.union(b).toArray(), [0,31,32,33,69]);
assert.deepEqual(a.intersection(b).toArray(), [31,69]);
assert.deepEqual(a.difference(b).toArray(), [0,32]);
assert.equal(a.count(), 4);
a.delete(31);
assert.equal(a.has(31), false);
assert.throws(() => a.has(70), RangeError);
assert.throws(() => a.union(new BitSet(69)), TypeError);
assert.equal(new BitSet(0).count(), 0);
console.log('Dynamic bitset tests passed');