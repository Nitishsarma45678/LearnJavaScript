/**
 * Dinic Maximum Flow and Minimum Cut
 * ----------------------------------
 * Implement a directed capacitated network using residual edges, BFS levels,
 * and blocking-flow DFS. Capacities are non-negative safe integers.
 *
 * Run: node dinic-max-flow.js
 */

"use strict";

class Dinic {
  constructor(vertexCount) {
    if (!Number.isInteger(vertexCount) || vertexCount < 2) {
      throw new RangeError("A flow network needs at least two vertices");
    }
    this.vertexCount = vertexCount;
    this.graph = Array.from({ length: vertexCount }, () => []);
    this.level = new Array(vertexCount).fill(-1);
    this.current = new Array(vertexCount).fill(0);
    this.totalCapacity = 0;
  }

  assertVertex(vertex) {
    if (!Number.isInteger(vertex) || vertex < 0 || vertex >= this.vertexCount) {
      throw new RangeError("Invalid vertex: " + vertex);
    }
  }

  addEdge(from, to, capacity) {
    this.assertVertex(from);
    this.assertVertex(to);
    if (!Number.isSafeInteger(capacity) || capacity < 0) {
      throw new RangeError("Capacity must be a non-negative safe integer");
    }
    if (this.totalCapacity > Number.MAX_SAFE_INTEGER - capacity) {
      throw new RangeError("Total capacity exceeds the safe integer range");
    }
    this.totalCapacity += capacity;

    const forwardIndex = this.graph[from].length;
    const reverseIndex = this.graph[to].length;
    const forward = {
      to,
      rev: reverseIndex + (from === to ? 1 : 0),
      capacity,
      residual: capacity,
      original: capacity
    };
    const reverse = {
      to: from,
      rev: forwardIndex,
      capacity: 0,
      residual: 0,
      original: 0
    };
    this.graph[from].push(forward);
    this.graph[to].push(reverse);
    return { from, index: forwardIndex };
  }

  buildLevels(source, sink) {
    this.level.fill(-1);
    const queue = new Array(this.vertexCount);
    let head = 0;
    let tail = 0;
    queue[tail++] = source;
    this.level[source] = 0;

    while (head < tail) {
      const vertex = queue[head++];
      for (const edge of this.graph[vertex]) {
        if (edge.residual > 0 && this.level[edge.to] === -1) {
          this.level[edge.to] = this.level[vertex] + 1;
          queue[tail++] = edge.to;
        }
      }
    }
    return this.level[sink] !== -1;
  }

  send(vertex, sink, pushed) {
    if (pushed === 0) return 0;
    if (vertex === sink) return pushed;

    for (; this.current[vertex] < this.graph[vertex].length; this.current[vertex]++) {
      const edge = this.graph[vertex][this.current[vertex]];
      if (edge.residual === 0 || this.level[edge.to] !== this.level[vertex] + 1) continue;

      const flow = this.send(edge.to, sink, Math.min(pushed, edge.residual));
      if (flow === 0) continue;

      edge.residual -= flow;
      const reverse = this.graph[edge.to][edge.rev];
      reverse.residual += flow;
      return flow;
    }
    return 0;
  }

  maxFlow(source, sink, limit = Number.MAX_SAFE_INTEGER) {
    this.assertVertex(source);
    this.assertVertex(sink);
    if (source === sink) throw new RangeError("Source and sink must differ");
    if (!Number.isSafeInteger(limit) || limit < 0) {
      throw new RangeError("Flow limit must be a non-negative safe integer");
    }

    let total = 0;
    while (total < limit && this.buildLevels(source, sink)) {
      this.current.fill(0);
      while (total < limit) {
        const pushed = this.send(source, sink, limit - total);
        if (pushed === 0) break;
        total += pushed;
      }
    }
    return total;
  }

  getEdge(handle) {
    if (!handle || !Number.isInteger(handle.from) || !Number.isInteger(handle.index)) {
      throw new TypeError("Invalid edge handle");
    }
    const edge = this.graph[handle.from]?.[handle.index];
    if (!edge || edge.original === undefined) throw new RangeError("Unknown edge handle");
    return {
      from: handle.from,
      to: edge.to,
      capacity: edge.original,
      flow: edge.original - edge.residual
    };
  }

  minCut(source) {
    this.assertVertex(source);
    const reachable = new Array(this.vertexCount).fill(false);
    const queue = [source];
    reachable[source] = true;
    for (let head = 0; head < queue.length; head++) {
      const vertex = queue[head];
      for (const edge of this.graph[vertex]) {
        if (edge.residual > 0 && !reachable[edge.to]) {
          reachable[edge.to] = true;
          queue.push(edge.to);
        }
      }
    }
    return reachable;
  }
}

function bruteMinCut(vertexCount, edges, source, sink) {
  let best = Number.MAX_SAFE_INTEGER;
  const middle = [];
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    if (vertex !== source && vertex !== sink) middle.push(vertex);
  }
  for (let mask = 0; mask < (1 << middle.length); mask++) {
    const side = new Set([source]);
    middle.forEach((vertex, index) => {
      if (mask & (1 << index)) side.add(vertex);
    });
    let cut = 0;
    for (const edge of edges) {
      if (side.has(edge.from) && !side.has(edge.to)) cut += edge.capacity;
    }
    best = Math.min(best, cut);
  }
  return best;
}

function runTests() {
  let checks = 0;
  function equal(actual, expected, label) {
    checks++;
    if (!Object.is(actual, expected)) {
      throw new Error(label + ": expected " + expected + ", received " + actual);
    }
  }
  function truthy(value, label) {
    checks++;
    if (!value) throw new Error(label);
  }
  function throws(fn, ErrorType, label) {
    checks++;
    let error;
    try { fn(); } catch (caught) { error = caught; }
    if (!(error instanceof ErrorType)) throw new Error(label + ": expected " + ErrorType.name);
  }

  const network = new Dinic(6);
  const handles = [
    network.addEdge(0, 1, 16),
    network.addEdge(0, 2, 13),
    network.addEdge(1, 2, 10),
    network.addEdge(2, 1, 4),
    network.addEdge(1, 3, 12),
    network.addEdge(3, 2, 9),
    network.addEdge(2, 4, 14),
    network.addEdge(4, 3, 7),
    network.addEdge(3, 5, 20),
    network.addEdge(4, 5, 4)
  ];
  equal(network.maxFlow(0, 5), 23, "classic maximum-flow network");
  equal(network.maxFlow(0, 5), 0, "residual network has no additional flow");
  const side = network.minCut(0);
  truthy(side[0] && !side[5], "minimum-cut partition separates source and sink");
  const cutCapacity = [
    [0, 1, 16], [0, 2, 13], [1, 2, 10], [2, 1, 4], [1, 3, 12],
    [3, 2, 9], [2, 4, 14], [4, 3, 7], [3, 5, 20], [4, 5, 4]
  ].reduce((sum, edge) => sum + (side[edge[0]] && !side[edge[1]] ? edge[2] : 0), 0);
  equal(cutCapacity, 23, "max-flow min-cut equality");
  equal(network.getEdge(handles[0]).flow, 12, "edge flow extraction");

  const selfLoop = new Dinic(2);
  selfLoop.addEdge(0, 0, 99);
  selfLoop.addEdge(0, 1, 3);
  equal(selfLoop.maxFlow(0, 1), 3, "self-loop does not corrupt residual indexes");

  const limited = new Dinic(2);
  const limitedEdge = limited.addEdge(0, 1, 10);
  equal(limited.maxFlow(0, 1, 4), 4, "flow limit");
  equal(limited.getEdge(limitedEdge).flow, 4, "partial edge flow");
  equal(limited.maxFlow(0, 1), 6, "resume from residual graph");

  const rng = (() => {
    let state = 0x5eed1234;
    return max => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state % max;
    };
  })();

  for (let trial = 0; trial < 120; trial++) {
    const n = 2 + rng(6);
    const edges = [];
    const candidate = new Dinic(n);
    const count = rng(n * n + 1);
    for (let i = 0; i < count; i++) {
      const edge = { from: rng(n), to: rng(n), capacity: rng(10) };
      edges.push(edge);
      candidate.addEdge(edge.from, edge.to, edge.capacity);
    }
    const actual = candidate.maxFlow(0, n - 1);
    equal(actual, bruteMinCut(n, edges, 0, n - 1), "randomized max-flow/min-cut trial " + trial);
  }

  throws(() => new Dinic(1), RangeError, "minimum vertex count");
  throws(() => new Dinic(2).addEdge(0, 1, -1), RangeError, "negative capacity");
  throws(() => new Dinic(2).maxFlow(0, 0), RangeError, "identical source and sink");
  return { passed: checks, randomizedTrials: 120 };
}

if (typeof require !== "undefined" && require.main === module) {
  const result = runTests();
  console.log("Dinic maximum flow: " + result.passed + " checks passed");
}

module.exports = { Dinic, bruteMinCut, runTests };
