'use strict';

/*
 * Exercise: Implement Dinic's maximum-flow algorithm and produce a minimum-cut
 * certificate. The residual graph supports parallel directed edges. Self-loops
 * are rejected to keep reverse-edge indexing unambiguous.
 *
 * Complexity: O(V^2 E) in general; O(E sqrt(V)) for unit-capacity networks.
 */

const assert = require('node:assert/strict');

class Dinic {
  constructor(vertexCount) {
    if (!Number.isInteger(vertexCount) || vertexCount < 2) {
      throw new RangeError('vertexCount must be an integer >= 2');
    }
    this.n = vertexCount;
    this.graph = Array.from({ length: vertexCount }, () => []);
    this.originalEdges = [];
    this.level = new Int32Array(vertexCount);
    this.nextEdge = new Int32Array(vertexCount);
  }

  _vertex(v) {
    if (!Number.isInteger(v) || v < 0 || v >= this.n) {
      throw new RangeError('vertex out of range: ' + v);
    }
  }

  addEdge(from, to, capacity) {
    this._vertex(from);
    this._vertex(to);
    if (from === to) throw new RangeError('self-loops are not supported');
    if (typeof capacity !== 'number' || !Number.isFinite(capacity) || capacity < 0) {
      throw new RangeError('capacity must be a finite non-negative number');
    }

    const forwardIndex = this.graph[from].length;
    const reverseIndex = this.graph[to].length;
    const forward = { to, rev: reverseIndex, cap: capacity };
    const reverse = { to: from, rev: forwardIndex, cap: 0 };
    this.graph[from].push(forward);
    this.graph[to].push(reverse);
    this.originalEdges.push({ from, to, capacity, edge: forward });
    return this.originalEdges.length - 1;
  }

  _buildLevels(source, sink) {
    this.level.fill(-1);
    const queue = new Int32Array(this.n);
    let head = 0;
    let tail = 0;
    queue[tail++] = source;
    this.level[source] = 0;

    while (head < tail) {
      const vertex = queue[head++];
      for (const edge of this.graph[vertex]) {
        if (edge.cap > 0 && this.level[edge.to] === -1) {
          this.level[edge.to] = this.level[vertex] + 1;
          queue[tail++] = edge.to;
        }
      }
    }
    return this.level[sink] !== -1;
  }

  _send(vertex, sink, available) {
    if (vertex === sink) return available;
    const edges = this.graph[vertex];

    for (; this.nextEdge[vertex] < edges.length; this.nextEdge[vertex]++) {
      const edge = edges[this.nextEdge[vertex]];
      if (edge.cap <= 0 || this.level[edge.to] !== this.level[vertex] + 1) continue;

      const pushed = this._send(edge.to, sink, Math.min(available, edge.cap));
      if (pushed > 0) {
        edge.cap -= pushed;
        this.graph[edge.to][edge.rev].cap += pushed;
        return pushed;
      }
    }
    return 0;
  }

  maxFlow(source, sink, limit = Infinity) {
    this._vertex(source);
    this._vertex(sink);
    if (source === sink) throw new RangeError('source and sink must differ');
    if (!(limit === Infinity || (Number.isFinite(limit) && limit >= 0))) {
      throw new RangeError('limit must be non-negative or Infinity');
    }

    let total = 0;
    while (total < limit && this._buildLevels(source, sink)) {
      this.nextEdge.fill(0);
      while (total < limit) {
        const pushed = this._send(source, sink, limit - total);
        if (pushed === 0) break;
        total += pushed;
      }
    }
    return total;
  }

  minCut(source) {
    this._vertex(source);
    const reachable = new Uint8Array(this.n);
    const queue = [source];
    reachable[source] = 1;

    for (let head = 0; head < queue.length; head++) {
      const vertex = queue[head];
      for (const edge of this.graph[vertex]) {
        if (edge.cap > 0 && !reachable[edge.to]) {
          reachable[edge.to] = 1;
          queue.push(edge.to);
        }
      }
    }

    const sourceSide = [];
    const sinkSide = [];
    for (let v = 0; v < this.n; v++) {
      (reachable[v] ? sourceSide : sinkSide).push(v);
    }

    const crossingEdges = this.originalEdges
      .filter(item => reachable[item.from] && !reachable[item.to])
      .map(item => ({
        from: item.from,
        to: item.to,
        capacity: item.capacity
      }));

    return {
      sourceSide,
      sinkSide,
      crossingEdges,
      capacity: crossingEdges.reduce((sum, edge) => sum + edge.capacity, 0)
    };
  }

  reset() {
    for (const item of this.originalEdges) {
      item.edge.cap = item.capacity;
      this.graph[item.to][item.edge.rev].cap = 0;
    }
  }
}

function runTests() {
  const network = new Dinic(6);
  [
    [0, 1, 16], [0, 2, 13], [1, 2, 10], [2, 1, 4],
    [1, 3, 12], [3, 2, 9], [2, 4, 14], [4, 3, 7],
    [3, 5, 20], [4, 5, 4]
  ].forEach(edge => network.addEdge(...edge));

  assert.equal(network.maxFlow(0, 5), 23);
  const cut = network.minCut(0);
  assert.equal(cut.capacity, 23);
  assert.ok(cut.sourceSide.includes(0));
  assert.ok(cut.sinkSide.includes(5));

  network.reset();
  assert.equal(network.maxFlow(0, 5, 7), 7);
  assert.equal(network.maxFlow(0, 5), 16);

  const parallel = new Dinic(3);
  parallel.addEdge(0, 1, 2);
  parallel.addEdge(0, 1, 3);
  parallel.addEdge(1, 2, 4);
  parallel.addEdge(0, 2, 1);
  assert.equal(parallel.maxFlow(0, 2), 5);
  assert.equal(parallel.minCut(0).capacity, 5);

  const zero = new Dinic(2);
  zero.addEdge(0, 1, 0);
  assert.equal(zero.maxFlow(0, 1), 0);
  assert.equal(zero.minCut(0).capacity, 0);

  // Compare 80 small random networks with exhaustive s-t cut enumeration.
  let seed = 0x12345678;
  const random = max => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) % max;
  };
  for (let trial = 0; trial < 80; trial++) {
    const n = 2 + random(6);
    const edges = [];
    const graph = new Dinic(n);
    for (let u = 0; u < n; u++) {
      for (let v = 0; v < n; v++) {
        if (u !== v && random(4) === 0) {
          const capacity = random(8);
          edges.push([u, v, capacity]);
          graph.addEdge(u, v, capacity);
        }
      }
    }
    let best = Infinity;
    for (let mask = 1; mask < (1 << (n - 1)); mask++) {
      if ((mask & 1) === 0) continue;
      let capacity = 0;
      for (const [u, v, c] of edges) {
        const inSource = (mask & (1 << u)) !== 0;
        const inSink = (mask & (1 << v)) !== 0;
        if (inSource && !inSink) capacity += c;
      }
      best = Math.min(best, capacity);
    }
    assert.equal(graph.maxFlow(0, n - 1), best);
    assert.equal(graph.minCut(0).capacity, best);
  }

  assert.throws(() => new Dinic(1), RangeError);
  assert.throws(() => network.addEdge(0, 0, 1), RangeError);
  assert.throws(() => network.addEdge(0, 1, -1), RangeError);
  console.log('DinicMaxFlow: all tests passed');
}

if (require.main === module) runTests();

module.exports = { Dinic };
