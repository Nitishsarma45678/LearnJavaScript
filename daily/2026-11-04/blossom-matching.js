"use strict";

const assert = require("node:assert/strict");

/**
 * Maximum-cardinality matching in a general undirected graph.
 *
 * Edmonds' blossom algorithm contracts odd cycles while searching for
 * augmenting paths. This implementation runs in O(V^3) time and supports
 * non-bipartite graphs, unlike the simpler bipartite matching algorithms.
 *
 * @param {number} vertexCount
 * @param {Array<[number, number]>} edges
 * @returns {{ size: number, pairs: Array<[number, number]>, mate: number[] }}
 */
function maximumMatching(vertexCount, edges) {
  if (!Number.isInteger(vertexCount) || vertexCount < 0) {
    throw new RangeError("vertexCount must be a non-negative integer");
  }
  if (!Array.isArray(edges)) {
    throw new TypeError("edges must be an array");
  }

  const graph = Array.from({ length: vertexCount }, () => []);
  const seen = new Set();

  for (const edge of edges) {
    if (!Array.isArray(edge) || edge.length !== 2) {
      throw new TypeError("each edge must contain exactly two vertices");
    }

    const [u, v] = edge;
    if (
      !Number.isInteger(u) || !Number.isInteger(v) ||
      u < 0 || v < 0 || u >= vertexCount || v >= vertexCount
    ) {
      throw new RangeError("edge endpoint is outside the graph");
    }
    if (u === v) continue;

    const a = Math.min(u, v);
    const b = Math.max(u, v);
    const key = a + ":" + b;
    if (seen.has(key)) continue;

    seen.add(key);
    graph[u].push(v);
    graph[v].push(u);
  }

  const mate = Array(vertexCount).fill(-1);
  const parent = Array(vertexCount).fill(-1);
  const base = Array.from({ length: vertexCount }, (_, i) => i);
  const used = Array(vertexCount).fill(false);
  const inBlossom = Array(vertexCount).fill(false);

  function lowestCommonAncestor(a, b) {
    const path = Array(vertexCount).fill(false);

    while (true) {
      a = base[a];
      path[a] = true;
      if (mate[a] === -1) break;
      a = parent[mate[a]];
    }

    while (true) {
      b = base[b];
      if (path[b]) return b;
      if (mate[b] === -1) break;
      b = parent[mate[b]];
    }

    return -1;
  }

  function markBlossomPath(vertex, blossomBase, child) {
    while (base[vertex] !== blossomBase) {
      inBlossom[base[vertex]] = true;
      inBlossom[base[mate[vertex]]] = true;
      parent[vertex] = child;
      child = mate[vertex];
      vertex = parent[mate[vertex]];
    }
  }

  function findAugmentingPath(root) {
    used.fill(false);
    parent.fill(-1);
    for (let i = 0; i < vertexCount; i += 1) base[i] = i;

    const queue = [root];
    used[root] = true;

    for (let head = 0; head < queue.length; head += 1) {
      const vertex = queue[head];

      for (const neighbor of graph[vertex]) {
        if (
          base[vertex] === base[neighbor] ||
          mate[vertex] === neighbor
        ) {
          continue;
        }

        const closesBlossom =
          neighbor === root ||
          (mate[neighbor] !== -1 && parent[mate[neighbor]] !== -1);

        if (closesBlossom) {
          const blossomBase = lowestCommonAncestor(vertex, neighbor);
          inBlossom.fill(false);
          markBlossomPath(vertex, blossomBase, neighbor);
          markBlossomPath(neighbor, blossomBase, vertex);

          for (let i = 0; i < vertexCount; i += 1) {
            if (inBlossom[base[i]]) {
              base[i] = blossomBase;
              if (!used[i]) {
                used[i] = true;
                queue.push(i);
              }
            }
          }
        } else if (parent[neighbor] === -1) {
          parent[neighbor] = vertex;

          if (mate[neighbor] === -1) {
            // Flip every edge along the discovered augmenting path.
            let current = neighbor;
            while (current !== -1) {
              const previous = parent[current];
              const next = previous === -1 ? -1 : mate[previous];

              mate[current] = previous;
              if (previous !== -1) mate[previous] = current;

              current = next;
            }
            return true;
          }

          const matched = mate[neighbor];
          used[matched] = true;
          queue.push(matched);
        }
      }
    }

    return false;
  }

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    if (mate[vertex] === -1) {
      findAugmentingPath(vertex);
    }
  }

  const pairs = [];
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    if (mate[vertex] > vertex) {
      pairs.push([vertex, mate[vertex]]);
    }
  }

  return { size: pairs.length, pairs, mate };
}

// A triangle joined to a second odd cycle: a bipartite-only matcher fails here.
const oddCycleGraph = [
  [0, 1], [1, 2], [2, 0],
  [1, 3],
  [3, 4], [4, 5], [5, 3],
  [5, 6]
];
const result = maximumMatching(7, oddCycleGraph);
assert.equal(result.size, 3);
assert.equal(result.pairs.length, 3);
for (const [u, v] of result.pairs) {
  assert.equal(result.mate[u], v);
  assert.equal(result.mate[v], u);
}

assert.equal(maximumMatching(0, []).size, 0);
assert.equal(maximumMatching(5, []).size, 0);
assert.equal(maximumMatching(4, [[0, 1], [1, 2], [2, 3]]).size, 2);
assert.equal(
  maximumMatching(4, [[0, 1], [0, 1], [1, 1], [2, 3]]).size,
  2
);
assert.throws(() => maximumMatching(-1, []), RangeError);
assert.throws(() => maximumMatching(3, [[0, 3]]), RangeError);

// Cross-check many small graphs against exhaustive search.
function bruteForceSize(vertexCount, edges) {
  const adjacency = Array.from({ length: vertexCount }, () => new Set());
  for (const [u, v] of edges) {
    if (u !== v) {
      adjacency[u].add(v);
      adjacency[v].add(u);
    }
  }

  function solve(mask) {
    let first = 0;
    while (first < vertexCount && (mask & (1 << first))) first += 1;
    if (first === vertexCount) return 0;

    let best = solve(mask | (1 << first)); // Leave this vertex unmatched.
    for (const neighbor of adjacency[first]) {
      if (!(mask & (1 << neighbor))) {
        best = Math.max(
          best,
          1 + solve(mask | (1 << first) | (1 << neighbor))
        );
      }
    }
    return best;
  }

  return solve(0);
}

let seed = 1729;
function random() {
  seed = (seed * 48271) % 2147483647;
  return seed / 2147483647;
}

for (let trial = 0; trial < 80; trial += 1) {
  const n = 2 + Math.floor(random() * 7);
  const edges = [];
  for (let u = 0; u < n; u += 1) {
    for (let v = u + 1; v < n; v += 1) {
      if (random() < 0.38) edges.push([u, v]);
    }
  }
  assert.equal(
    maximumMatching(n, edges).size,
    bruteForceSize(n, edges),
    "matching disagreed with brute force on trial " + trial
  );
}

console.log("Edmonds blossom tests passed.");

module.exports = { maximumMatching };
