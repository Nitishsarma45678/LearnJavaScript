'use strict';

/**
 * Exercise: Implement Dijkstra's shortest-path algorithm with a binary min-heap.
 *
 * Graph format: Map/object from node to an array of [neighbor, weight] pairs.
 * Edge weights must be finite and non-negative. Nodes that appear only as
 * neighbors are included automatically.
 *
 * Return distances, predecessors, and a pathTo(destination) reconstruction
 * helper. The algorithm is O((V + E) log V) with this heap implementation.
 */

class MinHeap {
  constructor(compare = (a, b) => a.distance - b.distance) {
    this.items = [];
    this.compare = compare;
  }

  get size() { return this.items.length; }

  push(value) {
    const items = this.items;
    items.push(value);
    let index = items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(items[parent], items[index]) <= 0) break;
      [items[parent], items[index]] = [items[index], items[parent]];
      index = parent;
    }
  }

  pop() {
    if (this.items.length === 0) return undefined;
    const items = this.items;
    const minimum = items[0];
    const last = items.pop();
    if (items.length > 0) {
      items[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < items.length && this.compare(items[left], items[smallest]) < 0) smallest = left;
        if (right < items.length && this.compare(items[right], items[smallest]) < 0) smallest = right;
        if (smallest === index) break;
        [items[index], items[smallest]] = [items[smallest], items[index]];
        index = smallest;
      }
    }
    return minimum;
  }
}

function normalizeGraph(graph) {
  if (!(graph instanceof Map) && (graph === null || typeof graph !== 'object')) {
    throw new TypeError('graph must be a Map or object');
  }
  const entries = graph instanceof Map ? [...graph.entries()] : Object.entries(graph);
  const adjacency = new Map();

  for (const [node, edges] of entries) {
    if (!Array.isArray(edges)) throw new TypeError('each adjacency list must be an array');
    if (!adjacency.has(node)) adjacency.set(node, []);
    for (const edge of edges) {
      if (!Array.isArray(edge) || edge.length !== 2) {
        throw new TypeError('each edge must be [neighbor, weight]');
      }
      const [neighbor, weight] = edge;
      if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) {
        throw new RangeError('edge weights must be finite and non-negative');
      }
      adjacency.get(node).push([neighbor, weight]);
      if (!adjacency.has(neighbor)) adjacency.set(neighbor, []);
    }
  }
  return adjacency;
}

function dijkstra(graph, start) {
  const adjacency = normalizeGraph(graph);
  if (!adjacency.has(start)) adjacency.set(start, []);

  const distances = new Map([...adjacency.keys()].map((node) => [node, Infinity]));
  const previous = new Map();
  const queue = new MinHeap();
  distances.set(start, 0);
  queue.push({ node: start, distance: 0 });

  while (queue.size > 0) {
    const current = queue.pop();
    if (current.distance !== distances.get(current.node)) continue;

    for (const [neighbor, weight] of adjacency.get(current.node)) {
      const candidate = current.distance + weight;
      if (candidate < distances.get(neighbor)) {
        distances.set(neighbor, candidate);
        previous.set(neighbor, current.node);
        queue.push({ node: neighbor, distance: candidate });
      }
    }
  }

  function pathTo(destination) {
    if (!distances.has(destination) || distances.get(destination) === Infinity) return null;
    const path = [];
    let cursor = destination;
    while (cursor !== undefined) {
      path.push(cursor);
      if (cursor === start) break;
      cursor = previous.get(cursor);
    }
    if (path[path.length - 1] !== start) return null;
    return path.reverse();
  }

  return { distances, previous, pathTo };
}

function runTests() {
  const assert = require('node:assert/strict');
  const graph = new Map([
    ['A', [['B', 4], ['C', 1]]],
    ['B', [['D', 1]]],
    ['C', [['B', 2], ['D', 5]]],
    ['D', []],
    ['isolated', []]
  ]);
  const result = dijkstra(graph, 'A');
  assert.equal(result.distances.get('A'), 0);
  assert.equal(result.distances.get('B'), 3);
  assert.equal(result.distances.get('C'), 1);
  assert.equal(result.distances.get('D'), 4);
  assert.equal(result.distances.get('isolated'), Infinity);
  assert.deepEqual(result.pathTo('D'), ['A', 'C', 'B', 'D']);
  assert.equal(result.pathTo('isolated'), null);
  assert.deepEqual(dijkstra({ start: [['end', 0]] }, 'start').pathTo('end'), ['start', 'end']);

  assert.throws(() => dijkstra({ a: [['b', -1]] }, 'a'), /non-negative/);
  assert.throws(() => dijkstra({ a: [['b', Infinity]] }, 'a'), /finite/);
  assert.throws(() => dijkstra({ a: ['b'] }, 'a'), /neighbor/);

  const heap = new MinHeap();
  [7, 2, 9, 1, 5].forEach((distance) => heap.push({ distance }));
  assert.deepEqual(Array.from({ length: 5 }, () => heap.pop().distance), [1, 2, 5, 7, 9]);
}

if (require.main === module) {
  runTests();
  console.log('Dijkstra shortest paths: all tests passed');
}

module.exports = { dijkstra, MinHeap };
