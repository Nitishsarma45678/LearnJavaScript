'use strict';

// Exercise: find an Eulerian trail in a directed multigraph. Preserve edge
// identity, support parallel edges and self-loops, and reject disconnected
// edge components even when degree conditions happen to hold.

function directedEulerianTrail(vertexCount, edges) {
  if (!Number.isInteger(vertexCount) || vertexCount < 0) throw new RangeError('invalid vertex count');
  const adjacency = Array.from({ length: vertexCount }, () => []);
  const indegree = Array(vertexCount).fill(0);
  const outdegree = Array(vertexCount).fill(0);

  edges.forEach(([from, to], id) => {
    if (![from, to].every(v => Number.isInteger(v) && v >= 0 && v < vertexCount)) {
      throw new RangeError('edge endpoint outside graph');
    }
    adjacency[from].push({ to, id });
    outdegree[from]++;
    indegree[to]++;
  });
  if (edges.length === 0) return { vertices: [], edgeIds: [] };

  let start = -1, end = -1;
  for (let v = 0; v < vertexCount; v++) {
    const difference = outdegree[v] - indegree[v];
    if (difference === 1) {
      if (start !== -1) return null;
      start = v;
    } else if (difference === -1) {
      if (end !== -1) return null;
      end = v;
    } else if (difference !== 0) return null;
  }
  if ((start === -1) !== (end === -1)) return null;
  if (start === -1) start = outdegree.findIndex(count => count > 0);

  // Reverse adjacency order so popping follows input order.
  for (const list of adjacency) list.reverse();
  const vertexStack = [start];
  const edgeStack = [];
  const reversedVertices = [];
  const reversedEdges = [];

  while (vertexStack.length) {
    const current = vertexStack[vertexStack.length - 1];
    const edge = adjacency[current].pop();
    if (edge) {
      vertexStack.push(edge.to);
      edgeStack.push(edge.id);
    } else {
      reversedVertices.push(vertexStack.pop());
      if (edgeStack.length) reversedEdges.push(edgeStack.pop());
    }
  }

  if (reversedEdges.length !== edges.length) return null;
  return { vertices: reversedVertices.reverse(), edgeIds: reversedEdges.reverse() };
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  const trail = directedEulerianTrail(3, [[0, 1], [1, 0], [0, 2], [2, 0], [0, 1]]);
  assert.equal(trail.edgeIds.length, 5);
  assert.deepEqual([...trail.edgeIds].sort((a, b) => a - b), [0, 1, 2, 3, 4]);
  for (let i = 0; i < trail.edgeIds.length; i++) {
    const [from, to] = [[0, 1], [1, 0], [0, 2], [2, 0], [0, 1]][trail.edgeIds[i]];
    assert.equal(trail.vertices[i], from);
    assert.equal(trail.vertices[i + 1], to);
  }
  assert.equal(directedEulerianTrail(4, [[0, 1], [1, 0], [2, 3], [3, 2]]), null);
  assert.deepEqual(directedEulerianTrail(2, [[0, 0], [0, 1]]), {
    vertices: [0, 0, 1], edgeIds: [0, 1]
  });
  assert.deepEqual(directedEulerianTrail(3, []), { vertices: [], edgeIds: [] });
  console.log('directed Eulerian trail: all tests passed');
}

module.exports = { directedEulerianTrail };
