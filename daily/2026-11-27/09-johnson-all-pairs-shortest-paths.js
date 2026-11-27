'use strict';

// Exercise: compute all-pairs shortest paths on a sparse directed graph that
// may contain negative edges but no negative cycle. Johnson reweights edges
// with Bellman-Ford, then runs Dijkstra from every source.

class MinHeap {
  constructor() { this.items = []; }
  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= item[0]) break;
      a[i] = a[p];
      i = p;
    }
    a[i] = item;
  }
  pop() {
    const a = this.items;
    if (!a.length) return null;
    const root = a[0];
    const last = a.pop();
    if (a.length) {
      let i = 0;
      while (true) {
        let child = i * 2 + 1;
        if (child >= a.length) break;
        if (child + 1 < a.length && a[child + 1][0] < a[child][0]) child += 1;
        if (a[child][0] >= last[0]) break;
        a[i] = a[child];
        i = child;
      }
      a[i] = last;
    }
    return root;
  }
  get size() { return this.items.length; }
}

function johnson(vertexCount, edges) {
  const adjacency = Array.from({ length: vertexCount }, () => []);
  for (const [u, v, weight] of edges) {
    if (u < 0 || u >= vertexCount || v < 0 || v >= vertexCount) throw new RangeError('Invalid vertex');
    adjacency[u].push([v, weight]);
  }

  const potential = Array(vertexCount).fill(0);
  for (let pass = 0; pass < vertexCount; pass += 1) {
    let changed = false;
    for (const [u, v, weight] of edges) {
      if (potential[v] > potential[u] + weight) {
        potential[v] = potential[u] + weight;
        changed = true;
        if (pass === vertexCount - 1) throw new Error('Negative cycle detected');
      }
    }
    if (!changed) break;
  }

  const all = [];
  for (let source = 0; source < vertexCount; source += 1) {
    const distance = Array(vertexCount).fill(Infinity);
    distance[source] = 0;
    const heap = new MinHeap();
    heap.push([0, source]);
    while (heap.size) {
      const [cost, u] = heap.pop();
      if (cost !== distance[u]) continue;
      for (const [v, weight] of adjacency[u]) {
        const reweighted = weight + potential[u] - potential[v];
        const candidate = cost + reweighted;
        if (candidate < distance[v]) {
          distance[v] = candidate;
          heap.push([candidate, v]);
        }
      }
    }
    all.push(distance.map((value, v) =>
      value === Infinity ? Infinity : value - potential[source] + potential[v]
    ));
  }
  return all;
}

const assert = require('node:assert/strict');
const distances = johnson(4, [
  [0, 1, 1], [0, 2, 4], [1, 2, -2], [2, 3, 2], [3, 1, 3]
]);
assert.deepEqual(distances[0], [0, 1, -1, 1]);
assert.equal(distances[3][2], 1);
assert.equal(distances[2][0], Infinity);
assert.throws(() => johnson(2, [[0, 1, -2], [1, 0, -1]]), /Negative cycle/);
console.log('Johnson shortest-path tests passed');

module.exports = { johnson, MinHeap };
