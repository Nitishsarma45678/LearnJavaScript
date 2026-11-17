"use strict";

/**
 * Exercise: Implement Hopcroft-Karp maximum bipartite matching.
 *
 * The graph is supplied as (leftSize, rightSize, edges), where each edge is
 * [leftVertex, rightVertex]. The result also includes a minimum vertex cover,
 * obtained from alternating-path reachability (Konig's theorem).
 */

const assert = require("node:assert/strict");

function maximumBipartiteMatching(leftSize, rightSize, edges) {
  if (!Number.isInteger(leftSize) || leftSize < 0) {
    throw new RangeError("leftSize must be a non-negative integer");
  }
  if (!Number.isInteger(rightSize) || rightSize < 0) {
    throw new RangeError("rightSize must be a non-negative integer");
  }
  if (!Array.isArray(edges)) throw new TypeError("edges must be an array");

  const adjacency = Array.from({ length: leftSize }, () => []);
  const seen = Array.from({ length: leftSize }, () => new Set());

  for (const edge of edges) {
    if (!Array.isArray(edge) || edge.length !== 2) {
      throw new TypeError("each edge must be [leftVertex, rightVertex]");
    }
    const [left, right] = edge;
    if (!Number.isInteger(left) || left < 0 || left >= leftSize) {
      throw new RangeError("left endpoint is out of range");
    }
    if (!Number.isInteger(right) || right < 0 || right >= rightSize) {
      throw new RangeError("right endpoint is out of range");
    }
    if (!seen[left].has(right)) {
      seen[left].add(right);
      adjacency[left].push(right);
    }
  }

  const leftMatch = new Array(leftSize).fill(-1);
  const rightMatch = new Array(rightSize).fill(-1);
  const distance = new Array(leftSize);
  const infinity = leftSize + rightSize + 1;
  let shortestAugmentingLength = infinity;

  function breadthFirstSearch() {
    const queue = [];
    distance.fill(infinity);

    for (let left = 0; left < leftSize; left++) {
      if (leftMatch[left] === -1) {
        distance[left] = 0;
        queue.push(left);
      }
    }

    let shortest = infinity;
    for (let head = 0; head < queue.length; head++) {
      const left = queue[head];
      const nextLength = distance[left] + 1;
      if (nextLength > shortest) continue;

      for (const right of adjacency[left]) {
        const mate = rightMatch[right];
        if (mate === -1) {
          shortest = Math.min(shortest, nextLength);
        } else if (nextLength < shortest && distance[mate] === infinity) {
          distance[mate] = nextLength;
          queue.push(mate);
        }
      }
    }

    shortestAugmentingLength = shortest;
    return shortest;
  }

  function depthFirstSearch(left) {
    for (const right of adjacency[left]) {
      const mate = rightMatch[right];

      if (mate === -1) {
        if (distance[left] + 1 !== shortestAugmentingLength) continue;
      } else {
        if (distance[mate] !== distance[left] + 1) continue;
        if (!depthFirstSearch(mate)) continue;
      }

      leftMatch[left] = right;
      rightMatch[right] = left;
      return true;
    }

    distance[left] = infinity;
    return false;
  }

  let matchingSize = 0;
  while (breadthFirstSearch() !== infinity) {
    for (let left = 0; left < leftSize; left++) {
      if (leftMatch[left] === -1 && depthFirstSearch(left)) matchingSize++;
    }
  }

  // Alternating reachability from unmatched left vertices gives a minimum
  // vertex cover: (Left minus reachableLeft) union reachableRight.
  const reachableLeft = new Array(leftSize).fill(false);
  const reachableRight = new Array(rightSize).fill(false);
  const queue = [];

  for (let left = 0; left < leftSize; left++) {
    if (leftMatch[left] === -1) {
      reachableLeft[left] = true;
      queue.push(left);
    }
  }

  for (let head = 0; head < queue.length; head++) {
    const left = queue[head];
    for (const right of adjacency[left]) {
      // From left to right, follow only unmatched edges.
      if (leftMatch[left] === right || reachableRight[right]) continue;
      reachableRight[right] = true;

      // From right to left, follow its matched edge, if one exists.
      const mate = rightMatch[right];
      if (mate !== -1 && !reachableLeft[mate]) {
        reachableLeft[mate] = true;
        queue.push(mate);
      }
    }
  }

  const pairs = [];
  for (let left = 0; left < leftSize; left++) {
    if (leftMatch[left] !== -1) pairs.push([left, leftMatch[left]]);
  }

  const minimumVertexCover = {
    left: reachableLeft
      .map((reachable, vertex) => reachable ? -1 : vertex)
      .filter(vertex => vertex !== -1),
    right: reachableRight
      .map((reachable, vertex) => reachable ? vertex : -1)
      .filter(vertex => vertex !== -1)
  };

  return {
    size: matchingSize,
    pairs,
    leftMatch,
    rightMatch,
    minimumVertexCover
  };
}

function bruteForceMatching(leftSize, rightSize, edges) {
  const adjacency = Array.from({ length: leftSize }, () => []);
  for (const [left, right] of edges) {
    if (!adjacency[left].includes(right)) adjacency[left].push(right);
  }

  function search(left, usedRight) {
    if (left === leftSize) return 0;
    let best = search(left + 1, usedRight);
    for (const right of adjacency[left]) {
      if (usedRight.has(right)) continue;
      usedRight.add(right);
      best = Math.max(best, 1 + search(left + 1, usedRight));
      usedRight.delete(right);
    }
    return best;
  }

  return search(0, new Set());
}

function runTests() {
  const graph = maximumBipartiteMatching(4, 4, [
    [0, 0], [0, 1], [1, 0], [2, 1], [2, 2], [3, 2], [3, 3]
  ]);
  assert.equal(graph.size, 4);
  assert.equal(new Set(graph.pairs.map(pair => pair[1])).size, 4);
  assert.equal(
    graph.minimumVertexCover.left.length + graph.minimumVertexCover.right.length,
    graph.size
  );

  const empty = maximumBipartiteMatching(3, 2, []);
  assert.equal(empty.size, 0);
  assert.deepEqual(empty.minimumVertexCover, { left: [], right: [] });

  const duplicate = maximumBipartiteMatching(1, 1, [[0, 0], [0, 0], [0, 0]]);
  assert.deepEqual(duplicate.pairs, [[0, 0]]);

  // Every edge must be incident to at least one vertex in the returned cover.
  const coverLeft = new Set(graph.minimumVertexCover.left);
  const coverRight = new Set(graph.minimumVertexCover.right);
  for (const [left, right] of [
    [0, 0], [0, 1], [1, 0], [2, 1], [2, 2], [3, 2], [3, 3]
  ]) {
    assert.ok(coverLeft.has(left) || coverRight.has(right));
  }

  // Differential tests against exhaustive search on small random graphs.
  let seed = 0xabc123;
  const random = max => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return seed % max;
  };

  for (let trial = 0; trial < 220; trial++) {
    const leftSize = random(6);
    const rightSize = random(6);
    const edges = [];
    for (let left = 0; left < leftSize; left++) {
      for (let right = 0; right < rightSize; right++) {
        if (random(4) === 0) edges.push([left, right]);
      }
    }

    const result = maximumBipartiteMatching(leftSize, rightSize, edges);
    assert.equal(result.size, bruteForceMatching(leftSize, rightSize, edges));
    assert.equal(
      result.minimumVertexCover.left.length + result.minimumVertexCover.right.length,
      result.size
    );
    const leftCover = new Set(result.minimumVertexCover.left);
    const rightCover = new Set(result.minimumVertexCover.right);
    for (const [left, right] of edges) {
      assert.ok(leftCover.has(left) || rightCover.has(right));
    }
  }

  assert.throws(() => maximumBipartiteMatching(-1, 2, []), RangeError);
  assert.throws(() => maximumBipartiteMatching(1, 1, [[0, 1]]), RangeError);
  console.log("Hopcroft-Karp matching: all tests passed");
}

module.exports = { maximumBipartiteMatching };

if (require.main === module) runTests();
