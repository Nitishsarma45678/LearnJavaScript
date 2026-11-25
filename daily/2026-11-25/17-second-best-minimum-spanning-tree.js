'use strict';

// Exercise: find the cheapest spanning tree whose total weight is strictly
// greater than the MST. Use Kruskal plus binary lifting that stores the two
// largest distinct edge weights on each ancestor jump.

class DisjointSet {
  constructor(n) { this.parent = Array.from({ length: n }, (_, i) => i); this.size = Array(n).fill(1); }
  find(x) {
    while (x !== this.parent[x]) { this.parent[x] = this.parent[this.parent[x]]; x = this.parent[x]; }
    return x;
  }
  union(a, b) {
    a = this.find(a); b = this.find(b);
    if (a === b) return false;
    if (this.size[a] < this.size[b]) [a, b] = [b, a];
    this.parent[b] = a; this.size[a] += this.size[b]; return true;
  }
}

function mergeTop(a, b) {
  const values = [...a, ...b].filter(Number.isFinite).sort((x, y) => y - x);
  const unique = [...new Set(values)];
  return [unique[0] ?? -Infinity, unique[1] ?? -Infinity];
}

function secondBestMst(vertexCount, edges) {
  if (!Number.isInteger(vertexCount) || vertexCount < 1) throw new RangeError('invalid vertex count');
  const sorted = edges.map(([u, v, weight], id) => {
    if (![u, v].every(x => Number.isInteger(x) && x >= 0 && x < vertexCount) ||
        !Number.isFinite(weight) || u === v) throw new RangeError('invalid edge');
    return { u, v, weight, id };
  }).sort((a, b) => a.weight - b.weight || a.id - b.id);

  const dsu = new DisjointSet(vertexCount);
  const tree = Array.from({ length: vertexCount }, () => []);
  const inTree = new Set();
  let mstWeight = 0, selected = 0;
  for (const edge of sorted) {
    if (dsu.union(edge.u, edge.v)) {
      inTree.add(edge.id);
      mstWeight += edge.weight;
      selected++;
      tree[edge.u].push([edge.v, edge.weight]);
      tree[edge.v].push([edge.u, edge.weight]);
    }
  }
  if (selected !== vertexCount - 1) return null;
  if (vertexCount === 1) return { mstWeight: 0, secondBestWeight: null };

  const levels = Math.ceil(Math.log2(vertexCount)) + 1;
  const depth = Array(vertexCount).fill(0);
  const up = Array.from({ length: levels }, () => Array(vertexCount).fill(0));
  const top = Array.from({ length: levels }, () => Array.from({ length: vertexCount }, () => [-Infinity, -Infinity]));
  const seen = Array(vertexCount).fill(false);
  const stack = [0];
  seen[0] = true;
  while (stack.length) {
    const u = stack.pop();
    for (const [v, weight] of tree[u]) {
      if (seen[v]) continue;
      seen[v] = true;
      depth[v] = depth[u] + 1;
      up[0][v] = u;
      top[0][v] = [weight, -Infinity];
      stack.push(v);
    }
  }
  for (let k = 1; k < levels; k++) {
    for (let v = 0; v < vertexCount; v++) {
      const middle = up[k - 1][v];
      up[k][v] = up[k - 1][middle];
      top[k][v] = mergeTop(top[k - 1][v], top[k - 1][middle]);
    }
  }

  function pathTop(a, b) {
    let result = [-Infinity, -Infinity];
    const absorb = pair => { result = mergeTop(result, pair); };
    if (depth[a] < depth[b]) [a, b] = [b, a];
    let difference = depth[a] - depth[b];
    for (let k = levels - 1; k >= 0; k--) {
      if (difference & (1 << k)) { absorb(top[k][a]); a = up[k][a]; }
    }
    if (a === b) return result;
    for (let k = levels - 1; k >= 0; k--) {
      if (up[k][a] !== up[k][b]) {
        absorb(top[k][a]); absorb(top[k][b]);
        a = up[k][a]; b = up[k][b];
      }
    }
    absorb(top[0][a]); absorb(top[0][b]);
    return result;
  }

  let second = Infinity;
  for (const edge of sorted) {
    if (inTree.has(edge.id)) continue;
    const [largest, secondLargest] = pathTop(edge.u, edge.v);
    const removed = edge.weight > largest ? largest :
      edge.weight === largest ? secondLargest : -Infinity;
    if (Number.isFinite(removed)) {
      const candidate = mstWeight + edge.weight - removed;
      if (candidate > mstWeight) second = Math.min(second, candidate);
    }
  }
  return { mstWeight, secondBestWeight: Number.isFinite(second) ? second : null };
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  assert.deepEqual(secondBestMst(4, [
    [0, 1, 1], [1, 2, 2], [2, 3, 3], [0, 3, 4], [0, 2, 5]
  ]), { mstWeight: 6, secondBestWeight: 7 });
  assert.deepEqual(secondBestMst(3, [[0, 1, 1], [1, 2, 1], [0, 2, 1]]),
    { mstWeight: 2, secondBestWeight: null });
  assert.equal(secondBestMst(3, [[0, 1, 2]]), null);
  console.log('second-best MST: all tests passed');
}

module.exports = { secondBestMst };
