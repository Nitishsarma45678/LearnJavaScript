'use strict';

/** Maximum-cardinality matching in an unweighted bipartite graph. */
class BipartiteGraph {
  constructor(leftSize, rightSize) {
    if (!Number.isInteger(leftSize) || leftSize < 0 || !Number.isInteger(rightSize) || rightSize < 0) {
      throw new RangeError('partition sizes must be non-negative integers');
    }
    this.leftSize = leftSize;
    this.rightSize = rightSize;
    this.adjacency = Array.from({ length: leftSize }, () => new Set());
  }

  addEdge(left, right) {
    if (!Number.isInteger(left) || left < 0 || left >= this.leftSize) throw new RangeError('left vertex out of range');
    if (!Number.isInteger(right) || right < 0 || right >= this.rightSize) throw new RangeError('right vertex out of range');
    this.adjacency[left].add(right);
    return this;
  }

  maximumMatching() {
    const pairLeft = Array(this.leftSize).fill(-1);
    const pairRight = Array(this.rightSize).fill(-1);
    const distance = Array(this.leftSize).fill(Infinity);
    let shortestAugmentingLength = Infinity;

    const bfs = () => {
      const queue = [];
      shortestAugmentingLength = Infinity;
      for (let u = 0; u < this.leftSize; u += 1) {
        if (pairLeft[u] === -1) {
          distance[u] = 0;
          queue.push(u);
        } else distance[u] = Infinity;
      }
      for (let head = 0; head < queue.length; head += 1) {
        const u = queue[head];
        if (distance[u] + 1 > shortestAugmentingLength) continue;
        for (const v of this.adjacency[u]) {
          const mate = pairRight[v];
          if (mate === -1) shortestAugmentingLength = distance[u] + 1;
          else if (distance[mate] === Infinity && distance[u] + 1 < shortestAugmentingLength) {
            distance[mate] = distance[u] + 1;
            queue.push(mate);
          }
        }
      }
      return shortestAugmentingLength !== Infinity;
    };

    const dfs = u => {
      for (const v of this.adjacency[u]) {
        const mate = pairRight[v];
        const usable = mate === -1
          ? distance[u] + 1 === shortestAugmentingLength
          : distance[mate] === distance[u] + 1 && dfs(mate);
        if (usable) {
          pairLeft[u] = v;
          pairRight[v] = u;
          return true;
        }
      }
      distance[u] = Infinity;
      return false;
    };

    let size = 0;
    while (bfs()) {
      for (let u = 0; u < this.leftSize; u += 1) {
        if (pairLeft[u] === -1 && dfs(u)) size += 1;
      }
    }

    // Konig's theorem: (L \ reachableL) union reachableR is a minimum vertex cover.
    const reachableLeft = new Set();
    const reachableRight = new Set();
    const queue = [];
    for (let u = 0; u < this.leftSize; u += 1) {
      if (pairLeft[u] === -1) {
        reachableLeft.add(u);
        queue.push(u);
      }
    }
    for (let head = 0; head < queue.length; head += 1) {
      const u = queue[head];
      for (const v of this.adjacency[u]) {
        if (pairLeft[u] === v || reachableRight.has(v)) continue;
        reachableRight.add(v);
        const mate = pairRight[v];
        if (mate !== -1 && !reachableLeft.has(mate)) {
          reachableLeft.add(mate);
          queue.push(mate);
        }
      }
    }

    return {
      size,
      pairs: pairLeft.flatMap((v, u) => v === -1 ? [] : [[u, v]]),
      leftMatch: pairLeft,
      rightMatch: pairRight,
      minimumVertexCover: {
        left: Array.from({ length: this.leftSize }, (_, i) => i).filter(i => !reachableLeft.has(i)),
        right: [...reachableRight]
      }
    };
  }
}

function bruteForceMaximum(graph, leftSize, rightSize) {
  function visit(left, usedMask) {
    if (left === leftSize) return 0;
    let best = visit(left + 1, usedMask);
    for (const right of graph[left]) {
      const bit = 1 << right;
      if ((usedMask & bit) === 0) best = Math.max(best, 1 + visit(left + 1, usedMask | bit));
    }
    return best;
  }
  if (rightSize > 30) throw new RangeError('brute-force helper supports at most 30 right vertices');
  return visit(0, 0);
}

function runTests() {
  const assert = require('node:assert/strict');
  const graph = new BipartiteGraph(4, 4)
    .addEdge(0, 0).addEdge(0, 1)
    .addEdge(1, 0)
    .addEdge(2, 1).addEdge(2, 2)
    .addEdge(3, 2).addEdge(3, 3);
  const result = graph.maximumMatching();
  assert.equal(result.size, 4);
  assert.equal(result.minimumVertexCover.left.length + result.minimumVertexCover.right.length, result.size);

  let seed = 0x31415926;
  for (let trial = 0; trial < 220; trial += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const leftSize = seed % 7;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const rightSize = seed % 7;
    const candidate = new BipartiteGraph(leftSize, rightSize);
    const adjacency = Array.from({ length: leftSize }, () => []);
    for (let u = 0; u < leftSize; u += 1) {
      for (let v = 0; v < rightSize; v += 1) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        if ((seed & 3) === 0) {
          candidate.addEdge(u, v);
          adjacency[u].push(v);
        }
      }
    }
    const actual = candidate.maximumMatching();
    assert.equal(actual.size, bruteForceMaximum(adjacency, leftSize, rightSize));
    assert.equal(new Set(actual.pairs.map(pair => pair[0])).size, actual.size);
    assert.equal(new Set(actual.pairs.map(pair => pair[1])).size, actual.size);
    const cover = new Set([
      ...actual.minimumVertexCover.left.map(u => `L${u}`),
      ...actual.minimumVertexCover.right.map(v => `R${v}`)
    ]);
    for (let u = 0; u < leftSize; u += 1) {
      for (const v of adjacency[u]) assert.ok(cover.has(`L${u}`) || cover.has(`R${v}`));
    }
    assert.equal(cover.size, actual.size);
  }
  assert.throws(() => new BipartiteGraph(1, 1).addEdge(1, 0), /out of range/);
  console.log('Hopcroft-Karp: all tests passed (220 randomized graphs vs brute force).');
}

if (require.main === module) runTests();
module.exports = { BipartiteGraph, bruteForceMaximum };
