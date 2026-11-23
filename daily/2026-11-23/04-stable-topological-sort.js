// Exercise: Implement stable Kahn topological sorting.
// Among currently available nodes, preserve their original input order.
// If a cycle exists, return one closed cycle witness instead of a partial order.
//
// Run: node 04-stable-topological-sort.js
const assert = require("node:assert/strict");

function stableTopologicalSort(nodes, edges) {
  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    throw new TypeError("nodes and edges must be arrays");
  }

  const index = new Map();
  nodes.forEach((node, i) => {
    if (index.has(node)) throw new Error("duplicate node: " + node);
    index.set(node, i);
  });

  const adjacency = new Map(nodes.map((node) => [node, []]));
  const indegree = new Map(nodes.map((node) => [node, 0]));
  for (const edge of edges) {
    if (!Array.isArray(edge) || edge.length !== 2) throw new TypeError("edge must be [from, to]");
    const [from, to] = edge;
    if (!index.has(from) || !index.has(to)) throw new Error("edge references an unknown node");
    adjacency.get(from).push(to);
    indegree.set(to, indegree.get(to) + 1);
  }

  const heap = [];
  function less(a, b) { return index.get(a) < index.get(b); }
  function push(value) {
    heap.push(value);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (!less(heap[i], heap[parent])) break;
      [heap[i], heap[parent]] = [heap[parent], heap[i]];
      i = parent;
    }
  }
  function pop() {
    if (!heap.length) return undefined;
    const first = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      while (true) {
        let child = i * 2 + 1;
        if (child >= heap.length) break;
        if (child + 1 < heap.length && less(heap[child + 1], heap[child])) child += 1;
        if (!less(heap[child], heap[i])) break;
        [heap[i], heap[child]] = [heap[child], heap[i]];
        i = child;
      }
    }
    return first;
  }

  for (const node of nodes) if (indegree.get(node) === 0) push(node);
  const order = [];

  while (heap.length) {
    const node = pop();
    order.push(node);
    for (const next of adjacency.get(node)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) push(next);
    }
  }

  if (order.length === nodes.length) return { order, cycle: null };

  const remaining = new Set(nodes.filter((node) => indegree.get(node) > 0));
  const color = new Map();
  const stack = [];
  let cycle = null;

  function findCycle(node) {
    color.set(node, 1);
    stack.push(node);
    for (const next of adjacency.get(node)) {
      if (!remaining.has(next)) continue;
      if (color.get(next) === 1) {
        const start = stack.indexOf(next);
        cycle = stack.slice(start).concat(next);
        return true;
      }
      if (!color.has(next) && findCycle(next)) return true;
    }
    stack.pop();
    color.set(node, 2);
    return false;
  }

  for (const node of nodes) {
    if (remaining.has(node) && !color.has(node) && findCycle(node)) break;
  }
  return { order: null, cycle };
}

// Example tests
{
  const result = stableTopologicalSort(["a", "b", "c", "d"], [["a", "d"], ["b", "d"]]);
  assert.deepEqual(result, { order: ["a", "b", "c", "d"], cycle: null });

  const cyclic = stableTopologicalSort([1, 2, 3], [[1, 2], [2, 3], [3, 1]]);
  assert.equal(cyclic.order, null);
  assert.equal(cyclic.cycle[0], cyclic.cycle.at(-1));
  assert.equal(new Set(cyclic.cycle.slice(0, -1)).size, 3);

  assert.deepEqual(stableTopologicalSort([], []).order, []);
  assert.throws(() => stableTopologicalSort(["x", "x"], []), /duplicate/);
  assert.throws(() => stableTopologicalSort(["x"], [["x", "y"]]), /unknown/);
}
console.log("stable topological sort tests passed");
