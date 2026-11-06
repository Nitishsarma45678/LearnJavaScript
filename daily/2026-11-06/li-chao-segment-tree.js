'use strict';

const assert = require('node:assert/strict');

/**
 * Discrete Li Chao tree for minimum queries over a known, sorted coordinate set.
 * All arithmetic is BigInt, so line comparisons remain exact for large values.
 * addSegmentLine() inserts a line only on the inclusive coordinate interval.
 */
class LiChaoSegmentTree {
  constructor(coordinates) {
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      throw new TypeError('coordinates must be a non-empty array');
    }
    this.xs = [...coordinates].map((x) => {
      if (typeof x !== 'bigint') throw new TypeError('coordinates must be BigInt');
      return x;
    }).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    this.xs = this.xs.filter((x, i) => i === 0 || x !== this.xs[i - 1]);
    this.lines = new Array(this.xs.length * 4).fill(null);
    this.indexByX = new Map(this.xs.map((x, i) => [x, i]));
  }

  static evaluate(line, x) {
    return line.m * x + line.b;
  }

  static compareAt(a, b, x) {
    const av = LiChaoSegmentTree.evaluate(a, x);
    const bv = LiChaoSegmentTree.evaluate(b, x);
    if (av !== bv) return av < bv ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }

  _normalizeLine(m, b, id) {
    if (typeof m !== 'bigint' || typeof b !== 'bigint') {
      throw new TypeError('line slope and intercept must be BigInt');
    }
    return { m, b, id: String(id ?? `${m}:${b}`) };
  }

  addLine(m, b, id) {
    this._insertLine(1, 0, this.xs.length - 1, this._normalizeLine(m, b, id));
  }

  addSegmentLine(m, b, fromX, toX, id) {
    if (typeof fromX !== 'bigint' || typeof toX !== 'bigint') {
      throw new TypeError('segment bounds must be BigInt');
    }
    if (fromX > toX) throw new RangeError('segment start must not exceed end');
    const left = this._lowerBound(fromX);
    const right = this._upperBound(toX) - 1;
    if (left <= right) {
      this._insertSegment(1, 0, this.xs.length - 1, left, right,
        this._normalizeLine(m, b, id));
    }
  }

  query(x) {
    if (typeof x !== 'bigint') throw new TypeError('query coordinate must be BigInt');
    const index = this.indexByX.get(x);
    if (index === undefined) throw new RangeError('coordinate was not declared at construction');
    return this.queryIndex(index);
  }

  queryIndex(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.xs.length) {
      throw new RangeError('coordinate index out of range');
    }
    const x = this.xs[index];
    let node = 1;
    let left = 0;
    let right = this.xs.length - 1;
    let best = null;
    while (true) {
      const candidate = this.lines[node];
      if (candidate && (!best || LiChaoSegmentTree.compareAt(candidate, best, x) < 0)) {
        best = candidate;
      }
      if (left === right) break;
      const mid = (left + right) >> 1;
      if (index <= mid) {
        node *= 2;
        right = mid;
      } else {
        node = node * 2 + 1;
        left = mid + 1;
      }
    }
    return best ? { id: best.id, value: LiChaoSegmentTree.evaluate(best, x) } : null;
  }

  _lowerBound(value) {
    let lo = 0, hi = this.xs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.xs[mid] < value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  _upperBound(value) {
    let lo = 0, hi = this.xs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.xs[mid] <= value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  _insertSegment(node, left, right, ql, qr, line) {
    if (ql <= left && right <= qr) {
      this._insertLine(node, left, right, line);
      return;
    }
    const mid = (left + right) >> 1;
    if (ql <= mid) this._insertSegment(node * 2, left, mid, ql, qr, line);
    if (qr > mid) this._insertSegment(node * 2 + 1, mid + 1, right, ql, qr, line);
  }

  _insertLine(node, left, right, incoming) {
    if (!this.lines[node]) {
      this.lines[node] = incoming;
      return;
    }
    const mid = (left + right) >> 1;
    const current = this.lines[node];
    const betterAtLeft = LiChaoSegmentTree.compareAt(incoming, current, this.xs[left]) < 0;
    const betterAtMid = LiChaoSegmentTree.compareAt(incoming, current, this.xs[mid]) < 0;
    if (betterAtMid) {
      this.lines[node] = incoming;
      incoming = current;
    }
    if (left === right) return;
    if (betterAtLeft !== betterAtMid) {
      this._insertLine(node * 2, left, mid, incoming);
    } else {
      const betterAtRight = LiChaoSegmentTree.compareAt(
        incoming, this.lines[node], this.xs[right]
      ) < 0;
      if (betterAtRight) this._insertLine(node * 2 + 1, mid + 1, right, incoming);
    }
  }
}

function runTests() {
  const tree = new LiChaoSegmentTree([-5n, -2n, 0n, 3n, 8n, 13n]);
  tree.addLine(2n, 1n, 'rising');
  tree.addLine(-1n, 4n, 'falling');
  tree.addSegmentLine(0n, -7n, -2n, 8n, 'bounded');
  const expected = new Map([
    [-5n, -9n], [-2n, -7n], [0n, -7n], [3n, -7n], [8n, -7n], [13n, -9n]
  ]);
  for (const [x, value] of expected) assert.equal(tree.query(x).value, value);
  assert.equal(tree.query(-2n).id, 'bounded');
  assert.throws(() => tree.query(1n), RangeError);
  assert.throws(() => tree.addLine(1, 2n), TypeError);

  // Differential test against brute force, including sparse segment insertion.
  let seed = 0x12345678;
  const random = (n) => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; };
  const xs = Array.from({ length: 41 }, (_, i) => BigInt(i - 20));
  const fast = new LiChaoSegmentTree(xs);
  const brute = Array.from({ length: xs.length }, () => []);
  for (let i = 0; i < 120; i++) {
    const m = BigInt(random(41) - 20);
    const b = BigInt(random(101) - 50);
    const id = `line-${i}`;
    if (random(2) === 0) {
      fast.addLine(m, b, id);
      for (const bucket of brute) bucket.push({ m, b, id });
    } else {
      let a = random(xs.length), z = random(xs.length);
      if (a > z) [a, z] = [z, a];
      fast.addSegmentLine(m, b, xs[a], xs[z], id);
      for (let j = a; j <= z; j++) brute[j].push({ m, b, id });
    }
    for (let j = 0; j < xs.length; j++) {
      const candidates = brute[j];
      const actual = fast.queryIndex(j);
      if (candidates.length === 0) assert.equal(actual, null);
      else {
        candidates.sort((a, b) => LiChaoSegmentTree.compareAt(a, b, xs[j]));
        assert.deepEqual(actual, {
          id: candidates[0].id,
          value: candidates[0].m * xs[j] + candidates[0].b
        });
      }
    }
  }
  console.log('Li Chao segment tree: all tests passed');
}

if (require.main === module) runTests();
module.exports = { LiChaoSegmentTree };
