/**
 * Successive Shortest Augmenting Path for minimum-cost maximum flow.
 *
 * Residual edges permit earlier choices to be undone. Bellman-Ford computes
 * initial potentials when negative forward costs exist; Dijkstra then uses
 * non-negative reduced costs for each augmentation.
 *
 * Capacities must be non-negative and costs finite. A reachable negative
 * residual cycle is rejected because shortest augmenting paths are undefined
 * in that case without an additional cycle-cancellation phase.
 *
 * Run: node min-cost-max-flow.js
 */

class MinHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(item) {
    const a = this.items;
    a.push(item);
    let index = a.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (a[parent].priority <= item.priority) break;
      a[index] = a[parent];
      index = parent;
    }
    a[index] = item;
  }

  pop() {
    if (this.items.length === 0) return undefined;
    const a = this.items;
    const root = a[0];
    const last = a.pop();
    if (a.length > 0) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= a.length) break;
        let child = left;
        if (right < a.length && a[right].priority < a[left].priority) child = right;
        if (a[child].priority >= last.priority) break;
        a[index] = a[child];
        index = child;
      }
      a[index] = last;
    }
    return root;
  }
}

class MinCostMaxFlow {
  constructor(vertexCount) {
    if (!Number.isInteger(vertexCount) || vertexCount < 2) {
      throw new RangeError("vertexCount must be an integer of at least two");
    }
    this.vertexCount = vertexCount;
    this.graph = Array.from({ length: vertexCount }, () => []);
  }

  _checkVertex(vertex) {
    if (!Number.isInteger(vertex) || vertex < 0 || vertex >= this.vertexCount) {
      throw new RangeError("vertex is outside the graph");
    }
  }

  addEdge(from, to, capacity, cost) {
    this._checkVertex(from);
    this._checkVertex(to);
    if (from === to) throw new RangeError("self-loops are not supported");
    if (!Number.isFinite(capacity) || capacity < 0) {
      throw new RangeError("capacity must be a finite non-negative number");
    }
    if (!Number.isFinite(cost)) throw new TypeError("cost must be finite");

    const index = this.graph[from].length;
    const reverseIndex = this.graph[to].length;
    this.graph[from].push({
      to,
      rev: reverseIndex,
      capacity,
      cost,
      originalCapacity: capacity
    });
    this.graph[to].push({
      to: from,
      rev: index,
      capacity: 0,
      cost: -cost,
      originalCapacity: 0
    });
    return { from, index };
  }

  edgeFlow(handle) {
    if (!handle || !Number.isInteger(handle.from) || !Number.isInteger(handle.index)) {
      throw new TypeError("invalid edge handle");
    }
    const edge = this.graph[handle.from]?.[handle.index];
    if (!edge || edge.originalCapacity === 0) throw new RangeError("unknown forward edge");
    return edge.originalCapacity - edge.capacity;
  }

  _initialPotentials(source) {
    const n = this.vertexCount;
    const distance = new Array(n).fill(Infinity);
    distance[source] = 0;

    for (let pass = 0; pass < n - 1; pass += 1) {
      let changed = false;
      for (let from = 0; from < n; from += 1) {
        if (!Number.isFinite(distance[from])) continue;
        for (const edge of this.graph[from]) {
          if (edge.capacity <= 0) continue;
          const candidate = distance[from] + edge.cost;
          if (candidate < distance[edge.to] - 1e-12) {
            distance[edge.to] = candidate;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }

    for (let from = 0; from < n; from += 1) {
      if (!Number.isFinite(distance[from])) continue;
      for (const edge of this.graph[from]) {
        if (edge.capacity > 0 &&
            distance[from] + edge.cost < distance[edge.to] - 1e-12) {
          throw new Error("reachable negative-cost residual cycle detected");
        }
      }
    }

    return distance.map((value) => Number.isFinite(value) ? value : 0);
  }

  _shortestPath(source, potential) {
    const n = this.vertexCount;
    const distance = new Array(n).fill(Infinity);
    const previousVertex = new Array(n).fill(-1);
    const previousEdge = new Array(n).fill(-1);
    const heap = new MinHeap();

    distance[source] = 0;
    heap.push({ vertex: source, priority: 0 });

    while (heap.size > 0) {
      const current = heap.pop();
      const from = current.vertex;
      if (current.priority > distance[from] + 1e-12) continue;

      for (let index = 0; index < this.graph[from].length; index += 1) {
        const edge = this.graph[from][index];
        if (edge.capacity <= 0) continue;

        let reducedCost = edge.cost + potential[from] - potential[edge.to];
        if (reducedCost < -1e-9) {
          throw new Error("negative reduced cost; residual potential invariant failed");
        }
        if (reducedCost < 0) reducedCost = 0;

        const candidate = distance[from] + reducedCost;
        if (candidate < distance[edge.to] - 1e-12) {
          distance[edge.to] = candidate;
          previousVertex[edge.to] = from;
          previousEdge[edge.to] = index;
          heap.push({ vertex: edge.to, priority: candidate });
        }
      }
    }

    return { distance, previousVertex, previousEdge };
  }

  solve(source, sink, maxFlow = Infinity) {
    this._checkVertex(source);
    this._checkVertex(sink);
    if (source === sink) throw new RangeError("source and sink must differ");
    if (!(maxFlow === Infinity || (Number.isFinite(maxFlow) && maxFlow >= 0))) {
      throw new RangeError("maxFlow must be non-negative");
    }
    if (maxFlow === 0) return { flow: 0, cost: 0 };

    const potential = this._initialPotentials(source);
    let flow = 0;
    let cost = 0;

    while (flow < maxFlow) {
      const path = this._shortestPath(source, potential);
      if (!Number.isFinite(path.distance[sink])) break;

      for (let vertex = 0; vertex < this.vertexCount; vertex += 1) {
        if (Number.isFinite(path.distance[vertex])) {
          potential[vertex] += path.distance[vertex];
        }
      }

      let amount = maxFlow - flow;
      for (let vertex = sink; vertex !== source; vertex = path.previousVertex[vertex]) {
        const from = path.previousVertex[vertex];
        if (from < 0) throw new Error("broken predecessor chain");
        const edge = this.graph[from][path.previousEdge[vertex]];
        amount = Math.min(amount, edge.capacity);
      }

      for (let vertex = sink; vertex !== source; vertex = path.previousVertex[vertex]) {
        const from = path.previousVertex[vertex];
        const edge = this.graph[from][path.previousEdge[vertex]];
        edge.capacity -= amount;
        this.graph[vertex][edge.rev].capacity += amount;
        cost += amount * edge.cost;
      }
      flow += amount;
    }

    return { flow, cost };
  }

  residualReachable(source) {
    this._checkVertex(source);
    const seen = new Array(this.vertexCount).fill(false);
    const queue = [source];
    seen[source] = true;
    for (let head = 0; head < queue.length; head += 1) {
      const from = queue[head];
      for (const edge of this.graph[from]) {
        if (edge.capacity > 0 && !seen[edge.to]) {
          seen[edge.to] = true;
          queue.push(edge.to);
        }
      }
    }
    return seen;
  }
}

function runTests() {
  const assert = require("node:assert/strict");

  const network = new MinCostMaxFlow(4);
  const expensive = network.addEdge(0, 1, 2, 1);
  network.addEdge(0, 2, 1, 0);
  const negative = network.addEdge(1, 2, 1, -2);
  network.addEdge(1, 3, 1, 3);
  network.addEdge(2, 3, 2, 1);

  assert.deepEqual(network.solve(0, 3, 2), { flow: 2, cost: 1 });
  assert.equal(network.edgeFlow(expensive), 1);
  assert.equal(network.edgeFlow(negative), 1);
  assert.deepEqual(network.solve(0, 3), { flow: 1, cost: 4 });
  assert.deepEqual(network.residualReachable(0), [true, false, false, false]);

  const reroute = new MinCostMaxFlow(6);
  reroute.addEdge(0, 1, 1, 0);
  reroute.addEdge(0, 2, 1, 0);
  reroute.addEdge(1, 3, 1, 0);
  reroute.addEdge(1, 4, 1, 1);
  reroute.addEdge(2, 3, 1, 1);
  reroute.addEdge(2, 4, 1, 100);
  reroute.addEdge(3, 5, 1, 0);
  reroute.addEdge(4, 5, 1, 0);
  assert.deepEqual(reroute.solve(0, 5), { flow: 2, cost: 2 });

  const bad = new MinCostMaxFlow(2);
  bad.addEdge(0, 1, 1, -2);
  bad.addEdge(1, 0, 1, -1);
  assert.throws(() => bad.solve(0, 1), /negative-cost residual cycle/);
  assert.throws(() => new MinCostMaxFlow(1), RangeError);
  console.log("Min-cost max-flow tests passed");
}

module.exports = { MinCostMaxFlow };

if (require.main === module) runTests();
