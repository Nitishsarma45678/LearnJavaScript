'use strict';

const assert = require('node:assert/strict');

/**
 * Heavy-Light Decomposition with an iterative segment tree.
 * Supports point assignment, path sum/max queries, and subtree sums.
 * Build: O(n); update: O(log n); path query: O(log^2 n).
 */
class SegmentTree {
  constructor(values) {
    this.size = 1;
    while (this.size < values.length) this.size *= 2;
    this.sum = Array(this.size * 2).fill(0);
    this.max = Array(this.size * 2).fill(-Infinity);
    for (let i = 0; i < values.length; i++) {
      this.sum[this.size + i] = values[i];
      this.max[this.size + i] = values[i];
    }
    for (let i = this.size - 1; i > 0; i--) this.pull(i);
  }

  pull(i) {
    this.sum[i] = this.sum[i * 2] + this.sum[i * 2 + 1];
    this.max[i] = Math.max(this.max[i * 2], this.max[i * 2 + 1]);
  }

  set(index, value) {
    let p = this.size + index;
    this.sum[p] = value;
    this.max[p] = value;
    while ((p >>= 1) > 0) this.pull(p);
  }

  query(left, right) {
    let l = left + this.size;
    let r = right + this.size;
    let sum = 0;
    let max = -Infinity;
    while (l < r) {
      if (l & 1) {
        sum += this.sum[l];
        max = Math.max(max, this.max[l++]);
      }
      if (r & 1) {
        --r;
        sum += this.sum[r];
        max = Math.max(max, this.max[r]);
      }
      l >>= 1;
      r >>= 1;
    }
    return { sum, max };
  }
}

class HeavyLightDecomposition {
  constructor(n, edges, values = Array(n).fill(0), root = 0) {
    if (!Number.isInteger(n) || n < 1) throw new TypeError('n must be a positive integer');
    if (!Array.isArray(edges) || edges.length !== n - 1) throw new Error('A tree must contain exactly n - 1 edges');
    if (!Array.isArray(values) || values.length !== n || values.some(x => !Number.isFinite(x))) {
      throw new TypeError('values must contain n finite numbers');
    }
    if (!Number.isInteger(root) || root < 0 || root >= n) throw new RangeError('Invalid root');

    this.n = n;
    this.root = root;
    this.adj = Array.from({ length: n }, () => []);
    for (const edge of edges) {
      if (!Array.isArray(edge) || edge.length !== 2) throw new TypeError('Each edge must be [u, v]');
      const [u, v] = edge;
      this.checkNode(u);
      this.checkNode(v);
      if (u === v) throw new Error('Self-loops are not allowed in a tree');
      this.adj[u].push(v);
      this.adj[v].push(u);
    }

    this.parent = Array(n).fill(-2);
    this.depth = Array(n).fill(0);
    const order = [];
    const stack = [root];
    this.parent[root] = -1;
    while (stack.length) {
      const u = stack.pop();
      order.push(u);
      for (const v of this.adj[u]) {
        if (v === this.parent[u]) continue;
        if (this.parent[v] !== -2) throw new Error('Edges contain a cycle');
        this.parent[v] = u;
        this.depth[v] = this.depth[u] + 1;
        stack.push(v);
      }
    }
    if (order.length !== n) throw new Error('Tree is disconnected');

    this.subtreeSize = Array(n).fill(1);
    this.heavy = Array(n).fill(-1);
    for (let i = order.length - 1; i >= 0; i--) {
      const u = order[i];
      let largest = 0;
      for (const v of this.adj[u]) {
        if (this.parent[v] !== u) continue;
        this.subtreeSize[u] += this.subtreeSize[v];
        if (this.subtreeSize[v] > largest) {
          largest = this.subtreeSize[v];
          this.heavy[u] = v;
        }
      }
    }

    this.head = Array(n);
    this.position = Array(n);
    this.nodeAt = Array(n);
    const chains = [[root, root]];
    let timer = 0;
    while (chains.length) {
      const [start, chainHead] = chains.pop();
      for (let u = start; u !== -1; u = this.heavy[u]) {
        this.head[u] = chainHead;
        this.position[u] = timer;
        this.nodeAt[timer++] = u;
        for (const v of this.adj[u]) {
          if (this.parent[v] === u && v !== this.heavy[u]) chains.push([v, v]);
        }
      }
    }

    const linear = Array(n);
    for (let u = 0; u < n; u++) linear[this.position[u]] = values[u];
    this.segmentTree = new SegmentTree(linear);
  }

  checkNode(u) {
    if (!Number.isInteger(u) || u < 0 || u >= this.n) throw new RangeError('Invalid node: ' + u);
  }

  update(node, value) {
    this.checkNode(node);
    if (!Number.isFinite(value)) throw new TypeError('value must be finite');
    this.segmentTree.set(this.position[node], value);
  }

  pathQuery(a, b) {
    this.checkNode(a);
    this.checkNode(b);
    let sum = 0;
    let max = -Infinity;
    while (this.head[a] !== this.head[b]) {
      if (this.depth[this.head[a]] < this.depth[this.head[b]]) [a, b] = [b, a];
      const part = this.segmentTree.query(this.position[this.head[a]], this.position[a] + 1);
      sum += part.sum;
      max = Math.max(max, part.max);
      a = this.parent[this.head[a]];
    }
    if (this.depth[a] > this.depth[b]) [a, b] = [b, a];
    const finalPart = this.segmentTree.query(this.position[a], this.position[b] + 1);
    return { sum: sum + finalPart.sum, max: Math.max(max, finalPart.max) };
  }

  pathSum(a, b) { return this.pathQuery(a, b).sum; }
  pathMax(a, b) { return this.pathQuery(a, b).max; }

  subtreeSum(node) {
    this.checkNode(node);
    const left = this.position[node];
    return this.segmentTree.query(left, left + this.subtreeSize[node]).sum;
  }
}

function naivePath(adj, values, start, target) {
  const parent = Array(adj.length).fill(-1);
  const queue = [start];
  parent[start] = start;
  for (let i = 0; i < queue.length && parent[target] === -1; i++) {
    const u = queue[i];
    for (const v of adj[u]) if (parent[v] === -1) {
      parent[v] = u;
      queue.push(v);
    }
  }
  const path = [];
  for (let u = target; u !== start; u = parent[u]) path.push(u);
  path.push(start);
  return path.map(u => values[u]);
}

function runTests() {
  const tree = new HeavyLightDecomposition(7, [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [5, 6]], [3, -2, 7, 4, 1, -5, 8]);
  assert.deepEqual(tree.pathQuery(3, 6), { sum: 15, max: 8 });
  assert.equal(tree.subtreeSum(1), 3);
  tree.update(5, 10);
  assert.equal(tree.pathSum(3, 6), 30);
  assert.equal(tree.pathMax(3, 6), 10);
  assert.throws(() => new HeavyLightDecomposition(3, [[0, 1], [0, 1]], [0, 0, 0]), /cycle|disconnected/);

  // Randomized differential test against explicit path reconstruction.
  let seed = 0x51a7;
  const random = max => ((seed = (seed * 1664525 + 1013904223) >>> 0) % max);
  for (let trial = 0; trial < 80; trial++) {
    const n = 2 + random(45);
    const edges = [];
    const adj = Array.from({ length: n }, () => []);
    for (let v = 1; v < n; v++) {
      const p = random(v);
      edges.push([p, v]);
      adj[p].push(v);
      adj[v].push(p);
    }
    const values = Array.from({ length: n }, () => random(41) - 20);
    const hld = new HeavyLightDecomposition(n, edges, values);
    for (let q = 0; q < 120; q++) {
      if (random(4) === 0) {
        const node = random(n);
        values[node] = random(101) - 50;
        hld.update(node, values[node]);
      } else {
        const u = random(n), v = random(n);
        const path = naivePath(adj, values, u, v);
        assert.equal(hld.pathSum(u, v), path.reduce((a, b) => a + b, 0));
        assert.equal(hld.pathMax(u, v), Math.max(...path));
      }
    }
  }
  console.log('Heavy-Light Decomposition: all tests passed');
}

if (require.main === module) runTests();
module.exports = { HeavyLightDecomposition };
