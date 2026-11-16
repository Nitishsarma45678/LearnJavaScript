'use strict';

/**
 * EXERCISE: Implement Yen's algorithm for the K shortest loopless paths in a
 * directed weighted multigraph with non-negative edge weights.
 *
 * Requirements:
 * - Use Dijkstra as the spur-path oracle, backed by a binary min-heap.
 * - Treat parallel edges as distinct paths (each edge has a stable ID).
 * - A returned path may not repeat a vertex.
 * - Exclude root-prefix edges and root-prefix vertices while generating spurs.
 * - Keep candidate paths across iterations and return them in nondecreasing cost.
 *
 * Run: node yen-k-shortest-paths.js
 */

class MinHeap {
  constructor(compare = (a, b) => a.priority - b.priority || a.order - b.order) {
    this.items = [];
    this.compare = compare;
  }
  get size() { return this.items.length; }
  push(value) {
    const a = this.items;
    a.push(value);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.compare(a[p], value) <= 0) break;
      a[i] = a[p]; i = p;
    }
    a[i] = value;
  }
  pop() {
    if (!this.items.length) return undefined;
    const a = this.items;
    const first = a[0];
    const last = a.pop();
    if (a.length) {
      let i = 0;
      while (true) {
        let child = i * 2 + 1;
        if (child >= a.length) break;
        if (child + 1 < a.length && this.compare(a[child + 1], a[child]) < 0) child++;
        if (this.compare(last, a[child]) <= 0) break;
        a[i] = a[child]; i = child;
      }
      a[i] = last;
    }
    return first;
  }
}

class WeightedDirectedGraph {
  constructor() {
    this.adjacency = new Map();
    this.nextEdgeId = 1;
  }
  addEdge(from, to, weight) {
    if (!Number.isFinite(weight) || weight < 0) {
      throw new RangeError('Dijkstra requires a finite non-negative edge weight');
    }
    if (!this.adjacency.has(from)) this.adjacency.set(from, []);
    if (!this.adjacency.has(to)) this.adjacency.set(to, []);
    const edge = { id: this.nextEdgeId++, from, to, weight };
    this.adjacency.get(from).push(edge);
    return edge.id;
  }
  edgesFrom(vertex) { return this.adjacency.get(vertex) || []; }
}

function dijkstra(graph, start, goal, bannedVertices = new Set(), bannedEdges = new Set()) {
  if (bannedVertices.has(start) || bannedVertices.has(goal)) return null;
  const distances = new Map([[start, 0]]);
  const previous = new Map();
  const heap = new MinHeap();
  let order = 0;
  heap.push({ vertex: start, priority: 0, order: order++ });

  while (heap.size) {
    const current = heap.pop();
    if (current.priority !== distances.get(current.vertex)) continue;
    if (Object.is(current.vertex, goal) || current.vertex === goal) break;
    for (const edge of graph.edgesFrom(current.vertex)) {
      if (bannedEdges.has(edge.id) || bannedVertices.has(edge.to)) continue;
      const nextDistance = current.priority + edge.weight;
      if (nextDistance < (distances.get(edge.to) ?? Infinity)) {
        distances.set(edge.to, nextDistance);
        previous.set(edge.to, edge);
        heap.push({ vertex: edge.to, priority: nextDistance, order: order++ });
      }
    }
  }

  if (!distances.has(goal)) return null;
  const edges = [];
  let cursor = goal;
  while (cursor !== start) {
    const edge = previous.get(cursor);
    if (!edge) return null;
    edges.push(edge);
    cursor = edge.from;
  }
  edges.reverse();
  return {
    vertices: [start, ...edges.map(edge => edge.to)],
    edges,
    cost: distances.get(goal),
  };
}

function pathSignature(path) {
  return path.edges.map(edge => edge.id).join(',');
}

function kShortestLooplessPaths(graph, start, goal, k) {
  if (!Number.isInteger(k) || k < 0) throw new RangeError('k must be a non-negative integer');
  if (k === 0) return [];
  if (start === goal) return [{ vertices: [start], edges: [], cost: 0 }];

  const first = dijkstra(graph, start, goal);
  if (!first) return [];
  const accepted = [first];
  const acceptedSignatures = new Set([pathSignature(first)]);
  const queuedSignatures = new Set();
  const candidates = new MinHeap((a, b) => a.path.cost - b.path.cost || a.order - b.order);
  let order = 0;

  while (accepted.length < k) {
    const previousPath = accepted[accepted.length - 1];
    for (let spurIndex = 0; spurIndex < previousPath.vertices.length - 1; spurIndex++) {
      const rootVertices = previousPath.vertices.slice(0, spurIndex + 1);
      const rootEdges = previousPath.edges.slice(0, spurIndex);
      const bannedEdges = new Set();
      const bannedVertices = new Set(rootVertices.slice(0, -1));

      for (const path of accepted) {
        const sameRoot = rootEdges.every((edge, index) => path.edges[index]?.id === edge.id);
        if (sameRoot && path.edges.length > spurIndex) {
          bannedEdges.add(path.edges[spurIndex].id);
        }
      }

      const spur = dijkstra(
        graph,
        rootVertices[rootVertices.length - 1],
        goal,
        bannedVertices,
        bannedEdges,
      );
      if (!spur) continue;

      const combined = {
        vertices: [...rootVertices.slice(0, -1), ...spur.vertices],
        edges: [...rootEdges, ...spur.edges],
        cost: rootEdges.reduce((sum, edge) => sum + edge.weight, 0) + spur.cost,
      };
      const signature = pathSignature(combined);
      if (!acceptedSignatures.has(signature) && !queuedSignatures.has(signature)) {
        queuedSignatures.add(signature);
        candidates.push({ path: combined, order: order++ });
      }
    }

    let next;
    while (candidates.size && !next) {
      const candidate = candidates.pop();
      if (!acceptedSignatures.has(pathSignature(candidate.path))) next = candidate.path;
    }
    if (!next) break;
    accepted.push(next);
    acceptedSignatures.add(pathSignature(next));
  }

  return accepted;
}

function runTests() {
  const assert = require('node:assert/strict');
  const graph = new WeightedDirectedGraph();
  graph.addEdge('s', 'a', 1);
  graph.addEdge('s', 'b', 2);
  graph.addEdge('a', 'b', 1);
  graph.addEdge('a', 't', 4);
  graph.addEdge('b', 't', 2);
  graph.addEdge('b', 'a', 1);
  graph.addEdge('s', 't', 8);
  graph.addEdge('a', 'c', 2);
  graph.addEdge('c', 't', 2);

  const paths = kShortestLooplessPaths(graph, 's', 't', 10);
  assert.deepEqual(paths.map(path => path.cost), [4, 4, 5, 5, 7, 7, 8]);
  for (const path of paths) {
    assert.equal(new Set(path.vertices).size, path.vertices.length, 'path must be loopless');
    assert.equal(path.edges.reduce((sum, edge) => sum + edge.weight, 0), path.cost);
  }
  assert.deepEqual(kShortestLooplessPaths(graph, 'missing', 't', 3), []);
  assert.deepEqual(kShortestLooplessPaths(graph, 's', 's', 3)[0].vertices, ['s']);
  assert.deepEqual(kShortestLooplessPaths(graph, 's', 't', 0), []);
  assert.throws(() => graph.addEdge('x', 'y', -1), /non-negative/);
  assert.throws(() => kShortestLooplessPaths(graph, 's', 't', -1), /non-negative/);

  const parallel = new WeightedDirectedGraph();
  parallel.addEdge('x', 'y', 1);
  parallel.addEdge('x', 'y', 1);
  parallel.addEdge('y', 'z', 1);
  assert.equal(kShortestLooplessPaths(parallel, 'x', 'z', 5).length, 2);

  // Differential test: enumerate every simple path in small random graphs.
  let seed = 0x51f15e;
  const random = max => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % max;
  };
  for (let trial = 0; trial < 80; trial++) {
    const sample = new WeightedDirectedGraph();
    const vertexCount = 6;
    for (let from = 0; from < vertexCount; from++) {
      for (let to = 0; to < vertexCount; to++) {
        if (from !== to && random(5) === 0) sample.addEdge(from, to, random(8));
      }
    }
    const exhaustive = [];
    function enumerate(vertex, visited, edges, cost) {
      if (vertex === vertexCount - 1) { exhaustive.push(cost); return; }
      for (const edge of sample.edgesFrom(vertex)) {
        if (!visited.has(edge.to)) {
          visited.add(edge.to);
          enumerate(edge.to, visited, [...edges, edge], cost + edge.weight);
          visited.delete(edge.to);
        }
      }
    }
    enumerate(0, new Set([0]), [], 0);
    exhaustive.sort((a, b) => a - b);
    const actual = kShortestLooplessPaths(sample, 0, vertexCount - 1, 8).map(path => path.cost);
    assert.deepEqual(actual, exhaustive.slice(0, 8));
  }

  console.log('yen-k-shortest-paths: all tests passed (including 80 brute-force graph comparisons)');
}

if (require.main === module) runTests();
module.exports = { WeightedDirectedGraph, dijkstra, kShortestLooplessPaths, runTests };
