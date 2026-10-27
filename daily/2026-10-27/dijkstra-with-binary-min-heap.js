// Dijkstra's shortest-path algorithm with a binary min-heap.
// Graph format: { A: [{ to: "B", weight: 4 }], B: [...] }.
// Distances are non-negative; missing destination keys are treated as leaf nodes.

"use strict";
const assert = require("node:assert/strict");

class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (a[p].priority <= item.priority) break;
      a[i] = a[p];
      i = p;
    }
    a[i] = item;
  }
  pop() {
    const a = this.items;
    if (!a.length) return undefined;
    const root = a[0];
    const last = a.pop();
    if (a.length) {
      let i = 0;
      while (true) {
        const left = i * 2 + 1, right = left + 1;
        if (left >= a.length) break;
        let child = left;
        if (right < a.length && a[right].priority < a[left].priority) child = right;
        if (a[child].priority >= last.priority) break;
        a[i] = a[child];
        i = child;
      }
      a[i] = last;
    }
    return root;
  }
}

function dijkstra(graph, source) {
  if (!graph || typeof graph !== "object" || Array.isArray(graph)) {
    throw new TypeError("graph must be an adjacency-list object");
  }
  const adjacency = new Map();
  for (const [from, edges] of Object.entries(graph)) {
    if (!Array.isArray(edges)) throw new TypeError("each adjacency list must be an array");
    adjacency.set(from, edges.map((edge) => {
      if (!edge || typeof edge.to !== "string" || !Number.isFinite(edge.weight) || edge.weight < 0) {
        throw new TypeError("each edge needs a string destination and a finite non-negative weight");
      }
      return { to: edge.to, weight: edge.weight };
    }));
    for (const edge of edges) if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
  }
  if (!adjacency.has(source)) throw new Error("source node does not exist");

  const distances = new Map([...adjacency.keys()].map((node) => [node, Infinity]));
  const previous = new Map();
  const heap = new MinHeap();
  distances.set(source, 0);
  heap.push({ node: source, priority: 0 });

  while (heap.size) {
    const { node, priority } = heap.pop();
    if (priority !== distances.get(node)) continue; // Ignore stale heap entries.
    for (const edge of adjacency.get(node)) {
      const candidate = priority + edge.weight;
      if (candidate < distances.get(edge.to)) {
        distances.set(edge.to, candidate);
        previous.set(edge.to, node);
        heap.push({ node: edge.to, priority: candidate });
      }
    }
  }

  function pathTo(target) {
    if (!distances.has(target) || distances.get(target) === Infinity) return null;
    const path = [];
    for (let node = target; node !== undefined; node = previous.get(node)) {
      path.push(node);
      if (node === source) break;
    }
    if (path[path.length - 1] !== source) return null;
    return path.reverse();
  }
  return { distances, previous, pathTo };
}

// Example tests
const graph = {
  A: [{ to: "B", weight: 7 }, { to: "C", weight: 2 }],
  B: [{ to: "D", weight: 1 }],
  C: [{ to: "B", weight: 2 }, { to: "D", weight: 8 }],
  D: [{ to: "E", weight: 3 }],
  E: [],
  Z: []
};
const result = dijkstra(graph, "A");
assert.equal(result.distances.get("D"), 5);
assert.deepEqual(result.pathTo("E"), ["A", "C", "B", "D", "E"]);
assert.equal(result.distances.get("Z"), Infinity);
assert.equal(result.pathTo("Z"), null);
assert.throws(() => dijkstra({ A: [{ to: "B", weight: -1 }] }, "A"), /non-negative/);
assert.throws(() => dijkstra({ A: [] }, "missing"), /source node/);
console.log("Dijkstra tests passed");
