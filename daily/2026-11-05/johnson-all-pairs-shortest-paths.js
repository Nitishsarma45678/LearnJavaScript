"use strict";

/*
 * Johnson's algorithm: all-pairs shortest paths in a sparse directed graph.
 *
 * Supports negative edge weights when the graph has no negative cycle.
 * Vertices are integers in [0, vertexCount). Unreachable distances are Infinity.
 * Complexity: O(VE + V(E + V) log V) with a binary min-heap.
 */

class MinHeap {
  constructor(compare = (a, b) => a - b) {
    this.items = [];
    this.compare = compare;
  }

  get size() {
    return this.items.length;
  }

  push(value) {
    const items = this.items;
    items.push(value);
    let index = items.length - 1;

    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.compare(items[parent], value) <= 0) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = value;
  }

  pop() {
    if (this.items.length === 0) return undefined;

    const items = this.items;
    const minimum = items[0];
    const last = items.pop();

    if (items.length > 0) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= items.length) break;

        let child = left;
        if (right < items.length && this.compare(items[right], items[left]) < 0) {
          child = right;
        }
        if (this.compare(items[child], last) >= 0) break;

        items[index] = items[child];
        index = child;
      }
      items[index] = last;
    }

    return minimum;
  }
}

function johnson(vertexCount, edges) {
  if (!Number.isInteger(vertexCount) || vertexCount < 0) {
    throw new RangeError("vertexCount must be a non-negative integer");
  }
  if (!Array.isArray(edges)) throw new TypeError("edges must be an array");

  const adjacency = Array.from({ length: vertexCount }, () => []);
  const normalizedEdges = edges.map((edge, index) => {
    if (!edge || !Number.isInteger(edge.from) || !Number.isInteger(edge.to)) {
      throw new TypeError("Each edge needs integer from and to vertices");
    }
    if (
      edge.from < 0 || edge.from >= vertexCount ||
      edge.to < 0 || edge.to >= vertexCount
    ) {
      throw new RangeError("Edge endpoint is outside the graph");
    }
    if (typeof edge.weight !== "number" || !Number.isFinite(edge.weight)) {
      throw new TypeError("Edge weight must be finite");
    }

    const normalized = { from: edge.from, to: edge.to, weight: edge.weight, index };
    adjacency[edge.from].push(normalized);
    return normalized;
  });

  // Equivalent to adding a zero-weight super-source connected to every vertex.
  const potential = Array(vertexCount).fill(0);

  for (let pass = 0; pass < vertexCount; pass += 1) {
    let changed = false;

    for (const edge of normalizedEdges) {
      const candidate = potential[edge.from] + edge.weight;
      if (candidate < potential[edge.to]) {
        potential[edge.to] = candidate;
        changed = true;

        if (pass === vertexCount - 1) {
          throw new Error("Graph contains a negative-weight cycle");
        }
      }
    }

    if (!changed) break;
  }

  const reweighted = adjacency.map((outgoing) =>
    outgoing.map((edge) => {
      const weight = edge.weight + potential[edge.from] - potential[edge.to];
      // Floating-point arithmetic can produce a tiny negative round-off value.
      if (weight < -1e-10) {
        throw new Error("Reweighting produced an invalid negative edge");
      }
      return { to: edge.to, weight: Math.max(0, weight) };
    })
  );

  const distances = Array.from(
    { length: vertexCount },
    () => Array(vertexCount).fill(Infinity)
  );
  const parentsBySource = Array(vertexCount);

  for (let source = 0; source < vertexCount; source += 1) {
    const distance = Array(vertexCount).fill(Infinity);
    const parent = Array(vertexCount).fill(-1);
    const heap = new MinHeap((a, b) => a.distance - b.distance);

    distance[source] = 0;
    heap.push({ vertex: source, distance: 0 });

    while (heap.size > 0) {
      const current = heap.pop();
      if (current.distance !== distance[current.vertex]) continue;

      for (const edge of reweighted[current.vertex]) {
        const candidate = current.distance + edge.weight;
        if (candidate < distance[edge.to]) {
          distance[edge.to] = candidate;
          parent[edge.to] = current.vertex;
          heap.push({ vertex: edge.to, distance: candidate });
        }
      }
    }

    for (let target = 0; target < vertexCount; target += 1) {
      if (distance[target] !== Infinity) {
        distances[source][target] =
          distance[target] - potential[source] + potential[target];
      }
    }
    parentsBySource[source] = parent;
  }

  function path(from, to) {
    if (
      !Number.isInteger(from) || !Number.isInteger(to) ||
      from < 0 || from >= vertexCount || to < 0 || to >= vertexCount
    ) {
      throw new RangeError("Path endpoints are outside the graph");
    }
    if (distances[from][to] === Infinity) return null;
    if (from === to) return [from];

    const reversed = [];
    let cursor = to;
    const parent = parentsBySource[from];

    while (cursor !== -1 && cursor !== from) {
      reversed.push(cursor);
      cursor = parent[cursor];
    }
    if (cursor === -1) return null;

    reversed.push(from);
    return reversed.reverse();
  }

  return { distances, path };
}

module.exports = { johnson, MinHeap };

if (require.main === module) {
  const assert = require("node:assert/strict");

  const graph = johnson(5, [
    { from: 0, to: 1, weight: 3 },
    { from: 0, to: 2, weight: 8 },
    { from: 1, to: 2, weight: -4 },
    { from: 1, to: 3, weight: 7 },
    { from: 2, to: 3, weight: 2 },
    { from: 3, to: 1, weight: 5 }
  ]);

  assert.equal(graph.distances[0][3], 1);
  assert.deepEqual(graph.path(0, 3), [0, 1, 2, 3]);
  assert.equal(graph.distances[4][0], Infinity);
  assert.equal(graph.path(4, 0), null);
  assert.deepEqual(graph.path(2, 2), [2]);

  const negativeEdge = johnson(3, [
    { from: 0, to: 1, weight: -2 },
    { from: 1, to: 2, weight: 5 },
    { from: 0, to: 2, weight: 10 }
  ]);
  assert.equal(negativeEdge.distances[0][2], 3);

  assert.throws(
    () => johnson(2, [
      { from: 0, to: 1, weight: -2 },
      { from: 1, to: 0, weight: -1 }
    ]),
    /negative-weight cycle/
  );
  assert.throws(() => johnson(2, [{ from: 0, to: 2, weight: 1 }]), RangeError);

  console.log("Johnson all-pairs shortest paths: all tests passed");
}
