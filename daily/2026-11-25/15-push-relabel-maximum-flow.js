'use strict';

// Exercise: implement FIFO push-relabel maximum flow with residual reverse
// edges, parallel-edge support, and explicit source/sink validation.

function pushRelabelMaxFlow(vertexCount, edges, source, sink) {
  if (!Number.isInteger(vertexCount) || vertexCount < 2 ||
      ![source, sink].every(v => Number.isInteger(v) && v >= 0 && v < vertexCount) ||
      source === sink) throw new RangeError('invalid graph or terminals');

  const graph = Array.from({ length: vertexCount }, () => []);
  const addEdge = (from, to, capacity) => {
    if (!Number.isFinite(capacity) || capacity < 0) throw new RangeError('capacity must be non-negative');
    const forward = { to, rev: graph[to].length, capacity, original: capacity };
    const reverse = { to: from, rev: graph[from].length, capacity: 0, original: 0 };
    graph[from].push(forward);
    graph[to].push(reverse);
  };
  for (const [from, to, capacity] of edges) {
    if (![from, to].every(v => Number.isInteger(v) && v >= 0 && v < vertexCount)) {
      throw new RangeError('edge endpoint outside graph');
    }
    addEdge(from, to, capacity);
  }

  const height = Array(vertexCount).fill(0);
  const excess = Array(vertexCount).fill(0);
  const current = Array(vertexCount).fill(0);
  const queue = [];
  const queued = Array(vertexCount).fill(false);
  height[source] = vertexCount;

  function enqueue(vertex) {
    if (vertex !== source && vertex !== sink && excess[vertex] > 0 && !queued[vertex]) {
      queued[vertex] = true;
      queue.push(vertex);
    }
  }

  for (const edge of graph[source]) {
    if (edge.capacity <= 0) continue;
    const amount = edge.capacity;
    edge.capacity -= amount;
    graph[edge.to][edge.rev].capacity += amount;
    excess[source] -= amount;
    excess[edge.to] += amount;
    enqueue(edge.to);
  }

  let head = 0;
  while (head < queue.length) {
    const vertex = queue[head++];
    queued[vertex] = false;

    while (excess[vertex] > 0) {
      if (current[vertex] >= graph[vertex].length) {
        let minimum = Infinity;
        for (const edge of graph[vertex]) if (edge.capacity > 0) minimum = Math.min(minimum, height[edge.to]);
        if (minimum === Infinity) break;
        height[vertex] = minimum + 1;
        current[vertex] = 0;
        continue;
      }

      const edge = graph[vertex][current[vertex]];
      if (edge.capacity > 0 && height[vertex] === height[edge.to] + 1) {
        const amount = Math.min(excess[vertex], edge.capacity);
        edge.capacity -= amount;
        graph[edge.to][edge.rev].capacity += amount;
        excess[vertex] -= amount;
        excess[edge.to] += amount;
        enqueue(edge.to);
      } else {
        current[vertex]++;
      }
    }
    enqueue(vertex);
  }

  const flows = [];
  for (let from = 0; from < vertexCount; from++) {
    for (const edge of graph[from]) {
      if (edge.original > 0) flows.push({ from, to: edge.to, flow: edge.original - edge.capacity, capacity: edge.original });
    }
  }
  return { value: excess[sink], flows };
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  const result = pushRelabelMaxFlow(6, [
    [0, 1, 16], [0, 2, 13], [1, 2, 10], [2, 1, 4],
    [1, 3, 12], [3, 2, 9], [2, 4, 14], [4, 3, 7],
    [3, 5, 20], [4, 5, 4]
  ], 0, 5);
  assert.equal(result.value, 23);
  assert.equal(result.flows.length, 10);
  assert.equal(pushRelabelMaxFlow(2, [[0, 1, 3], [0, 1, 4]], 0, 1).value, 7);
  assert.throws(() => pushRelabelMaxFlow(2, [[0, 1, -1]], 0, 1), RangeError);
  console.log('push-relabel maximum flow: all tests passed');
}

module.exports = { pushRelabelMaxFlow };
