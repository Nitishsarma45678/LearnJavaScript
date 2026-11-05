"use strict";

const assert = require("node:assert/strict");

class SumSegmentTree {
  constructor(values) {
    this.length = values.length;
    this.size = 1;
    while (this.size < values.length) this.size *= 2;
    this.tree = new Float64Array(this.size * 2);
    for (let i = 0; i < values.length; i++) this.tree[this.size + i] = values[i];
    for (let i = this.size - 1; i > 0; i--) {
      this.tree[i] = this.tree[i * 2] + this.tree[i * 2 + 1];
    }
  }

  set(index, value) {
    if (!Number.isInteger(index) || index < 0 || index >= this.length) {
      throw new RangeError("segment-tree index out of range");
    }
    if (!Number.isFinite(value)) throw new TypeError("value must be finite");
    let node = this.size + index;
    this.tree[node] = value;
    while ((node >>= 1) > 0) {
      this.tree[node] = this.tree[node * 2] + this.tree[node * 2 + 1];
    }
  }

  // Sum over the half-open interval [left, right).
  query(left, right) {
    if (!Number.isInteger(left) || !Number.isInteger(right) ||
        left < 0 || right < left || right > this.length) {
      throw new RangeError("invalid segment-tree interval");
    }
    let l = left + this.size;
    let r = right + this.size;
    let sum = 0;
    while (l < r) {
      if (l & 1) sum += this.tree[l++];
      if (r & 1) sum += this.tree[--r];
      l >>= 1;
      r >>= 1;
    }
    return sum;
  }
}

/**
 * Heavy-light decomposition for a static tree with mutable vertex weights.
 *
 * Construction is O(n); point updates and path-sum/LCA queries are O(log^2 n)
 * and O(log n), respectively. The decomposition is iterative so a chain with
 * hundreds of thousands of vertices does not overflow the JS call stack.
 */
class HeavyLightDecomposition {
  constructor(vertexCount, edges, values = new Array(vertexCount).fill(0), root = 0) {
    if (!Number.isInteger(vertexCount) || vertexCount < 1) {
      throw new RangeError("vertexCount must be a positive integer");
    }
    if (!Array.isArray(edges) || edges.length !== vertexCount - 1) {
      throw new RangeError("a tree must contain exactly vertexCount - 1 edges");
    }
    if (!Array.isArray(values) || values.length !== vertexCount ||
        values.some(value => !Number.isFinite(value))) {
      throw new TypeError("values must contain one finite number per vertex");
    }
    if (!Number.isInteger(root) || root < 0 || root >= vertexCount) {
      throw new RangeError("root is out of range");
    }

    this.n = vertexCount;
    this.root = root;
    this.adjacency = Array.from({ length: vertexCount }, () => []);
    for (const edge of edges) {
      if (!Array.isArray(edge) || edge.length !== 2) throw new TypeError("each edge must be [u, v]");
      const [u, v] = edge;
      if (!Number.isInteger(u) || !Number.isInteger(v) ||
          u < 0 || v < 0 || u >= vertexCount || v >= vertexCount || u === v) {
        throw new RangeError("edge endpoint is invalid");
      }
      this.adjacency[u].push(v);
      this.adjacency[v].push(u);
    }

    const parent = new Int32Array(vertexCount).fill(-2);
    const depth = new Int32Array(vertexCount);
    const order = [root];
    parent[root] = -1;
    for (let i = 0; i < order.length; i++) {
      const vertex = order[i];
      for (const next of this.adjacency[vertex]) {
        if (next === parent[vertex]) continue;
        if (parent[next] !== -2) throw new Error("edges contain a cycle");
        parent[next] = vertex;
        depth[next] = depth[vertex] + 1;
        order.push(next);
      }
    }
    if (order.length !== vertexCount) throw new Error("tree is disconnected");

    const subtreeSize = new Int32Array(vertexCount).fill(1);
    const heavy = new Int32Array(vertexCount).fill(-1);
    for (let i = order.length - 1; i > 0; i--) {
      const vertex = order[i];
      const p = parent[vertex];
      subtreeSize[p] += subtreeSize[vertex];
      if (heavy[p] === -1 || subtreeSize[vertex] > subtreeSize[heavy[p]]) {
        heavy[p] = vertex;
      }
    }

    this.parent = parent;
    this.depth = depth;
    this.head = new Int32Array(vertexCount);
    this.position = new Int32Array(vertexCount);
    let timer = 0;
    const chains = [[root, root]];
    while (chains.length) {
      const [start, chainHead] = chains.pop();
      for (let vertex = start; vertex !== -1; vertex = heavy[vertex]) {
        this.head[vertex] = chainHead;
        this.position[vertex] = timer++;
        for (const child of this.adjacency[vertex]) {
          if (parent[child] === vertex && child !== heavy[vertex]) {
            chains.push([child, child]);
          }
        }
      }
    }
    this.vertexAtPosition = new Int32Array(vertexCount);
    for (let vertex = 0; vertex < vertexCount; vertex++) {
      this.vertexAtPosition[this.position[vertex]] = vertex;
    }
    this.segmentTree = new SumSegmentTree(
      Array.from(this.vertexAtPosition, vertex => values[vertex])
    );
  }

  update(vertex, value) {
    this._checkVertex(vertex);
    this.segmentTree.set(this.position[vertex], value);
  }

  pathSum(a, b) {
    this._checkVertex(a);
    this._checkVertex(b);
    let total = 0;
    while (this.head[a] !== this.head[b]) {
      if (this.depth[this.head[a]] < this.depth[this.head[b]]) [a, b] = [b, a];
      total += this.segmentTree.query(this.position[this.head[a]], this.position[a] + 1);
      a = this.parent[this.head[a]];
    }
    if (this.depth[a] > this.depth[b]) [a, b] = [b, a];
    return total + this.segmentTree.query(this.position[a], this.position[b] + 1);
  }

  lca(a, b) {
    this._checkVertex(a);
    this._checkVertex(b);
    while (this.head[a] !== this.head[b]) {
      if (this.depth[this.head[a]] > this.depth[this.head[b]]) {
        a = this.parent[this.head[a]];
      } else {
        b = this.parent[this.head[b]];
      }
    }
    return this.depth[a] < this.depth[b] ? a : b;
  }

  _checkVertex(vertex) {
    if (!Number.isInteger(vertex) || vertex < 0 || vertex >= this.n) {
      throw new RangeError("vertex is out of range");
    }
  }
}

function naivePath(tree, values, start, end) {
  const previous = new Int32Array(tree.n).fill(-2);
  const queue = [start];
  previous[start] = -1;
  for (let i = 0; i < queue.length && previous[end] === -2; i++) {
    const vertex = queue[i];
    for (const next of tree.adjacency[vertex]) {
      if (previous[next] === -2) {
        previous[next] = vertex;
        queue.push(next);
      }
    }
  }
  let sum = 0;
  for (let vertex = end; vertex !== -1; vertex = previous[vertex]) {
    sum += values[vertex];
    if (vertex === start) break;
  }
  return sum;
}

function runTests() {
  const edges = [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [5, 6], [5, 7]];
  const values = [3, 5, -2, 7, 11, 13, 17, 19];
  const hld = new HeavyLightDecomposition(8, edges, values);
  assert.equal(hld.pathSum(3, 6), 7 + 5 + 3 - 2 + 13 + 17);
  assert.equal(hld.pathSum(4, 7), 11 + 5 + 3 - 2 + 13 + 19);
  assert.equal(hld.lca(3, 4), 1);
  assert.equal(hld.lca(3, 7), 0);
  hld.update(5, 100);
  values[5] = 100;
  assert.equal(hld.pathSum(6, 7), 17 + 100 + 19);
  assert.equal(hld.pathSum(3, 7), naivePath(hld, values, 3, 7));

  for (let seed = 1; seed <= 12; seed++) {
    let state = seed;
    const random = max => ((state = (state * 48271) % 2147483647) % max);
    const n = 35;
    const randomEdges = [];
    for (let vertex = 1; vertex < n; vertex++) randomEdges.push([vertex, random(vertex)]);
    const randomValues = Array.from({ length: n }, () => random(41) - 20);
    const instance = new HeavyLightDecomposition(n, randomEdges, randomValues);
    for (let query = 0; query < 80; query++) {
      const a = random(n);
      const b = random(n);
      assert.equal(instance.pathSum(a, b), naivePath(instance, randomValues, a, b));
      if (query % 9 === 0) {
        const vertex = random(n);
        const value = random(101) - 50;
        randomValues[vertex] = value;
        instance.update(vertex, value);
      }
    }
  }

  assert.throws(() => new HeavyLightDecomposition(3, [[0, 1], [0, 1]], [1, 2, 3]));
  assert.throws(() => hld.update(99, 1), RangeError);
  console.log("Heavy-light decomposition tests passed.");
}

if (require.main === module) runTests();

module.exports = { HeavyLightDecomposition };
