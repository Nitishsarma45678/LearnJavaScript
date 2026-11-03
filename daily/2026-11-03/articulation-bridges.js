'use strict';

const assert = require('node:assert/strict');

/**
 * Find articulation vertices and bridges in an undirected multigraph.
 * Edges are [u, v] pairs; parallel edges and self-loops are supported.
 * Runs in O(V + E) time.
 */
function analyzeUndirectedGraph(vertexCount, edges) {
  if (!Number.isInteger(vertexCount) || vertexCount < 0) {
    throw new RangeError('vertexCount must be a non-negative integer');
  }
  if (!Array.isArray(edges)) throw new TypeError('edges must be an array');

  const adjacency = Array.from({ length: vertexCount }, () => []);
  edges.forEach((edge, id) => {
    if (!Array.isArray(edge) || edge.length !== 2) {
      throw new TypeError('each edge must be a [u, v] pair');
    }
    const [u, v] = edge;
    for (const vertex of [u, v]) {
      if (!Number.isInteger(vertex) || vertex < 0 || vertex >= vertexCount) {
        throw new RangeError(`vertex out of range: ${vertex}`);
      }
    }
    adjacency[u].push({ to: v, id });
    adjacency[v].push({ to: u, id });
  });

  const discovery = Array(vertexCount).fill(-1);
  const low = Array(vertexCount).fill(-1);
  const articulation = new Set();
  const bridges = [];
  let clock = 0;

  function dfs(u, parentEdgeId) {
    discovery[u] = low[u] = clock++;
    let childCount = 0;

    for (const { to: v, id } of adjacency[u]) {
      // Skip only the exact tree edge, not every edge to the parent:
      // a parallel edge is a valid back edge.
      if (id === parentEdgeId) continue;

      if (discovery[v] === -1) {
        childCount++;
        dfs(v, id);
        low[u] = Math.min(low[u], low[v]);

        if (parentEdgeId !== -1 && low[v] >= discovery[u]) {
          articulation.add(u);
        }
        if (low[v] > discovery[u]) {
          bridges.push([Math.min(u, v), Math.max(u, v)]);
        }
      } else {
        low[u] = Math.min(low[u], discovery[v]);
      }
    }

    if (parentEdgeId === -1 && childCount > 1) articulation.add(u);
  }

  for (let vertex = 0; vertex < vertexCount; vertex++) {
    if (discovery[vertex] === -1) dfs(vertex, -1);
  }

  bridges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return {
    articulationPoints: [...articulation].sort((a, b) => a - b),
    bridges
  };
}

const result = analyzeUndirectedGraph(7, [
  [0, 1], [1, 2], [2, 0], [1, 3], [3, 4], [5, 6]
]);
assert.deepEqual(result.articulationPoints, [1, 3]);
assert.deepEqual(result.bridges, [[1, 3], [3, 4], [5, 6]]);

// Parallel edges mean neither copy is a bridge.
assert.deepEqual(analyzeUndirectedGraph(2, [[0, 1], [0, 1]]), {
  articulationPoints: [],
  bridges: []
});
assert.deepEqual(analyzeUndirectedGraph(3, [[0, 0]]), {
  articulationPoints: [],
  bridges: []
});
assert.deepEqual(analyzeUndirectedGraph(0, []), {
  articulationPoints: [],
  bridges: []
});
assert.throws(() => analyzeUndirectedGraph(2, [[0, 2]]), RangeError);

console.log('Articulation-point and bridge tests passed');
