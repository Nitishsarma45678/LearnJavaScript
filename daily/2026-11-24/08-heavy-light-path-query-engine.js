'use strict';

const assert = require('node:assert/strict');

class SumSegmentTree {
  constructor(values) {
    this.size = 1;
    while (this.size < values.length) this.size <<= 1;
    this.tree = Array(this.size * 2).fill(0);
    values.forEach((value, index) => { this.tree[this.size + index] = value; });
    for (let i = this.size - 1; i > 0; i--) this.tree[i] = this.tree[i * 2] + this.tree[i * 2 + 1];
  }

  set(index, value) {
    let p = this.size + index;
    this.tree[p] = value;
    while (p > 1) {
      p >>= 1;
      this.tree[p] = this.tree[p * 2] + this.tree[p * 2 + 1];
    }
  }

  query(left, right) {
    let l = left + this.size, r = right + this.size, sum = 0;
    while (l < r) {
      if (l & 1) sum += this.tree[l++];
      if (r & 1) sum += this.tree[--r];
      l >>= 1;
      r >>= 1;
    }
    return sum;
  }
}

class HeavyLightTree {
  constructor(values, edges, root = 0) {
    this.n = values.length;
    this.graph = Array.from({ length: this.n }, () => []);
    for (const [a, b] of edges) { this.graph[a].push(b); this.graph[b].push(a); }
    this.parent = Array(this.n).fill(-1);
    this.depth = Array(this.n).fill(0);
    this.size = Array(this.n).fill(0);
    this.heavy = Array(this.n).fill(-1);
    this.head = Array(this.n).fill(0);
    this.position = Array(this.n).fill(0);
    this.timer = 0;
    this._sizes(root, -1);
    this._decompose(root, root);
    const ordered = Array(this.n);
    for (let v = 0; v < this.n; v++) ordered[this.position[v]] = values[v];
    this.segment = new SumSegmentTree(ordered);
  }

  _sizes(v, p) {
    this.parent[v] = p;
    this.size[v] = 1;
    let largest = 0;
    for (const next of this.graph[v]) {
      if (next === p) continue;
      this.depth[next] = this.depth[v] + 1;
      this._sizes(next, v);
      this.size[v] += this.size[next];
      if (this.size[next] > largest) { largest = this.size[next]; this.heavy[v] = next; }
    }
  }

  _decompose(v, chainHead) {
    this.head[v] = chainHead;
    this.position[v] = this.timer++;
    if (this.heavy[v] !== -1) this._decompose(this.heavy[v], chainHead);
    for (const next of this.graph[v]) {
      if (next !== this.parent[v] && next !== this.heavy[v]) this._decompose(next, next);
    }
  }

  update(vertex, value) {
    this._check(vertex);
    this.segment.set(this.position[vertex], value);
  }

  _check(vertex) {
    if (!Number.isInteger(vertex) || vertex < 0 || vertex >= this.n) throw new RangeError('Invalid vertex');
  }

  pathSum(a, b) {
    this._check(a); this._check(b);
    let result = 0;
    while (this.head[a] !== this.head[b]) {
      if (this.depth[this.head[a]] < this.depth[this.head[b]]) [a, b] = [b, a];
      result += this.segment.query(this.position[this.head[a]], this.position[a] + 1);
      a = this.parent[this.head[a]];
    }
    const left = Math.min(this.position[a], this.position[b]);
    const right = Math.max(this.position[a], this.position[b]);
    return result + this.segment.query(left, right + 1);
  }
}

const hld = new HeavyLightTree([1,2,3,4,5,6], [[0,1],[0,2],[1,3],[1,4],[2,5]]);
assert.equal(hld.pathSum(3, 5), 15); // 4 + 2 + 1 + 3 + 6
hld.update(1, 20);
assert.equal(hld.pathSum(3, 5), 33);
assert.equal(hld.pathSum(4, 4), 5);
assert.throws(() => hld.pathSum(0, 9), RangeError);
console.log('Heavy-light examples passed.');

module.exports = { HeavyLightTree };
