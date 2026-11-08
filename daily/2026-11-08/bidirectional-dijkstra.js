"use strict";

// Bidirectional Dijkstra for non-negative weighted graphs.
// Searches forward from source and backward from target, stopping when the
// smallest unsettled distance bounds cannot improve the best joined path.

const assert = require("node:assert/strict");

class MinHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  peek() {
    return this.items[0];
  }

  push(item) {
    const items = this.items;
    items.push(item);
    let index = items.length - 1;

    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (items[parent].distance <= item.distance) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = item;
  }

  pop() {
    const items = this.items;
    if (items.length === 0) return undefined;

    const minimum = items[0];
    const last = items.pop();
    if (items.length === 0) return minimum;

    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= items.length) break;
      let child = left;
      if (right < items.length && items[right].distance < items[left].distance) {
        child = right;
      }
      if (items[child].distance >= last.distance) break;
      items[index] = items[child];
      index = child;
    }
    items[index] = last;
    return minimum;
  }
}

function bidirectionalDijkstra(vertexCount, edges, source, target, options = {}) {
  if (!Number.isInteger(vertexCount) || vertexCount <= 0) {
    throw new RangeError("vertexCount must be a positive integer");
  }
  for (const vertex of [source, target]) {
    if (!Number.isInteger(vertex) || vertex < 0 || vertex >= vertexCount) {
      throw new RangeError("source and target must be valid vertices");
    }
  }
  if (!Array.isArray(edges)) throw new TypeError("edges must be an array");

  const directed = options.directed ?? true;
  const forward = Array.from({ length: vertexCount }, () => []);
  const reverse = Array.from({ length: vertexCount }, () => []);

  function addArc(from, to, weight) {
    forward[from].push({ to, weight });
    reverse[to].push({ to: from, weight });
  }

  for (const edge of edges) {
    const { from, to, weight } = edge;
    if (!Number.isInteger(from) || from < 0 || from >= vertexCount ||
        !Number.isInteger(to) || to < 0 || to >= vertexCount) {
      throw new RangeError("edge endpoint is outside the graph");
    }
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0) {
      throw new RangeError("Dijkstra requires finite non-negative edge weights");
    }
    addArc(from, to, weight);
    if (!directed) addArc(to, from, weight);
  }

  if (source === target) return { distance: 0, path: [source] };

  const distForward = new Array(vertexCount).fill(Infinity);
  const distBackward = new Array(vertexCount).fill(Infinity);
  const previous = new Array(vertexCount).fill(-1);
  const next = new Array(vertexCount).fill(-1);
  const heapForward = new MinHeap();
  const heapBackward = new MinHeap();

  distForward[source] = 0;
  distBackward[target] = 0;
  heapForward.push({ node: source, distance: 0 });
  heapBackward.push({ node: target, distance: 0 });

  let bestDistance = Infinity;
  let meetingVertex = -1;

  function clean(heap, distances) {
    while (heap.size && heap.peek().distance !== distances[heap.peek().node]) {
      heap.pop();
    }
  }

  function consider(vertex) {
    const candidate = distForward[vertex] + distBackward[vertex];
    if (candidate < bestDistance) {
      bestDistance = candidate;
      meetingVertex = vertex;
    }
  }

  while (heapForward.size || heapBackward.size) {
    clean(heapForward, distForward);
    clean(heapBackward, distBackward);

    const minimumForward = heapForward.peek()?.distance ?? Infinity;
    const minimumBackward = heapBackward.peek()?.distance ?? Infinity;

    if (bestDistance < Infinity &&
        minimumForward + minimumBackward >= bestDistance) break;
    if (minimumForward === Infinity && minimumBackward === Infinity) break;

    if (minimumForward <= minimumBackward) {
      const current = heapForward.pop();
      const { node, distance } = current;
      if (distance !== distForward[node]) continue;
      consider(node);

      for (const edge of forward[node]) {
        const candidate = distance + edge.weight;
        if (candidate < distForward[edge.to]) {
          distForward[edge.to] = candidate;
          previous[edge.to] = node;
          heapForward.push({ node: edge.to, distance: candidate });
          consider(edge.to);
        }
      }
    } else {
      const current = heapBackward.pop();
      const { node, distance } = current;
      if (distance !== distBackward[node]) continue;
      consider(node);

      // reverse[node] contains original incoming arcs predecessor -> node.
      for (const edge of reverse[node]) {
        const predecessor = edge.to;
        const candidate = distance + edge.weight;
        if (candidate < distBackward[predecessor]) {
          distBackward[predecessor] = candidate;
          next[predecessor] = node;
          heapBackward.push({ node: predecessor, distance: candidate });
          consider(predecessor);
        }
      }
    }
  }

  if (meetingVertex === -1) return null;

  const left = [];
  for (let vertex = meetingVertex; vertex !== -1; vertex = previous[vertex]) {
    left.push(vertex);
    if (vertex === source) break;
  }
  if (left[left.length - 1] !== source) {
    throw new Error("internal error: forward predecessor chain is incomplete");
  }
  left.reverse();

  const path = left.slice();
  for (let vertex = meetingVertex; vertex !== target;) {
    vertex = next[vertex];
    if (vertex === -1) throw new Error("internal error: backward successor chain is incomplete");
    path.push(vertex);
  }

  return { distance: bestDistance, path };
}

// ------------------------------- Tests ---------------------------------

function referenceDijkstra(vertexCount, edges, source, target, directed = true) {
  const graph = Array.from({ length: vertexCount }, () => []);
  for (const { from, to, weight } of edges) {
    graph[from].push([to, weight]);
    if (!directed) graph[to].push([from, weight]);
  }
  const distance = new Array(vertexCount).fill(Infinity);
  const used = new Array(vertexCount).fill(false);
  distance[source] = 0;

  for (let step = 0; step < vertexCount; step++) {
    let node = -1;
    for (let i = 0; i < vertexCount; i++) {
      if (!used[i] && (node === -1 || distance[i] < distance[node])) node = i;
    }
    if (node === -1 || distance[node] === Infinity) break;
    used[node] = true;
    for (const [to, weight] of graph[node]) {
      distance[to] = Math.min(distance[to], distance[node] + weight);
    }
  }
  return distance[target];
}

function runTests() {
  const graph = [
    { from: 0, to: 1, weight: 4 },
    { from: 0, to: 2, weight: 1 },
    { from: 2, to: 1, weight: 2 },
    { from: 1, to: 3, weight: 1 },
    { from: 2, to: 3, weight: 7 },
    { from: 3, to: 4, weight: 3 }
  ];
  assert.deepEqual(bidirectionalDijkstra(5, graph, 0, 4), {
    distance: 7, path: [0, 2, 1, 3, 4]
  });
  assert.deepEqual(bidirectionalDijkstra(3, [], 1, 1), { distance: 0, path: [1] });
  assert.equal(bidirectionalDijkstra(3, [{ from: 0, to: 1, weight: 1 }], 0, 2), null);
  assert.equal(
    bidirectionalDijkstra(3, [{ from: 0, to: 1, weight: 2 }, { from: 2, to: 1, weight: 1 }],
      0, 2, { directed: false }).distance,
    3
  );
  assert.throws(() => bidirectionalDijkstra(2, [{ from: 0, to: 1, weight: -1 }], 0, 1), RangeError);

  let seed = 0x51a7;
  const random = max => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed % max;
  };

  for (let trial = 0; trial < 350; trial++) {
    const count = 2 + random(8);
    const edges = [];
    for (let from = 0; from < count; from++) {
      for (let to = 0; to < count; to++) {
        if (from !== to && random(5) === 0) {
          edges.push({ from, to, weight: random(20) });
        }
      }
    }
    const source = random(count);
    const target = random(count);
    const expected = referenceDijkstra(count, edges, source, target);
    const actual = bidirectionalDijkstra(count, edges, source, target);
    assert.equal(actual?.distance ?? Infinity, expected, "random graph distance mismatch");

    if (actual) {
      let total = 0;
      for (let i = 1; i < actual.path.length; i++) {
        const edge = edges.find(item => item.from === actual.path[i - 1] &&
          item.to === actual.path[i]);
        assert(edge, "returned path must use real directed edges");
        total += edge.weight;
      }
      assert.equal(total, actual.distance);
    }
  }

  console.log("Bidirectional Dijkstra: all tests passed.");
}

if (require.main === module) runTests();

module.exports = { bidirectionalDijkstra };
