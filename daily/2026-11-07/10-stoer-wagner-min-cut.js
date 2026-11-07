'use strict';

/**
 * Exercise: Find a global minimum cut in an undirected weighted graph.
 *
 * Implement Stoer-Wagner's deterministic contraction algorithm. Parallel
 * edges are combined, self-loops are ignored, disconnected graphs return a
 * zero cut, and the result includes both sides of the partition.
 */

function globalMinCut(vertexCount, edges) {
  if (!Number.isSafeInteger(vertexCount) || vertexCount < 2) {
    throw new RangeError('vertexCount must be at least 2');
  }
  if (!Array.isArray(edges)) throw new TypeError('edges must be an array');

  const weights = Array.from({ length: vertexCount }, () => new Float64Array(vertexCount));
  for (const edge of edges) {
    if (!Array.isArray(edge) || edge.length !== 3) throw new TypeError('each edge must be [u, v, weight]');
    const [u, v, weight] = edge;
    if (![u, v].every((node) => Number.isSafeInteger(node) && node >= 0 && node < vertexCount)) {
      throw new RangeError('edge endpoint is outside the graph');
    }
    if (!Number.isFinite(weight) || weight < 0) throw new RangeError('edge weight must be finite and non-negative');
    if (u === v) continue;
    weights[u][v] += weight;
    weights[v][u] += weight;
    if (!Number.isFinite(weights[u][v])) throw new RangeError('combined edge weight overflowed');
  }

  const active = Array.from({ length: vertexCount }, (_, vertex) => vertex);
  const groups = Array.from({ length: vertexCount }, (_, vertex) => [vertex]);
  let bestWeight = Infinity;
  let bestSide = null;

  while (active.length > 1) {
    const added = new Uint8Array(vertexCount);
    const connection = new Float64Array(vertexCount);
    let previous = -1;

    for (let phaseStep = 0; phaseStep < active.length; phaseStep++) {
      let selected = -1;
      for (const vertex of active) {
        if (added[vertex]) continue;
        if (selected === -1 || connection[vertex] > connection[selected] ||
            (connection[vertex] === connection[selected] && vertex < selected)) {
          selected = vertex;
        }
      }

      if (phaseStep === active.length - 1) {
        // selected is t, the final vertex; its accumulated weight is this phase's cut.
        if (connection[selected] < bestWeight) {
          bestWeight = connection[selected];
          bestSide = groups[selected].slice();
        }

        // Contract t into the penultimate vertex s.
        for (const vertex of active) {
          if (vertex === selected || vertex === previous) continue;
          weights[previous][vertex] += weights[selected][vertex];
          if (!Number.isFinite(weights[previous][vertex])) throw new RangeError('contracted edge weight overflowed');
          weights[vertex][previous] = weights[previous][vertex];
        }
        groups[previous].push(...groups[selected]);
        active.splice(active.indexOf(selected), 1);
      } else {
        added[selected] = 1;
        previous = selected;
        for (const vertex of active) {
          if (!added[vertex]) {
            connection[vertex] += weights[selected][vertex];
            if (!Number.isFinite(connection[vertex])) throw new RangeError('phase connection weight overflowed');
          }
        }
      }
    }
  }

  const sideA = bestSide.slice().sort((a, b) => a - b);
  const included = new Set(sideA);
  const sideB = Array.from({ length: vertexCount }, (_, vertex) => vertex)
    .filter((vertex) => !included.has(vertex));
  return Object.freeze({
    weight: bestWeight,
    partitionA: Object.freeze(sideA),
    partitionB: Object.freeze(sideB),
  });
}

function bruteMinCut(vertexCount, edges) {
  let best = Infinity;
  // Fix vertex 0 in A and exclude the all-vertices-in-A mask.
  const limit = 1 << (vertexCount - 1);
  for (let mask = 0; mask < limit - 1; mask++) {
    const inA = (vertex) => vertex === 0 || ((mask >> (vertex - 1)) & 1) === 1;
    let cut = 0;
    for (const [u, v, weight] of edges) if (inA(u) !== inA(v)) cut += weight;
    if (cut < best) best = cut;
  }
  return best;
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  const triangle = globalMinCut(3, [[0, 1, 3], [1, 2, 4], [0, 2, 5]]);
  assert.equal(triangle.weight, 7);
  assert.equal(triangle.partitionA.length + triangle.partitionB.length, 3);
  assert.equal(new Set([...triangle.partitionA, ...triangle.partitionB]).size, 3);

  const parallel = globalMinCut(3, [[0, 1, 2], [0, 1, 3], [1, 2, 8], [0, 2, 9], [1, 1, 100]]);
  assert.equal(parallel.weight, 13);
  assert.equal(globalMinCut(4, [[0, 1, 1], [2, 3, 1]]).weight, 0);
  assert.equal(globalMinCut(2, []).weight, 0);

  // Differentially compare against exhaustive cut enumeration on small graphs.
  let seed = 0xBADC0DE;
  const random = (limit) => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % limit; };
  for (let trial = 0; trial < 300; trial++) {
    const n = 2 + random(7);
    const graphEdges = [];
    for (let u = 0; u < n; u++) for (let v = u + 1; v < n; v++) {
      if (random(3) !== 0) graphEdges.push([u, v, random(10)]);
      if (random(12) === 0) graphEdges.push([u, v, random(5)]); // parallel edge
    }
    const actual = globalMinCut(n, graphEdges);
    const expected = bruteMinCut(n, graphEdges);
    assert.equal(actual.weight, expected, `trial ${trial}`);
    assert.equal(actual.partitionA.length + actual.partitionB.length, n);
    assert.equal(new Set([...actual.partitionA, ...actual.partitionB]).size, n);
    assert.ok(actual.partitionA.length > 0 && actual.partitionB.length > 0);
  }

  assert.throws(() => globalMinCut(1, []), /at least 2/);
  assert.throws(() => globalMinCut(3, [[0, 3, 1]]), /endpoint/);
  assert.throws(() => globalMinCut(3, [[0, 1, -1]]), /non-negative/);
  console.log('stoer-wagner-min-cut: all tests passed');
}

module.exports = { globalMinCut };
