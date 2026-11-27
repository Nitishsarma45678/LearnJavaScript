'use strict';

// Exercise: find a maximum-cardinality matching in a bipartite graph using
// Hopcroft-Karp's layered augmenting-path strategy.

function maximumBipartiteMatching(leftCount, rightCount, adjacency) {
  if (adjacency.length !== leftCount) throw new RangeError('One adjacency list per left vertex is required');
  for (const neighbors of adjacency) {
    for (const v of neighbors) {
      if (!Number.isInteger(v) || v < 0 || v >= rightCount) throw new RangeError('Invalid right vertex');
    }
  }

  const pairLeft = Array(leftCount).fill(-1);
  const pairRight = Array(rightCount).fill(-1);
  const distance = Array(leftCount).fill(0);
  const INF = Number.MAX_SAFE_INTEGER;

  function bfs() {
    const queue = [];
    for (let u = 0; u < leftCount; u += 1) {
      if (pairLeft[u] === -1) {
        distance[u] = 0;
        queue.push(u);
      } else {
        distance[u] = INF;
      }
    }
    let found = false;
    for (let head = 0; head < queue.length; head += 1) {
      const u = queue[head];
      for (const v of adjacency[u]) {
        const next = pairRight[v];
        if (next === -1) found = true;
        else if (distance[next] === INF) {
          distance[next] = distance[u] + 1;
          queue.push(next);
        }
      }
    }
    return found;
  }

  function dfs(u) {
    for (const v of adjacency[u]) {
      const next = pairRight[v];
      if (next === -1 || (distance[next] === distance[u] + 1 && dfs(next))) {
        pairLeft[u] = v;
        pairRight[v] = u;
        return true;
      }
    }
    distance[u] = INF;
    return false;
  }

  let size = 0;
  while (bfs()) {
    for (let u = 0; u < leftCount; u += 1) {
      if (pairLeft[u] === -1 && dfs(u)) size += 1;
    }
  }
  return {
    size,
    pairs: pairLeft.flatMap((v, u) => v === -1 ? [] : [[u, v]]),
    pairLeft,
    pairRight
  };
}

const assert = require('node:assert/strict');
const result = maximumBipartiteMatching(4, 4, [
  [0, 1], [0], [1, 2], [2, 3]
]);
assert.equal(result.size, 4);
assert.equal(new Set(result.pairs.map(pair => pair[1])).size, 4);
assert.equal(maximumBipartiteMatching(3, 2, [[0, 1], [0], [1]]).size, 2);
assert.equal(maximumBipartiteMatching(2, 2, [[], []]).size, 0);
console.log('Hopcroft-Karp tests passed');

module.exports = { maximumBipartiteMatching };
