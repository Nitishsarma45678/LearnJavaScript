'use strict';

/**
 * Dinic's maximum-flow algorithm with a minimum-cut certificate.
 * Capacities are BigInts so the result remains exact for very large networks.
 * Edges are [from, to, capacity]; parallel edges are supported, self-loops
 * are rejected because they cannot affect an s-t flow or a minimum cut.
 */
function maxFlowWithMinCut(vertexCount, edges, source, sink) {
  if (!Number.isSafeInteger(vertexCount) || vertexCount <= 0) {
    throw new RangeError('vertexCount must be a positive safe integer');
  }
  if (!Array.isArray(edges)) throw new TypeError('edges must be an array');
  for (const [name, vertex] of [['source', source], ['sink', sink]]) {
    if (!Number.isSafeInteger(vertex) || vertex < 0 || vertex >= vertexCount) {
      throw new RangeError(`${name} is outside the graph`);
    }
  }
  if (source === sink) throw new RangeError('source and sink must differ');

  const graph = Array.from({ length: vertexCount }, () => []);
  const originalEdges = [];
  for (let index = 0; index < edges.length; index += 1) {
    const edge = edges[index];
    if (!Array.isArray(edge) || edge.length !== 3) {
      throw new TypeError(`edge ${index} must be [from, to, capacity]`);
    }
    const [from, to, rawCapacity] = edge;
    if (![from, to].every(v => Number.isSafeInteger(v) && v >= 0 && v < vertexCount)) {
      throw new RangeError(`edge ${index} has an invalid endpoint`);
    }
    if (from === to) throw new RangeError(`edge ${index} is a self-loop`);
    const capacity = typeof rawCapacity === 'bigint'
      ? rawCapacity
      : Number.isSafeInteger(rawCapacity) ? BigInt(rawCapacity) : null;
    if (capacity === null || capacity < 0n) {
      throw new RangeError(`edge ${index} capacity must be a non-negative BigInt or safe integer`);
    }

    const forward = { to, rev: graph[to].length, capacity, residual: capacity, edgeIndex: index };
    const reverse = { to: from, rev: graph[from].length, capacity: 0n, residual: 0n, edgeIndex: null };
    graph[from].push(forward);
    graph[to].push(reverse);
    originalEdges.push({ from, to, capacity, index });
  }

  let flow = 0n;
  const level = Array(vertexCount).fill(-1);
  const cursor = Array(vertexCount).fill(0);

  function buildLevels() {
    level.fill(-1);
    level[source] = 0;
    const queue = [source];
    for (let head = 0; head < queue.length; head += 1) {
      const vertex = queue[head];
      for (const edge of graph[vertex]) {
        if (edge.residual > 0n && level[edge.to] === -1) {
          level[edge.to] = level[vertex] + 1;
          queue.push(edge.to);
        }
      }
    }
    return level[sink] !== -1;
  }

  function send(vertex, available) {
    if (vertex === sink) return available;
    for (; cursor[vertex] < graph[vertex].length; cursor[vertex] += 1) {
      const edge = graph[vertex][cursor[vertex]];
      if (edge.residual === 0n || level[edge.to] !== level[vertex] + 1) continue;
      const pushed = send(edge.to, available < edge.residual ? available : edge.residual);
      if (pushed > 0n) {
        edge.residual -= pushed;
        graph[edge.to][edge.rev].residual += pushed;
        return pushed;
      }
    }
    return 0n;
  }

  const sourceCapacity = graph[source].reduce((sum, edge) => sum + edge.residual, 0n);
  while (buildLevels()) {
    cursor.fill(0);
    while (true) {
      const pushed = send(source, sourceCapacity);
      if (pushed === 0n) break;
      flow += pushed;
    }
  }

  const sourceSide = new Set([source]);
  const queue = [source];
  for (let head = 0; head < queue.length; head += 1) {
    const vertex = queue[head];
    for (const edge of graph[vertex]) {
      if (edge.residual > 0n && !sourceSide.has(edge.to)) {
        sourceSide.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  const cutEdges = originalEdges.filter(edge => sourceSide.has(edge.from) && !sourceSide.has(edge.to));
  const cutCapacity = cutEdges.reduce((sum, edge) => sum + edge.capacity, 0n);
  if (cutCapacity !== flow) throw new Error('internal invariant failed: max-flow/min-cut values differ');

  return {
    maxFlow: flow,
    sourceSide: [...sourceSide].sort((a, b) => a - b),
    sinkSide: Array.from({ length: vertexCount }, (_, i) => i).filter(v => !sourceSide.has(v)),
    cutEdges: cutEdges.map(({ index, from, to, capacity }) => ({ index, from, to, capacity })),
    cutCapacity
  };
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  const classic = [
    [0, 1, 16], [0, 2, 13], [1, 2, 10], [2, 1, 4],
    [1, 3, 12], [3, 2, 9], [2, 4, 14], [4, 3, 7],
    [3, 5, 20], [4, 5, 4]
  ];
  const result = maxFlowWithMinCut(6, classic, 0, 5);
  assert.equal(result.maxFlow, 23n);
  assert.equal(result.cutCapacity, 23n);
  assert.ok(result.sourceSide.includes(0));
  assert.ok(result.sinkSide.includes(5));

  const parallel = maxFlowWithMinCut(3, [[0, 1, 5n], [0, 1, 7n], [1, 2, 20n]], 0, 2);
  assert.equal(parallel.maxFlow, 12n);
  assert.equal(parallel.cutCapacity, 12n);
  assert.equal(maxFlowWithMinCut(3, [[0, 1, 9]], 0, 2).maxFlow, 0n);
  assert.equal(maxFlowWithMinCut(2, [[0, 1, 9007199254740993n]], 0, 1).maxFlow, 9007199254740993n);
  assert.throws(() => maxFlowWithMinCut(2, [[0, 0, 1]], 0, 1), /self-loop/);
  assert.throws(() => maxFlowWithMinCut(2, [[0, 1, -1]], 0, 1), /capacity/);
  console.log('Dinic max-flow tests passed');
}

module.exports = { maxFlowWithMinCut };
