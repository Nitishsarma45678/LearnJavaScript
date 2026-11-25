'use strict';

// Exercise: find articulation vertices and bridge edges in an undirected
// multigraph. Parent edges must be tracked by edge ID so parallel edges work.

function analyzeUndirectedGraph(vertexCount, edges) {
  if (!Number.isInteger(vertexCount) || vertexCount < 0) throw new RangeError('invalid vertex count');
  const adjacency = Array.from({ length: vertexCount }, () => []);
  edges.forEach(([u, v], id) => {
    if (![u, v].every(x => Number.isInteger(x) && x >= 0 && x < vertexCount)) {
      throw new RangeError('edge endpoint outside graph');
    }
    adjacency[u].push({ to: v, id });
    adjacency[v].push({ to: u, id });
  });

  const discovery = Array(vertexCount).fill(-1);
  const low = Array(vertexCount).fill(-1);
  const articulation = new Set();
  const bridges = [];
  let time = 0;
  let components = 0;

  function dfs(vertex, parentEdge) {
    discovery[vertex] = low[vertex] = time++;
    let children = 0;

    for (const edge of adjacency[vertex]) {
      if (edge.id === parentEdge) continue;
      const next = edge.to;
      if (discovery[next] === -1) {
        children++;
        dfs(next, edge.id);
        low[vertex] = Math.min(low[vertex], low[next]);

        if (parentEdge !== -1 && low[next] >= discovery[vertex]) articulation.add(vertex);
        if (low[next] > discovery[vertex]) {
          bridges.push({ edgeId: edge.id, from: Math.min(vertex, next), to: Math.max(vertex, next) });
        }
      } else {
        low[vertex] = Math.min(low[vertex], discovery[next]);
      }
    }
    if (parentEdge === -1 && children > 1) articulation.add(vertex);
  }

  for (let vertex = 0; vertex < vertexCount; vertex++) {
    if (discovery[vertex] === -1) { components++; dfs(vertex, -1); }
  }

  bridges.sort((a, b) => a.from - b.from || a.to - b.to || a.edgeId - b.edgeId);
  return { articulationPoints: [...articulation].sort((a, b) => a - b), bridges, components };
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  const graph = analyzeUndirectedGraph(6, [
    [0, 1], [1, 2], [2, 0], [1, 3], [3, 4], [4, 5], [5, 3], [3, 4]
  ]);
  assert.deepEqual(graph.articulationPoints, [1, 3]);
  assert.deepEqual(graph.bridges, [{ edgeId: 3, from: 1, to: 3 }]);
  assert.equal(graph.components, 1);

  const disconnected = analyzeUndirectedGraph(4, [[0, 1], [2, 3], [2, 3]]);
  assert.equal(disconnected.components, 2);
  assert.deepEqual(disconnected.bridges, [{ edgeId: 0, from: 0, to: 1 }]);
  assert.deepEqual(disconnected.articulationPoints, []);
  assert.throws(() => analyzeUndirectedGraph(2, [[0, 2]]), RangeError);
  console.log('Tarjan multigraph analysis: all tests passed');
}

module.exports = { analyzeUndirectedGraph };
