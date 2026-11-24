'use strict';

const assert = require('node:assert/strict');

class VEBNode {
  constructor(bits) {
    if (!Number.isInteger(bits) || bits < 1) throw new RangeError('Universe needs at least 2 values');
    this.bits = bits;
    this.universe = 2 ** bits;
    this.lowerBits = Math.floor(bits / 2);
    this.upperBits = bits - this.lowerBits;
    this.lowerSize = 2 ** this.lowerBits;
    this.min = null;
    this.max = null;
    this.summary = null;
    this.clusters = new Map();
  }

  high(x) { return Math.floor(x / this.lowerSize); }
  low(x) { return x % this.lowerSize; }
  index(high, low) { return high * this.lowerSize + low; }

  has(x) {
    if (!Number.isInteger(x) || x < 0 || x >= this.universe) return false;
    if (x === this.min || x === this.max) return true;
    if (this.bits === 1) return false;
    const cluster = this.clusters.get(this.high(x));
    return !!cluster && cluster.has(this.low(x));
  }

  insert(x) {
    this._validate(x);
    if (this.has(x)) return false;
    if (this.min === null) { this.min = this.max = x; return true; }
    if (x < this.min) [x, this.min] = [this.min, x];
    if (this.bits > 1) {
      const h = this.high(x), l = this.low(x);
      let cluster = this.clusters.get(h);
      if (!cluster) {
        cluster = new VEBNode(this.lowerBits);
        this.clusters.set(h, cluster);
      }
      if (cluster.min === null) {
        if (!this.summary) this.summary = new VEBNode(this.upperBits);
        this.summary.insert(h);
      }
      cluster.insert(l);
    }
    if (x > this.max) this.max = x;
    return true;
  }

  delete(x) {
    this._validate(x);
    if (!this.has(x)) return false;
    if (this.min === this.max) { this.min = this.max = null; return true; }
    if (this.bits === 1) {
      const other = x === 0 ? 1 : 0;
      this.min = this.max = other;
      return true;
    }
    if (x === this.min) {
      const firstCluster = this.summary.min;
      const cluster = this.clusters.get(firstCluster);
      x = this.index(firstCluster, cluster.min);
      this.min = x;
    }
    const h = this.high(x), l = this.low(x);
    const cluster = this.clusters.get(h);
    cluster.delete(l);
    if (cluster.min === null) {
      this.clusters.delete(h);
      this.summary.delete(h);
      if (this.summary.min === null) this.summary = null;
      if (x === this.max) {
        if (!this.summary) this.max = this.min;
        else {
          const lastCluster = this.summary.max;
          this.max = this.index(lastCluster, this.clusters.get(lastCluster).max);
        }
      }
    } else if (x === this.max) {
      this.max = this.index(h, cluster.max);
    }
    return true;
  }

  successor(x) {
    if (!Number.isInteger(x)) throw new TypeError('Query must be an integer');
    if (this.min === null || x >= this.max) return null;
    if (x < this.min) return this.min;
    if (this.bits === 1) return this.max;
    const h = this.high(x), l = this.low(x);
    const cluster = this.clusters.get(h);
    if (cluster && cluster.max !== null && l < cluster.max) {
      return this.index(h, cluster.successor(l));
    }
    if (!this.summary) return null;
    const nextCluster = this.summary.successor(h);
    return nextCluster === null ? null : this.index(nextCluster, this.clusters.get(nextCluster).min);
  }

  predecessor(x) {
    if (!Number.isInteger(x)) throw new TypeError('Query must be an integer');
    if (this.min === null || x <= this.min) return null;
    if (x > this.max) return this.max;
    if (this.bits === 1) return this.min;
    const h = this.high(x), l = this.low(x);
    const cluster = this.clusters.get(h);
    if (cluster && cluster.min !== null && l > cluster.min) {
      return this.index(h, cluster.predecessor(l));
    }
    if (!this.summary) return this.min;
    const previousCluster = this.summary.predecessor(h);
    return previousCluster === null ? this.min : this.index(previousCluster, this.clusters.get(previousCluster).max);
  }

  _validate(x) {
    if (!Number.isInteger(x) || x < 0 || x >= this.universe) throw new RangeError('Key outside universe');
  }
}

const set = new VEBNode(4);
[2, 3, 7, 14, 9].forEach(value => set.insert(value));
assert.equal(set.has(7), true);
assert.equal(set.successor(3), 7);
assert.equal(set.successor(14), null);
assert.equal(set.predecessor(8), 7);
assert.equal(set.predecessor(1), null);
assert.equal(set.delete(7), true);
assert.equal(set.successor(3), 9);
assert.equal(set.has(7), false);
assert.equal(set.delete(7), false);
assert.throws(() => set.insert(16), RangeError);
console.log('van Emde Boas examples passed.');

module.exports = { VEBNode };
