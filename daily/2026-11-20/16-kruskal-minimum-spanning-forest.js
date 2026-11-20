// Exercise: Compute a minimum spanning forest with Kruskal's algorithm.
// Disconnected input returns a forest and its component count.
// Run: node daily/2026-11-20/16-kruskal-minimum-spanning-forest.js
"use strict";
const assert = require("node:assert/strict");
class DisjointSet {
  constructor(size) { this.parent = Array.from({ length: size }, (_, i) => i); this.rank = Array(size).fill(0); this.components = size; }
  find(x) { if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]); return this.parent[x]; }
  union(a, b) {
    a = this.find(a); b = this.find(b);
    if (a === b) return false;
    if (this.rank[a] < this.rank[b]) [a, b] = [b, a];
    this.parent[b] = a;
    if (this.rank[a] === this.rank[b]) this.rank[a]++;
    this.components--;
    return true;
  }
}
function kruskal(vertexCount, edges) {
  if (!Number.isInteger(vertexCount) || vertexCount < 0) throw new RangeError("vertexCount must be non-negative");
  if (!Array.isArray(edges)) throw new TypeError("edges must be an array");
  edges.forEach(([from, to, weight]) => {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= vertexCount || to >= vertexCount) {
      throw new RangeError("edge endpoint out of range");
    }
    if (!Number.isFinite(weight)) throw new TypeError("edge weights must be finite");
  });
  const ordered = edges.map((edge, index) => ({ edge, index }))
    .sort((a, b) => a.edge[2] - b.edge[2] || a.index - b.index);
  const sets = new DisjointSet(vertexCount), selected = [];
  let totalWeight = 0;
  for (const { edge: [from, to, weight] } of ordered) {
    if (sets.union(from, to)) {
      selected.push([from, to, weight]);
      totalWeight += weight;
    }
  }
  return { edges: selected, totalWeight, components: sets.components };
}
const graph = [
  [0,1,4],[0,2,3],[1,2,1],[1,3,2],[2,3,4],[3,4,2],[4,5,6]
];
const result = kruskal(6, graph);
assert.equal(result.totalWeight, 14);
assert.equal(result.edges.length, 5);
assert.equal(result.components, 1);
const forest = kruskal(4, [[0,1,-2],[2,3,5]]);
assert.equal(forest.totalWeight, 3);
assert.equal(forest.components, 2);
assert.throws(() => kruskal(2, [[0,2,1]]), /endpoint/);
assert.throws(() => kruskal(2, [[0,1,Infinity]]), /finite/);
console.log("Kruskal minimum spanning forest: all tests passed");
