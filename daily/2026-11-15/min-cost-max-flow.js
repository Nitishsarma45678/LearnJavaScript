/**
 * Minimum-Cost Maximum Flow
 * ------------------------
 * Successive shortest augmenting paths with Johnson potentials. Initial
 * potentials are computed by Bellman-Ford so negative-cost forward edges are
 * supported. Each augmentation then uses Dijkstra on non-negative reduced
 * costs, and residual reverse edges allow earlier choices to be rerouted.
 *
 * Capacities and costs are safe integers. Reachable negative-cost cycles are
 * rejected because this implementation solves the source-to-sink path
 * augmentation problem, not general negative-cycle circulation.
 */

'use strict';

class MinHeap {
  constructor() {
    this.items = [];
  }

  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >>> 1;
      if (a[p].distance <= item.distance) break;
      a[i] = a[p];
      i = p;
    }
    a[i] = item;
  }

  pop() {
    const a = this.items;
    if (a.length === 0) return undefined;
    const first = a[0];
    const last = a.pop();
    if (a.length) {
      let i = 0;
      while (true) {
        const left = i * 2 + 1;
        const right = left + 1;
        if (left >= a.length) break;
        let child = left;
        if (right < a.length && a[right].distance < a[left].distance) child = right;
        if (last.distance <= a[child].distance) break;
        a[i] = a[child];
        i = child;
      }
      a[i] = last;
    }
    return first;
  }

  get size() {
    return this.items.length;
  }
}

class MinCostMaxFlow {
  constructor(vertexCount) {
    if (!Number.isInteger(vertexCount) || vertexCount <= 0) {
      throw new RangeError('vertexCount must be a positive integer');
    }
    this.graph = Array.from({ length: vertexCount }, () => []);
  }

  get vertexCount() {
    return this.graph.length;
  }

  addEdge(from, to, capacity, cost) {
    this._assertVertex(from);
    this._assertVertex(to);
    if (from === to) throw new RangeError('self-loop edges are not supported');
    if (!Number.isSafeInteger(capacity) || capacity < 0) {
      throw new RangeError('capacity must be a non-negative safe integer');
    }
    if (!Number.isSafeInteger(cost)) {
      throw new RangeError('cost must be a safe integer');
    }

    const forwardIndex = this.graph[from].length;
    const reverseIndex = this.graph[to].length;
    const forward = {
      to, rev: reverseIndex, capacity, initialCapacity: capacity, cost
    };
    const reverse = {
      to: from, rev: forwardIndex, capacity: 0, initialCapacity: 0, cost: -cost
    };
    this.graph[from].push(forward);
    this.graph[to].push(reverse);
    return Object.freeze({ from, index: forwardIndex });
  }

  getFlow(handle) {
    if (!handle || !Number.isInteger(handle.from) || !Number.isInteger(handle.index)) {
      throw new TypeError('invalid edge handle');
    }
    const edge = this.graph[handle.from] && this.graph[handle.from][handle.index];
    if (!edge || edge.initialCapacity === undefined) throw new RangeError('unknown edge handle');
    return edge.initialCapacity - edge.capacity;
  }

  solve(source, sink, options = {}) {
    this._assertVertex(source);
    this._assertVertex(sink);
    if (source === sink) throw new RangeError('source and sink must differ');

    const { maxFlow = Infinity } = options;
    if (!(maxFlow === Infinity || (Number.isSafeInteger(maxFlow) && maxFlow >= 0))) {
      throw new RangeError('maxFlow must be a non-negative safe integer or Infinity');
    }
    if (maxFlow === 0) return { flow: 0, cost: 0 };

    const n = this.vertexCount;
    const potential = this._initialPotentials(source);
    let flow = 0;
    let cost = 0;

    while (flow < maxFlow) {
      const distance = new Array(n).fill(Infinity);
      const previousVertex = new Array(n).fill(-1);
      const previousEdge = new Array(n).fill(-1);
      const heap = new MinHeap();
      distance[source] = 0;
      heap.push({ vertex: source, distance: 0 });

      while (heap.size) {
        const current = heap.pop();
        const u = current.vertex;
        if (current.distance !== distance[u]) continue;

        for (let edgeIndex = 0; edgeIndex < this.graph[u].length; edgeIndex += 1) {
          const edge = this.graph[u][edgeIndex];
          if (edge.capacity <= 0) continue;
          const reducedCost = edge.cost + potential[u] - potential[edge.to];
          if (reducedCost < 0) {
            throw new Error('negative reduced cost; residual potentials are inconsistent');
          }
          const candidate = current.distance + reducedCost;
          if (candidate < distance[edge.to]) {
            distance[edge.to] = candidate;
            previousVertex[edge.to] = u;
            previousEdge[edge.to] = edgeIndex;
            heap.push({ vertex: edge.to, distance: candidate });
          }
        }
      }

      if (!Number.isFinite(distance[sink])) break;
      for (let v = 0; v < n; v += 1) {
        if (Number.isFinite(distance[v])) potential[v] += distance[v];
      }

      let amount = maxFlow === Infinity ? Infinity : maxFlow - flow;
      for (let v = sink; v !== source; v = previousVertex[v]) {
        const u = previousVertex[v];
        if (u < 0) throw new Error('broken augmenting path');
        amount = Math.min(amount, this.graph[u][previousEdge[v]].capacity);
      }

      let pathCost = 0;
      for (let v = sink; v !== source; v = previousVertex[v]) {
        const u = previousVertex[v];
        const edge = this.graph[u][previousEdge[v]];
        pathCost += edge.cost;
        edge.capacity -= amount;
        this.graph[v][edge.rev].capacity += amount;
      }

      flow += amount;
      cost += amount * pathCost;
      if (!Number.isSafeInteger(flow) || !Number.isSafeInteger(cost)) {
        throw new RangeError('flow or total cost exceeded safe integer precision');
      }
    }

    return { flow, cost };
  }

  _initialPotentials(source) {
    const n = this.vertexCount;
    const distance = new Array(n).fill(Infinity);
    distance[source] = 0;

    for (let pass = 0; pass < n - 1; pass += 1) {
      let changed = false;
      for (let u = 0; u < n; u += 1) {
        if (!Number.isFinite(distance[u])) continue;
        for (const edge of this.graph[u]) {
          if (edge.capacity <= 0) continue;
          const candidate = distance[u] + edge.cost;
          if (candidate < distance[edge.to]) {
            distance[edge.to] = candidate;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }

    for (let u = 0; u < n; u += 1) {
      if (!Number.isFinite(distance[u])) continue;
      for (const edge of this.graph[u]) {
        if (edge.capacity > 0 && distance[u] + edge.cost < distance[edge.to]) {
          throw new Error('reachable negative-cost cycle detected');
        }
      }
    }

    return distance.map(value => (Number.isFinite(value) ? value : 0));
  }

  _assertVertex(vertex) {
    if (!Number.isInteger(vertex) || vertex < 0 || vertex >= this.vertexCount) {
      throw new RangeError('vertex is outside the graph');
    }
  }
}

function runTests() {
  const assert = require('node:assert/strict');

  const network = new MinCostMaxFlow(4);
  const sourceA = network.addEdge(0, 1, 2, 1);
  const sourceB = network.addEdge(0, 2, 1, 0);
  const transfer = network.addEdge(1, 2, 1, -2);
  const direct = network.addEdge(1, 3, 1, 3);
  const finish = network.addEdge(2, 3, 2, 1);

  assert.deepEqual(network.solve(0, 3), { flow: 3, cost: 5 });
  assert.equal(network.getFlow(sourceA), 2);
  assert.equal(network.getFlow(sourceB), 1);
  assert.equal(network.getFlow(transfer), 1);
  assert.equal(network.getFlow(direct), 1);
  assert.equal(network.getFlow(finish), 2);

  const limited = new MinCostMaxFlow(4);
  limited.addEdge(0, 1, 2, 1);
  limited.addEdge(0, 2, 1, 0);
  limited.addEdge(1, 2, 1, -2);
  limited.addEdge(1, 3, 1, 3);
  limited.addEdge(2, 3, 2, 1);
  assert.deepEqual(limited.solve(0, 3, { maxFlow: 2 }), { flow: 2, cost: 1 });

  const disconnected = new MinCostMaxFlow(3);
  disconnected.addEdge(0, 1, 4, 7);
  assert.deepEqual(disconnected.solve(0, 2), { flow: 0, cost: 0 });

  const negativeCycle = new MinCostMaxFlow(3);
  negativeCycle.addEdge(0, 1, 1, -2);
  negativeCycle.addEdge(1, 0, 1, -2);
  negativeCycle.addEdge(1, 2, 1, 0);
  assert.throws(() => negativeCycle.solve(0, 2), /negative-cost cycle/);

  assert.throws(() => new MinCostMaxFlow(0), /vertexCount/);
  assert.throws(() => network.addEdge(0, 1, -1, 0), /capacity/);
  assert.throws(() => network.solve(0, 0), /differ/);
  console.log('min-cost-max-flow: all tests passed');
}

if (require.main === module) runTests();

module.exports = { MinCostMaxFlow };
