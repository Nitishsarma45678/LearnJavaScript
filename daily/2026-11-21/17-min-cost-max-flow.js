// Exercise: Implement minimum-cost maximum flow with residual edges.
// Successive shortest augmenting paths use Bellman-Ford so negative reverse-edge costs
// are handled correctly. Capacities are non-negative integers; costs may be negative.

class MinCostMaxFlow {
  constructor(vertexCount) {
    if (!Number.isInteger(vertexCount) || vertexCount < 2) {
      throw new RangeError("vertexCount must be at least two");
    }
    this.graph = Array.from({ length: vertexCount }, () => []);
  }

  addEdge(from, to, capacity, cost) {
    this._checkVertex(from);
    this._checkVertex(to);
    if (from === to) throw new RangeError("self-loops are not supported");
    if (!Number.isInteger(capacity) || capacity < 0 || !Number.isFinite(cost)) {
      throw new TypeError("capacity must be a non-negative integer and cost must be finite");
    }
    const forward = {
      to, rev: this.graph[to].length, cap: capacity, cost, originalCapacity: capacity
    };
    const reverse = {
      to: from, rev: this.graph[from].length, cap: 0, cost: -cost, originalCapacity: 0
    };
    this.graph[from].push(forward);
    this.graph[to].push(reverse);
  }

  _checkVertex(vertex) {
    if (!Number.isInteger(vertex) || vertex < 0 || vertex >= this.graph.length) {
      throw new RangeError("vertex is out of range");
    }
  }

  minCostMaxFlow(source, sink, limit = Infinity) {
    this._checkVertex(source);
    this._checkVertex(sink);
    if (source === sink) throw new RangeError("source and sink must differ");
    if (!(limit === Infinity || (Number.isInteger(limit) && limit >= 0))) {
      throw new RangeError("flow limit must be a non-negative integer");
    }

    const n = this.graph.length;
    let flow = 0;
    let cost = 0;

    while (flow < limit) {
      const distance = Array(n).fill(Infinity);
      const previousVertex = Array(n).fill(-1);
      const previousEdge = Array(n).fill(-1);
      distance[source] = 0;

      for (let pass = 0; pass < n - 1; pass++) {
        let changed = false;
        for (let from = 0; from < n; from++) {
          if (!Number.isFinite(distance[from])) continue;
          for (let edgeIndex = 0; edgeIndex < this.graph[from].length; edgeIndex++) {
            const edge = this.graph[from][edgeIndex];
            if (edge.cap <= 0) continue;
            const candidate = distance[from] + edge.cost;
            if (candidate < distance[edge.to]) {
              distance[edge.to] = candidate;
              previousVertex[edge.to] = from;
              previousEdge[edge.to] = edgeIndex;
              changed = true;
            }
          }
        }
        if (!changed) break;
      }

      if (!Number.isFinite(distance[sink])) break;
      let amount = limit - flow;
      for (let vertex = sink; vertex !== source; vertex = previousVertex[vertex]) {
        if (previousVertex[vertex] === -1) throw new Error("broken augmenting path");
        const edge = this.graph[previousVertex[vertex]][previousEdge[vertex]];
        amount = Math.min(amount, edge.cap);
      }

      for (let vertex = sink; vertex !== source; vertex = previousVertex[vertex]) {
        const from = previousVertex[vertex];
        const edge = this.graph[from][previousEdge[vertex]];
        edge.cap -= amount;
        this.graph[vertex][edge.rev].cap += amount;
      }
      flow += amount;
      cost += amount * distance[sink];
    }

    return { flow, cost };
  }
}

// Tests
const assert = require("node:assert/strict");
const network = new MinCostMaxFlow(4);
network.addEdge(0, 1, 3, 1);
network.addEdge(0, 2, 2, 2);
network.addEdge(1, 2, 2, 1);
network.addEdge(1, 3, 2, 3);
network.addEdge(2, 3, 3, 1);
assert.deepEqual(network.minCostMaxFlow(0, 3), { flow: 5, cost: 17 });

const limited = new MinCostMaxFlow(3);
limited.addEdge(0, 1, 5, 4);
limited.addEdge(1, 2, 5, 2);
assert.deepEqual(limited.minCostMaxFlow(0, 2, 2), { flow: 2, cost: 12 });
assert.deepEqual(limited.minCostMaxFlow(0, 2), { flow: 3, cost: 18 });
console.log("min-cost max-flow tests passed");
