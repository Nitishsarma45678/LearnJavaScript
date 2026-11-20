// Exercise: Implement Edmonds-Karp maximum flow for a directed capacity matrix.
// Return both the maximum flow value and the source side of a minimum cut.
// Run: node daily/2026-11-20/17-edmonds-karp-max-flow.js
"use strict";
const assert = require("node:assert/strict");
function edmondsKarp(capacity, source, sink) {
  if (!Array.isArray(capacity) || capacity.length === 0 ||
      !capacity.every(row => Array.isArray(row) && row.length === capacity.length)) {
    throw new TypeError("capacity must be a non-empty square matrix");
  }
  const n = capacity.length;
  if (![source, sink].every(v => Number.isInteger(v) && v >= 0 && v < n)) throw new RangeError("source or sink out of range");
  if (capacity.some(row => row.some(value => !Number.isFinite(value) || value < 0))) {
    throw new TypeError("capacities must be finite and non-negative");
  }
  const residual = capacity.map(row => row.slice());
  if (source === sink) return { maxFlow: 0, sourceSide: Array.from({ length: n }, (_, i) => i === source) };
  let maxFlow = 0;
  while (true) {
    const parent = Array(n).fill(-1);
    const queue = [source]; parent[source] = source;
    for (let head = 0; head < queue.length && parent[sink] === -1; head++) {
      const from = queue[head];
      for (let to = 0; to < n; to++) {
        if (parent[to] === -1 && residual[from][to] > 0) {
          parent[to] = from;
          queue.push(to);
          if (to === sink) break;
        }
      }
    }
    if (parent[sink] === -1) break;
    let bottleneck = Infinity;
    for (let v = sink; v !== source; v = parent[v]) bottleneck = Math.min(bottleneck, residual[parent[v]][v]);
    for (let v = sink; v !== source; v = parent[v]) {
      const u = parent[v];
      residual[u][v] -= bottleneck;
      residual[v][u] += bottleneck;
    }
    maxFlow += bottleneck;
  }
  const reachable = Array(n).fill(false), queue = [source];
  reachable[source] = true;
  for (let head = 0; head < queue.length; head++) {
    const from = queue[head];
    for (let to = 0; to < n; to++) if (!reachable[to] && residual[from][to] > 0) {
      reachable[to] = true; queue.push(to);
    }
  }
  return { maxFlow, sourceSide: reachable };
}
const network = [
  [0,16,13,0,0,0],
  [0,0,10,12,0,0],
  [0,4,0,0,14,0],
  [0,0,9,0,0,20],
  [0,0,0,7,0,4],
  [0,0,0,0,0,0]
];
const result = edmondsKarp(network, 0, 5);
assert.equal(result.maxFlow, 23);
assert.equal(result.sourceSide[0], true);
assert.equal(result.sourceSide[5], false);
let cutCapacity = 0;
for (let u = 0; u < network.length; u++) for (let v = 0; v < network.length; v++) {
  if (result.sourceSide[u] && !result.sourceSide[v]) cutCapacity += network[u][v];
}
assert.equal(cutCapacity, result.maxFlow, "max-flow/min-cut values must agree");
assert.equal(edmondsKarp([[0,0],[0,0]], 0, 1).maxFlow, 0);
assert.throws(() => edmondsKarp([[0,1],[0]], 0, 1), /square/);
console.log("Edmonds-Karp maximum flow: all tests passed");
