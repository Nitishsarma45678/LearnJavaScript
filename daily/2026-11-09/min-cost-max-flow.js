/*
 * Minimum-Cost Maximum-Flow
 * -------------------------
 * Successive shortest augmenting paths with Bellman-Ford on the residual
 * graph. Bellman-Ford permits negative edge costs and reverse residual
 * edges. The implementation rejects a reachable negative-cost cycle:
 * without additional cycle-canceling, shortest augmenting paths are not
 * well-defined in that case.
 *
 * Capacities and costs are safe integers. The graph is directed.
 */

"use strict";

const assert = require("node:assert/strict");

class MinCostMaxFlow {
  constructor(vertexCount) {
    if (!Number.isInteger(vertexCount) || vertexCount < 2) {
      throw new RangeError("vertexCount must be an integer of at least 2");
    }
    this.graph = Array.from({ length: vertexCount }, () => []);
  }

  addEdge(from, to, capacity, cost) {
    const n = this.graph.length;
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 0 ||
      to < 0 ||
      from >= n ||
      to >= n ||
      from === to
    ) {
      throw new RangeError("Edge endpoints must be distinct valid vertices");
    }
    if (!Number.isSafeInteger(capacity) || capacity < 0) {
      throw new RangeError("Capacity must be a non-negative safe integer");
    }
    if (!Number.isSafeInteger(cost)) {
      throw new RangeError("Cost must be a safe integer");
    }

    const forward = {
      to,
      reverseIndex: this.graph[to].length,
      capacity,
      cost,
      originalCapacity: capacity
    };
    const reverse = {
      to: from,
      reverseIndex: this.graph[from].length,
      capacity: 0,
      cost: -cost,
      originalCapacity: 0
    };

    this.graph[from].push(forward);
    this.graph[to].push(reverse);
  }

  minCostMaxFlow(source, sink, maxFlow = Infinity) {
    const n = this.graph.length;
    if (
      !Number.isInteger(source) ||
      !Number.isInteger(sink) ||
      source < 0 ||
      sink < 0 ||
      source >= n ||
      sink >= n ||
      source === sink
    ) {
      throw new RangeError("Source and sink must be distinct valid vertices");
    }
    if (
      maxFlow !== Infinity &&
      (!Number.isSafeInteger(maxFlow) || maxFlow < 0)
    ) {
      throw new RangeError("maxFlow must be Infinity or a non-negative integer");
    }

    let flow = 0;
    let cost = 0;
    const augmentations = [];

    while (flow < maxFlow) {
      const distance = new Array(n).fill(Infinity);
      const parentVertex = new Array(n).fill(-1);
      const parentEdge = new Array(n).fill(-1);
      distance[source] = 0;

      // Bellman-Ford over residual edges with positive remaining capacity.
      for (let pass = 0; pass < n - 1; pass += 1) {
        let changed = false;

        for (let vertex = 0; vertex < n; vertex += 1) {
          if (distance[vertex] === Infinity) continue;

          for (
            let edgeIndex = 0;
            edgeIndex < this.graph[vertex].length;
            edgeIndex += 1
          ) {
            const edge = this.graph[vertex][edgeIndex];
            if (edge.capacity === 0) continue;

            const candidate = distance[vertex] + edge.cost;
            if (candidate < distance[edge.to]) {
              distance[edge.to] = candidate;
              parentVertex[edge.to] = vertex;
              parentEdge[edge.to] = edgeIndex;
              changed = true;
            }
          }
        }

        if (!changed) break;
      }

      // A reachable negative cycle invalidates shortest-path augmentation.
      for (let vertex = 0; vertex < n; vertex += 1) {
        if (distance[vertex] === Infinity) continue;
        for (const edge of this.graph[vertex]) {
          if (
            edge.capacity > 0 &&
            distance[vertex] + edge.cost < distance[edge.to]
          ) {
            throw new RangeError(
              "Reachable negative-cost cycle in residual network"
            );
          }
        }
      }

      if (distance[sink] === Infinity) break;

      let amount = maxFlow - flow;
      for (let vertex = sink; vertex !== source; vertex = parentVertex[vertex]) {
        const previous = parentVertex[vertex];
        if (previous === -1) {
          throw new Error("Residual path reconstruction failed");
        }
        const edge = this.graph[previous][parentEdge[vertex]];
        amount = Math.min(amount, edge.capacity);
      }

      const path = [];
      for (let vertex = sink; vertex !== source; vertex = parentVertex[vertex]) {
        path.push(vertex);
        const previous = parentVertex[vertex];
        const edge = this.graph[previous][parentEdge[vertex]];
        edge.capacity -= amount;
        this.graph[vertex][edge.reverseIndex].capacity += amount;
      }
      path.push(source);
      path.reverse();

      flow += amount;
      cost += amount * distance[sink];
      if (!Number.isSafeInteger(flow) || !Number.isSafeInteger(cost)) {
        throw new RangeError("Flow or total cost exceeded safe integer range");
      }

      augmentations.push({
        amount,
        unitCost: distance[sink],
        path
      });
    }

    return { flow, cost, augmentations };
  }
}

function runTests() {
  const graph = new MinCostMaxFlow(4);
  graph.addEdge(0, 1, 2, 1);
  graph.addEdge(0, 2, 1, 0);
  graph.addEdge(1, 2, 1, -2);
  graph.addEdge(1, 3, 1, 3);
  graph.addEdge(2, 3, 2, 1);

  const result = graph.minCostMaxFlow(0, 3);
  assert.equal(result.flow, 3);
  assert.equal(result.cost, 5);
  assert.equal(result.augmentations.reduce((total, item) => total + item.amount, 0), 3);

  const negativeCosts = new MinCostMaxFlow(4);
  negativeCosts.addEdge(0, 1, 1, 2);
  negativeCosts.addEdge(0, 2, 1, 0);
  negativeCosts.addEdge(1, 2, 1, -5);
  negativeCosts.addEdge(1, 3, 1, 0);
  negativeCosts.addEdge(2, 3, 2, 1);
  assert.deepEqual(
    (({ flow, cost }) => ({ flow, cost }))(
      negativeCosts.minCostMaxFlow(0, 3)
    ),
    { flow: 2, cost: -1 }
  );

  const limited = new MinCostMaxFlow(3);
  limited.addEdge(0, 1, 5, 4);
  limited.addEdge(1, 2, 5, 6);
  assert.equal(limited.minCostMaxFlow(0, 2, 2).cost, 20);

  const disconnected = new MinCostMaxFlow(3);
  disconnected.addEdge(0, 1, 4, 1);
  assert.deepEqual(
    (({ flow, cost }) => ({ flow, cost }))(
      disconnected.minCostMaxFlow(0, 2)
    ),
    { flow: 0, cost: 0 }
  );

  const cycle = new MinCostMaxFlow(3);
  cycle.addEdge(0, 1, 1, 0);
  cycle.addEdge(1, 2, 1, -2);
  cycle.addEdge(2, 1, 1, 1);
  assert.throws(
    () => cycle.minCostMaxFlow(0, 2),
    /negative-cost cycle/
  );

  assert.throws(() => new MinCostMaxFlow(1), RangeError);
  assert.throws(() => graph.addEdge(0, 1, -1, 0), RangeError);
  assert.throws(() => graph.addEdge(0, 1, 1, 1.5), RangeError);

  console.log("MinCostMaxFlow: all tests passed");
}

module.exports = { MinCostMaxFlow };

if (require.main === module) runTests();
