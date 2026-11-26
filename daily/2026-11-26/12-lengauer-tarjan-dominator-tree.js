'use strict';

// Exercise: compute immediate dominators of all vertices reachable from an
// entry node in a directed control-flow graph using Lengauer-Tarjan.

const assert = require('node:assert/strict');

function immediateDominators(vertexCount, edges, start = 0) {
  if (!Number.isInteger(vertexCount) || vertexCount < 1 ||
      !Number.isInteger(start) || start < 0 || start >= vertexCount || !Array.isArray(edges)) {
    throw new TypeError('invalid graph dimensions or start vertex');
  }
  const adjacency = Array.from({ length: vertexCount }, () => []);
  const predecessors = Array.from({ length: vertexCount }, () => []);
  for (const [from, to] of edges) {
    if (!Number.isInteger(from) || !Number.isInteger(to) ||
        from < 0 || from >= vertexCount || to < 0 || to >= vertexCount) {
      throw new RangeError('edge endpoint outside graph');
    }
    adjacency[from].push(to);
    predecessors[to].push(from);
  }

  const number = Array(vertexCount).fill(0);
  const vertex = [null];
  const parent = [0];
  let count = 0;

  function dfs(v) {
    number[v] = ++count;
    vertex[count] = v;
    for (const next of adjacency[v]) {
      if (number[next] === 0) {
        dfs(next);
        parent[number[next]] = number[v];
      }
    }
  }
  dfs(start);

  const semi = Array.from({ length: count + 1 }, (_, i) => i);
  const label = Array.from({ length: count + 1 }, (_, i) => i);
  const ancestor = Array(count + 1).fill(0);
  const idom = Array(count + 1).fill(0);
  const bucket = Array.from({ length: count + 1 }, () => []);

  function compress(v) {
    if (ancestor[ancestor[v]] !== 0) {
      compress(ancestor[v]);
      if (semi[label[ancestor[v]]] < semi[label[v]]) label[v] = label[ancestor[v]];
      ancestor[v] = ancestor[ancestor[v]];
    }
  }

  function evaluate(v) {
    if (ancestor[v] === 0) return label[v];
    compress(v);
    return label[v];
  }

  for (let w = count; w >= 2; w -= 1) {
    const original = vertex[w];
    for (const pred of predecessors[original]) {
      const predNumber = number[pred];
      if (predNumber === 0) continue;
      const candidate = evaluate(predNumber);
      semi[w] = Math.min(semi[w], semi[candidate]);
    }
    bucket[semi[w]].push(w);
    ancestor[w] = parent[w];

    for (const v of bucket[parent[w]]) {
      const candidate = evaluate(v);
      idom[v] = semi[candidate] < semi[v] ? candidate : parent[w];
    }
    bucket[parent[w]] = [];
  }

  for (let w = 2; w <= count; w += 1) {
    if (idom[w] !== semi[w]) idom[w] = idom[idom[w]];
  }

  const result = Array(vertexCount).fill(null);
  result[start] = null;
  for (let i = 2; i <= count; i += 1) result[vertex[i]] = vertex[idom[i]];
  return result;
}

assert.deepEqual(immediateDominators(5, [
  [0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [1, 4]
]), [null, 0, 0, 0, 0]);
assert.deepEqual(immediateDominators(5, [
  [0, 1], [1, 2], [2, 3], [1, 3]
]), [null, 0, 1, 1, null]);
assert.deepEqual(immediateDominators(3, [[0, 1], [1, 1]]), [null, 0, null]);
assert.throws(() => immediateDominators(2, [[0, 2]]), RangeError);

module.exports = { immediateDominators };
