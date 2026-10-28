// Successive shortest augmenting paths using Bellman-Ford on the residual graph.
// Supports negative edge costs when the initial residual network has no reachable negative-cost cycle.
// Run with: node min-cost-max-flow.js
const assert = require("node:assert/strict");

function minCostMaxFlow(vertexCount, edges, source, sink, maxFlow = Infinity) {
  if (!Number.isInteger(vertexCount) || vertexCount < 2) {
    throw new TypeError("vertexCount must be an integer of at least 2");
  }
  if (!Number.isInteger(source) || !Number.isInteger(sink) ||
      source < 0 || sink < 0 || source >= vertexCount || sink >= vertexCount ||
      source === sink) {
    throw new RangeError("source and sink must be distinct valid vertices");
  }
  if (!(maxFlow === Infinity || (Number.isInteger(maxFlow) && maxFlow >= 0))) {
    throw new TypeError("maxFlow must be a non-negative integer or Infinity");
  }

  const graph = Array.from({ length: vertexCount }, () => []);
  for (const edge of edges) {
    if (!Array.isArray(edge) || edge.length !== 4) {
      throw new TypeError("each edge must be [from, to, capacity, cost]");
    }
    const [from, to, capacity, cost] = edge;
    if (!Number.isInteger(from) || !Number.isInteger(to) ||
        from < 0 || to < 0 || from >= vertexCount || to >= vertexCount) {
      throw new RangeError("edge endpoint is outside the graph");
    }
    if (from === to) throw new RangeError("self-loops are not supported");
    if (!Number.isInteger(capacity) || capacity < 0 || !Number.isFinite(cost)) {
      throw new TypeError("capacity must be a non-negative integer and cost must be finite");
    }

    const forward = { to, rev: graph[to].length, cap: capacity, cost };
    const reverse = { to: from, rev: graph[from].length, cap: 0, cost: -cost };
    graph[from].push(forward);
    graph[to].push(reverse);
  }

  let flow = 0;
  let cost = 0;

  while (flow < maxFlow) {
    const distance = new Array(vertexCount).fill(Infinity);
    const parentVertex = new Array(vertexCount).fill(-1);
    const parentEdge = new Array(vertexCount).fill(-1);
    distance[source] = 0;

    // Bellman-Ford is used because reverse residual edges can have negative costs.
    for (let pass = 0; pass < vertexCount - 1; pass += 1) {
      let changed = false;
      for (let from = 0; from < vertexCount; from += 1) {
        if (distance[from] === Infinity) continue;
        for (let edgeIndex = 0; edgeIndex < graph[from].length; edgeIndex += 1) {
          const edge = graph[from][edgeIndex];
          if (edge.cap <= 0) continue;
          const candidate = distance[from] + edge.cost;
          if (candidate < distance[edge.to]) {
            distance[edge.to] = candidate;
            parentVertex[edge.to] = from;
            parentEdge[edge.to] = edgeIndex;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }

    if (distance[sink] === Infinity) break;

    let amount = maxFlow - flow;
    for (let vertex = sink; vertex !== source; vertex = parentVertex[vertex]) {
      const from = parentVertex[vertex];
      if (from === -1) throw new Error("broken augmenting path");
      amount = Math.min(amount, graph[from][parentEdge[vertex]].cap);
    }

    for (let vertex = sink; vertex !== source; vertex = parentVertex[vertex]) {
      const from = parentVertex[vertex];
      const edge = graph[from][parentEdge[vertex]];
      edge.cap -= amount;
      graph[vertex][edge.rev].cap += amount;
    }

    flow += amount;
    cost += amount * distance[sink];
  }

  return { flow, cost };
}

const network = [
  [0, 1, 2, 1],
  [0, 2, 1, 0],
  [1, 2, 1, -2],
  [1, 3, 1, 3],
  [2, 3, 2, 1],
];

assert.deepEqual(minCostMaxFlow(4, network, 0, 3), { flow: 3, cost: 5 });
assert.deepEqual(minCostMaxFlow(4, network, 0, 3, 2), { flow: 2, cost: 1 });
assert.deepEqual(minCostMaxFlow(4, network, 0, 3, 0), { flow: 0, cost: 0 });
assert.deepEqual(minCostMaxFlow(3, [[0, 1, 4, 7]], 0, 2), { flow: 0, cost: 0 });
assert.throws(() => minCostMaxFlow(2, [[0, 1, -1, 0]], 0, 1), /capacity/);

console.log("Min-cost max-flow: all assertions passed");
