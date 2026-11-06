/**
 * Exercise: Minimum-Cost Maximum Flow
 * Successive shortest augmenting paths with Bellman-Ford on each residual
 * network. Supports negative edge costs and reverse residual edges.
 *
 * Edges: [from, to, capacity, cost]. Capacities are non-negative safe integers.
 * Assumption: no negative-cost cycle is reachable from the source initially.
 * Complexity: O(F * V * E) in the worst case, with bottleneck augmentation.
 */
function minCostMaxFlow(vertexCount, edges, source, sink, flowLimit = Infinity) {
  if (!Number.isInteger(vertexCount) || vertexCount < 2) throw new TypeError("vertexCount must be >= 2");
  if (![source, sink].every(Number.isInteger) || source < 0 || sink < 0 ||
      source >= vertexCount || sink >= vertexCount || source === sink) {
    throw new RangeError("source and sink must be distinct valid vertices");
  }
  if (!(flowLimit === Infinity || (Number.isSafeInteger(flowLimit) && flowLimit >= 0))) {
    throw new RangeError("flowLimit must be a non-negative safe integer or Infinity");
  }

  const graph = Array.from({ length: vertexCount }, () => []);
  function addEdge(from, to, capacity, cost) {
    const forward = { to, rev: graph[to].length, capacity, cost };
    const reverse = { to: from, rev: graph[from].length, capacity: 0, cost: -cost };
    graph[from].push(forward);
    graph[to].push(reverse);
  }
  for (const edge of edges) {
    if (!Array.isArray(edge) || edge.length !== 4) throw new TypeError("edge must be [from, to, capacity, cost]");
    const [from, to, capacity, cost] = edge;
    if (![from, to].every(Number.isInteger) || from < 0 || to < 0 ||
        from >= vertexCount || to >= vertexCount) throw new RangeError("invalid edge endpoint");
    if (!Number.isSafeInteger(capacity) || capacity < 0) throw new RangeError("invalid capacity");
    if (!Number.isFinite(cost)) throw new TypeError("cost must be finite");
    addEdge(from, to, capacity, cost);
  }

  let flow = 0;
  let totalCost = 0;
  while (flow < flowLimit) {
    const dist = Array(vertexCount).fill(Infinity);
    const prevVertex = Array(vertexCount).fill(-1);
    const prevEdge = Array(vertexCount).fill(-1);
    dist[source] = 0;

    // Bellman-Ford handles negative reverse edges without requiring potentials.
    for (let pass = 0; pass < vertexCount - 1; pass++) {
      let changed = false;
      for (let from = 0; from < vertexCount; from++) {
        if (dist[from] === Infinity) continue;
        for (let i = 0; i < graph[from].length; i++) {
          const edge = graph[from][i];
          if (edge.capacity <= 0) continue;
          const candidate = dist[from] + edge.cost;
          if (candidate < dist[edge.to]) {
            dist[edge.to] = candidate;
            prevVertex[edge.to] = from;
            prevEdge[edge.to] = i;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }

    for (let from = 0; from < vertexCount; from++) {
      if (dist[from] === Infinity) continue;
      for (const edge of graph[from]) {
        if (edge.capacity > 0 && dist[from] + edge.cost < dist[edge.to]) {
          throw new Error("reachable negative-cost cycle in residual network");
        }
      }
    }
    if (dist[sink] === Infinity) break;

    let amount = flowLimit - flow;
    for (let v = sink; v !== source; v = prevVertex[v]) {
      if (prevVertex[v] === -1) throw new Error("broken predecessor chain");
      amount = Math.min(amount, graph[prevVertex[v]][prevEdge[v]].capacity);
    }
    for (let v = sink; v !== source; v = prevVertex[v]) {
      const u = prevVertex[v];
      const edge = graph[u][prevEdge[v]];
      edge.capacity -= amount;
      graph[v][edge.rev].capacity += amount;
    }
    flow += amount;
    totalCost += amount * dist[sink];
  }
  return { flow, cost: totalCost };
}

function assertDeepEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(label + ": expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
  }
}
function assertThrows(fn, pattern) {
  let error;
  try { fn(); } catch (caught) { error = caught; }
  if (!error || (pattern && !pattern.test(error.message))) throw new Error("expected throw " + pattern);
}

const network = [
  [0, 1, 2, 1], [0, 2, 1, 0], [1, 2, 1, -2],
  [1, 3, 1, 3], [2, 3, 2, 2]
];
assertDeepEqual(minCostMaxFlow(4, network, 0, 3), { flow: 3, cost: 7 }, "maximum flow");
assertDeepEqual(minCostMaxFlow(4, network, 0, 3, 2), { flow: 2, cost: 3 }, "flow limit");
assertDeepEqual(minCostMaxFlow(3, [[0, 1, 4, 2]], 0, 2), { flow: 0, cost: 0 }, "unreachable sink");

const negativeEdges = [
  [0, 1, 1, 2], [0, 2, 1, 0], [2, 1, 1, -3],
  [1, 3, 2, 0], [2, 3, 1, 5]
];
assertDeepEqual(minCostMaxFlow(4, negativeEdges, 0, 3), { flow: 2, cost: -1 }, "negative costs");
assertThrows(() => minCostMaxFlow(3, [[0, 1, 1, 0], [1, 2, 1, -2], [2, 1, 1, 1]], 0, 2), /negative-cost cycle/);
assertThrows(() => minCostMaxFlow(2, [[0, 1, -1, 0]], 0, 1), /capacity/);

if (typeof module !== "undefined") module.exports = { minCostMaxFlow };
