const assert = require('node:assert/strict');

class MinCostFlow {
  constructor(vertexCount) {
    if (!Number.isInteger(vertexCount) || vertexCount < 2) throw new RangeError('vertexCount must be at least 2');
    this.graph = Array.from({ length: vertexCount }, () => []);
  }

  addEdge(from, to, capacity, cost) {
    const n = this.graph.length;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= n || to >= n || from === to) {
      throw new RangeError('invalid edge endpoints');
    }
    if (!Number.isSafeInteger(capacity) || capacity < 0) throw new RangeError('capacity must be a non-negative safe integer');
    if (!Number.isFinite(cost) || cost < 0) throw new RangeError('forward cost must be finite and non-negative');
    const forward = { to, rev: this.graph[to].length, capacity, cost };
    const reverse = { to: from, rev: this.graph[from].length, capacity: 0, cost: -cost };
    this.graph[from].push(forward);
    this.graph[to].push(reverse);
  }

  run(source, sink, flowLimit = Number.MAX_SAFE_INTEGER) {
    const n = this.graph.length;
    if (!Number.isInteger(source) || !Number.isInteger(sink) || source < 0 || sink < 0 || source >= n || sink >= n || source === sink) {
      throw new RangeError('invalid source or sink');
    }
    if (!Number.isSafeInteger(flowLimit) || flowLimit < 0) throw new RangeError('flowLimit must be a non-negative safe integer');

    let flow = 0;
    let cost = 0;
    while (flow < flowLimit) {
      const distance = Array(n).fill(Infinity);
      const parentVertex = Array(n).fill(-1);
      const parentEdge = Array(n).fill(-1);
      const inQueue = Array(n).fill(false);
      const queue = [source];
      let head = 0;
      distance[source] = 0;
      inQueue[source] = true;

      // SPFA handles negative reverse-edge costs created by earlier augmentations.
      while (head < queue.length) {
        const u = queue[head++];
        inQueue[u] = false;
        for (let i = 0; i < this.graph[u].length; i++) {
          const edge = this.graph[u][i];
          if (edge.capacity <= 0 || distance[u] + edge.cost >= distance[edge.to]) continue;
          distance[edge.to] = distance[u] + edge.cost;
          parentVertex[edge.to] = u;
          parentEdge[edge.to] = i;
          if (!inQueue[edge.to]) {
            queue.push(edge.to);
            inQueue[edge.to] = true;
          }
        }
      }

      if (!Number.isFinite(distance[sink])) break;
      let amount = flowLimit - flow;
      for (let v = sink; v !== source; v = parentVertex[v]) {
        if (parentVertex[v] === -1) throw new Error('broken augmenting path');
        amount = Math.min(amount, this.graph[parentVertex[v]][parentEdge[v]].capacity);
      }
      for (let v = sink; v !== source; v = parentVertex[v]) {
        const edge = this.graph[parentVertex[v]][parentEdge[v]];
        edge.capacity -= amount;
        this.graph[v][edge.rev].capacity += amount;
      }
      flow += amount;
      cost += amount * distance[sink];
    }
    return { flow, cost };
  }
}

const network = new MinCostFlow(4);
network.addEdge(0, 1, 2, 1);
network.addEdge(0, 2, 1, 0);
network.addEdge(1, 2, 1, 1);
network.addEdge(1, 3, 1, 3);
network.addEdge(2, 3, 2, 1);
assert.deepEqual(network.run(0, 3, 2), { flow: 2, cost: 4 });

const limited = new MinCostFlow(3);
limited.addEdge(0, 1, 5, 4);
limited.addEdge(1, 2, 5, 2);
assert.deepEqual(limited.run(0, 2, 3), { flow: 3, cost: 18 });
assert.deepEqual(limited.run(0, 2, 5), { flow: 2, cost: 12 });
assert.throws(() => limited.addEdge(0, 1, -1, 2), RangeError);
console.log('Min-cost max-flow tests passed');
