'use strict';

const assert = require('node:assert/strict');

function maximumMatching(vertexCount, edges) {
  const graph = Array.from({ length: vertexCount }, () => []);
  for (const [a, b] of edges) {
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 ||
        a >= vertexCount || b >= vertexCount || a === b) throw new RangeError('Invalid edge');
    graph[a].push(b);
    graph[b].push(a);
  }

  const match = Array(vertexCount).fill(-1);
  const parent = Array(vertexCount);
  const base = Array(vertexCount);
  const used = Array(vertexCount);
  const blossom = Array(vertexCount);

  function lowestCommonAncestor(a, b) {
    const path = Array(vertexCount).fill(false);
    while (true) {
      a = base[a];
      path[a] = true;
      if (match[a] === -1) break;
      a = parent[match[a]];
    }
    while (true) {
      b = base[b];
      if (path[b]) return b;
      b = parent[match[b]];
    }
  }

  function markPath(vertex, blossomBase, child) {
    while (base[vertex] !== blossomBase) {
      blossom[base[vertex]] = true;
      blossom[base[match[vertex]]] = true;
      parent[vertex] = child;
      child = match[vertex];
      vertex = parent[match[vertex]];
    }
  }

  function findAugmentingPath(root) {
    used.fill(false);
    parent.fill(-1);
    for (let i = 0; i < vertexCount; i++) base[i] = i;
    const queue = [root];
    used[root] = true;

    for (let head = 0; head < queue.length; head++) {
      const vertex = queue[head];
      for (const next of graph[vertex]) {
        if (base[vertex] === base[next] || match[vertex] === next) continue;

        if (next === root || (match[next] !== -1 && parent[match[next]] !== -1)) {
          const common = lowestCommonAncestor(vertex, next);
          blossom.fill(false);
          markPath(vertex, common, next);
          markPath(next, common, vertex);
          for (let i = 0; i < vertexCount; i++) {
            if (blossom[base[i]]) {
              base[i] = common;
              if (!used[i]) { used[i] = true; queue.push(i); }
            }
          }
        } else if (parent[next] === -1) {
          parent[next] = vertex;
          if (match[next] === -1) {
            let current = next;
            while (current !== -1) {
              const previous = parent[current];
              const following = previous === -1 ? -1 : match[previous];
              match[current] = previous;
              if (previous !== -1) match[previous] = current;
              current = following;
            }
            return true;
          }
          const mate = match[next];
          used[mate] = true;
          queue.push(mate);
        }
      }
    }
    return false;
  }

  for (let vertex = 0; vertex < vertexCount; vertex++) {
    if (match[vertex] === -1) findAugmentingPath(vertex);
  }

  const pairs = [];
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    if (match[vertex] > vertex) pairs.push([vertex, match[vertex]]);
  }
  return { size: pairs.length, pairs, mate: match };
}

const oddCycleWithTail = maximumMatching(6, [
  [0,1],[1,2],[2,0], // odd blossom
  [2,3],[3,4],[4,5],[5,2]
]);
assert.equal(oddCycleWithTail.size, 3);
for (const [a, b] of oddCycleWithTail.pairs) {
  assert.equal(oddCycleWithTail.mate[a], b);
  assert.equal(oddCycleWithTail.mate[b], a);
}
const triangle = maximumMatching(3, [[0,1],[1,2],[2,0]]);
assert.equal(triangle.size, 1);
assert.equal(maximumMatching(4, []).size, 0);
console.log('General-graph blossom examples passed.');

module.exports = { maximumMatching };
