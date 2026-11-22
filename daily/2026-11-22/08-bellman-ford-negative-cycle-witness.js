/**
 * Exercise: Bellman-Ford shortest paths with negative-cycle reconstruction.
 * Return distances and predecessors. If a source-reachable negative cycle
 * exists, return one cycle as a closed vertex sequence.
 * Vertices are integers [0, vertexCount); edges are [from, to, weight].
 * Run: node 08-bellman-ford-negative-cycle-witness.js
 */
"use strict";
const assert = require("node:assert/strict");

function bellmanFord(vertexCount, edges, source) {
  if (!Number.isInteger(vertexCount) || vertexCount < 1) throw new RangeError("vertexCount must be positive");
  if (!Number.isInteger(source) || source < 0 || source >= vertexCount) throw new RangeError("invalid source");
  for (const edge of edges) {
    if (!Array.isArray(edge) || edge.length !== 3) throw new TypeError("each edge must be [from,to,weight]");
    const [u, v, w] = edge;
    if (![u, v].every(Number.isInteger) || u < 0 || u >= vertexCount || v < 0 || v >= vertexCount ||
        !Number.isFinite(w)) throw new TypeError("invalid edge");
  }

  const distance = Array(vertexCount).fill(Infinity);
  const predecessor = Array(vertexCount).fill(null);
  distance[source] = 0;

  for (let pass = 1; pass < vertexCount; pass++) {
    let changed = false;
    for (const [u, v, weight] of edges) {
      if (distance[u] !== Infinity && distance[u] + weight < distance[v]) {
        distance[v] = distance[u] + weight;
        predecessor[v] = u;
        changed = true;
      }
    }
    if (!changed) break;
  }

  let updated = -1;
  for (const [u, v, weight] of edges) {
    if (distance[u] !== Infinity && distance[u] + weight < distance[v]) {
      distance[v] = distance[u] + weight;
      predecessor[v] = u;
      updated = v;
    }
  }

  if (updated === -1) return { distance, predecessor, negativeCycle: null };

  let inside = updated;
  for (let i = 0; i < vertexCount; i++) inside = predecessor[inside];
  const cycle = [inside];
  for (let v = predecessor[inside]; v !== inside; v = predecessor[v]) {
    if (v === null || cycle.length > vertexCount + 1) throw new Error("failed to reconstruct cycle");
    cycle.push(v);
  }
  cycle.push(inside);
  cycle.reverse();
  return { distance, predecessor, negativeCycle: cycle };
}

const acyclic = bellmanFord(5, [[0,1,6],[0,2,7],[1,2,8],[1,3,5],[1,4,-4],[2,3,-3],[2,4,9],[3,1,-2],[4,3,7]], 0);
assert.equal(acyclic.distance[4], -2);
assert.equal(acyclic.negativeCycle, null);

const cyclic = bellmanFord(4, [[0,1,1],[1,2,-2],[2,1,-2],[2,3,5]], 0);
assert.ok(Array.isArray(cyclic.negativeCycle));
assert.equal(cyclic.negativeCycle[0], cyclic.negativeCycle.at(-1));
assert.ok(cyclic.negativeCycle.includes(1) && cyclic.negativeCycle.includes(2));

const unreachable = bellmanFord(4, [[0,1,2],[2,3,-5],[3,2,1]], 0);
assert.equal(unreachable.negativeCycle, null);
assert.equal(unreachable.distance[2], Infinity);
assert.throws(() => bellmanFord(0, [], 0), RangeError);
console.log("Bellman-Ford tests passed");
module.exports = { bellmanFord };
