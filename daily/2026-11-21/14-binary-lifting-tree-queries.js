// Exercise: Preprocess a rooted tree for O(log n) ancestor and lowest-common-ancestor queries.
// The constructor validates that the undirected input is a connected acyclic tree.

class TreeQueries {
  constructor(nodeCount, edges, root = 0) {
    if (!Number.isInteger(nodeCount) || nodeCount < 1) {
      throw new RangeError("nodeCount must be positive");
    }
    if (!Number.isInteger(root) || root < 0 || root >= nodeCount) {
      throw new RangeError("root is out of range");
    }
    if (!Array.isArray(edges) || edges.length !== nodeCount - 1) {
      throw new TypeError("a tree must contain exactly n - 1 edges");
    }

    this.n = nodeCount;
    this.root = root;
    const graph = Array.from({ length: nodeCount }, () => []);
    for (const edge of edges) {
      if (!Array.isArray(edge) || edge.length !== 2) throw new TypeError("edge must be [u, v]");
      const [u, v] = edge;
      if (![u, v].every(Number.isInteger) || u < 0 || v < 0 || u >= nodeCount || v >= nodeCount || u === v) {
        throw new RangeError("invalid tree edge");
      }
      graph[u].push(v);
      graph[v].push(u);
    }

    this.depth = Array(nodeCount).fill(-1);
    const parent = Array(nodeCount).fill(-1);
    const queue = [root];
    this.depth[root] = 0;
    parent[root] = root;

    for (let head = 0; head < queue.length; head++) {
      const node = queue[head];
      for (const neighbor of graph[node]) {
        if (neighbor === parent[node]) continue;
        if (this.depth[neighbor] !== -1) throw new TypeError("edges contain a cycle");
        parent[neighbor] = node;
        this.depth[neighbor] = this.depth[node] + 1;
        queue.push(neighbor);
      }
    }
    if (queue.length !== nodeCount) throw new TypeError("tree is disconnected");

    const levels = Math.ceil(Math.log2(nodeCount)) + 1;
    this.up = Array.from({ length: levels }, () => Array(nodeCount).fill(root));
    this.up[0] = parent;
    for (let level = 1; level < levels; level++) {
      for (let node = 0; node < nodeCount; node++) {
        this.up[level][node] = this.up[level - 1][this.up[level - 1][node]];
      }
    }
  }

  _check(node) {
    if (!Number.isInteger(node) || node < 0 || node >= this.n) {
      throw new RangeError("node is out of range");
    }
  }

  kthAncestor(node, k) {
    this._check(node);
    if (!Number.isSafeInteger(k) || k < 0) throw new RangeError("k must be non-negative");
    if (k > this.depth[node]) return -1;
    let bit = 0;
    while (k > 0) {
      if (k % 2 === 1) node = this.up[bit][node];
      k = Math.floor(k / 2);
      bit++;
    }
    return node;
  }

  lca(a, b) {
    this._check(a);
    this._check(b);
    if (this.depth[a] < this.depth[b]) [a, b] = [b, a];
    a = this.kthAncestor(a, this.depth[a] - this.depth[b]);
    if (a === b) return a;

    for (let level = this.up.length - 1; level >= 0; level--) {
      if (this.up[level][a] !== this.up[level][b]) {
        a = this.up[level][a];
        b = this.up[level][b];
      }
    }
    return this.up[0][a];
  }

  distance(a, b) {
    const ancestor = this.lca(a, b);
    return this.depth[a] + this.depth[b] - 2 * this.depth[ancestor];
  }
}

// Tests
const assert = require("node:assert/strict");
const tree = new TreeQueries(7, [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [5, 6]]);
assert.equal(tree.lca(3, 4), 1);
assert.equal(tree.lca(3, 6), 0);
assert.equal(tree.kthAncestor(6, 2), 2);
assert.equal(tree.kthAncestor(6, 4), -1);
assert.equal(tree.distance(3, 6), 5);
assert.throws(() => new TreeQueries(3, [[0, 1], [1, 0]]), TypeError);
assert.throws(() => tree.lca(0, 9), RangeError);
console.log("binary lifting tests passed");
