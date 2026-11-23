// Exercise: Build an all-pairs shortest-path index using Floyd-Warshall.
// Support negative edges, path reconstruction, unreachable pairs, and explicit
// reporting of pairs whose shortest path is undefined due to a negative cycle.
//
// Run: node 05-floyd-warshall-path-index.js
const assert = require("node:assert/strict");

class FloydWarshallIndex {
  constructor(vertexCount, edges = []) {
    if (!Number.isInteger(vertexCount) || vertexCount < 0) {
      throw new RangeError("vertexCount must be a non-negative integer");
    }
    this.n = vertexCount;
    this.dist = Array.from({ length: this.n }, (_, i) =>
      Array.from({ length: this.n }, (_, j) => i === j ? 0 : Infinity)
    );
    this.next = Array.from({ length: this.n }, (_, i) =>
      Array.from({ length: this.n }, (_, j) => i === j ? i : null)
    );
    this.negativeAffected = Array.from({ length: this.n }, () => Array(this.n).fill(false));
    this.hasRun = false;

    for (const edge of edges) this.addEdge(...edge);
  }

  assertVertex(vertex) {
    if (!Number.isInteger(vertex) || vertex < 0 || vertex >= this.n) {
      throw new RangeError("vertex out of range: " + vertex);
    }
  }

  addEdge(from, to, weight) {
    this.assertVertex(from);
    this.assertVertex(to);
    if (!Number.isFinite(weight)) throw new TypeError("edge weight must be finite");
    if (weight < this.dist[from][to]) {
      this.dist[from][to] = weight;
      this.next[from][to] = to;
      this.hasRun = false;
    }
  }

  compute() {
    for (let k = 0; k < this.n; k += 1) {
      for (let i = 0; i < this.n; i += 1) {
        if (this.dist[i][k] === Infinity) continue;
        for (let j = 0; j < this.n; j += 1) {
          if (this.dist[k][j] === Infinity) continue;
          const candidate = this.dist[i][k] + this.dist[k][j];
          if (candidate < this.dist[i][j]) {
            this.dist[i][j] = candidate;
            this.next[i][j] = this.next[i][k];
          }
        }
      }
    }

    const negativeVertices = [];
    for (let k = 0; k < this.n; k += 1) {
      if (this.dist[k][k] < 0) negativeVertices.push(k);
    }
    for (const k of negativeVertices) {
      for (let i = 0; i < this.n; i += 1) {
        if (this.dist[i][k] === Infinity) continue;
        for (let j = 0; j < this.n; j += 1) {
          if (this.dist[k][j] !== Infinity) this.negativeAffected[i][j] = true;
        }
      }
    }
    this.hasRun = true;
    return { negativeVertices };
  }

  distance(from, to) {
    this.assertReady(from, to);
    if (this.negativeAffected[from][to]) return -Infinity;
    return this.dist[from][to];
  }

  path(from, to) {
    this.assertReady(from, to);
    if (this.negativeAffected[from][to]) {
      throw new RangeError("no finite shortest path: a reachable negative cycle exists");
    }
    if (this.next[from][to] === null) return null;
    const route = [from];
    let current = from;
    while (current !== to) {
      current = this.next[current][to];
      if (current === null || route.length > this.n + 1) {
        throw new Error("path reconstruction invariant failed");
      }
      route.push(current);
    }
    return route;
  }

  assertReady(from, to) {
    this.assertVertex(from);
    this.assertVertex(to);
    if (!this.hasRun) throw new Error("call compute() before querying");
  }
}

// Example tests
{
  const graph = new FloydWarshallIndex(5, [
    [0, 1, 3], [0, 2, 10], [1, 2, -2], [2, 3, 4], [3, 1, 1]
  ]);
  const report = graph.compute();
  assert.deepEqual(report.negativeVertices, []);
  assert.equal(graph.distance(0, 3), 5);
  assert.deepEqual(graph.path(0, 3), [0, 1, 2, 3]);
  assert.equal(graph.distance(4, 0), Infinity);
  assert.equal(graph.path(4, 0), null);

  const negative = new FloydWarshallIndex(4, [
    [0, 1, 1], [1, 2, -3], [2, 1, 1], [2, 3, 2]
  ]);
  assert.deepEqual(negative.compute().negativeVertices, [1, 2]);
  assert.equal(negative.distance(0, 3), -Infinity);
  assert.throws(() => negative.path(0, 3), /negative cycle/);
  assert.equal(negative.distance(3, 0), Infinity);
}
console.log("Floyd-Warshall index tests passed");
