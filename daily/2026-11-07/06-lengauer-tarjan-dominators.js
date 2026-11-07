'use strict';

/**
 * Exercise: Compute immediate dominators of a directed control-flow graph.
 *
 * A vertex d dominates v when every path from the entry vertex to v passes
 * through d. Implement the Lengauer-Tarjan algorithm in near-linear time,
 * return the dominator tree, and support constant-time dominance queries.
 * Unreachable vertices have no immediate dominator.
 */

function computeDominators(vertexCount, edges, entry = 0) {
  if (!Number.isSafeInteger(vertexCount) || vertexCount < 1) {
    throw new RangeError('vertexCount must be a positive safe integer');
  }
  if (!Number.isSafeInteger(entry) || entry < 0 || entry >= vertexCount) {
    throw new RangeError('entry is outside the graph');
  }
  if (!Array.isArray(edges)) throw new TypeError('edges must be an array');

  const graph = Array.from({ length: vertexCount }, () => []);
  for (const edge of edges) {
    if (!Array.isArray(edge) || edge.length !== 2) throw new TypeError('each edge must be [from, to]');
    const [from, to] = edge;
    if (![from, to].every((v) => Number.isSafeInteger(v) && v >= 0 && v < vertexCount)) {
      throw new RangeError('edge endpoint is outside the graph');
    }
    graph[from].push(to);
  }

  // DFS numbers are 1-based; zero is the sentinel used by the algorithm.
  const dfsNumber = new Int32Array(vertexCount);
  const vertex = [ -1 ];
  const parent = [ 0 ];
  const predecessor = [ [] ];
  let count = 0;

  function dfs(node, parentNumber) {
    const number = ++count;
    dfsNumber[node] = number;
    vertex[number] = node;
    parent[number] = parentNumber;
    predecessor[number] = [];
    for (const next of graph[node]) {
      if (dfsNumber[next] === 0) dfs(next, number);
      predecessor[dfsNumber[next]].push(number);
    }
  }
  dfs(entry, 0);

  const semi = new Int32Array(count + 1);
  const idom = new Int32Array(count + 1);
  const ancestor = new Int32Array(count + 1);
  const label = new Int32Array(count + 1);
  const bucket = Array.from({ length: count + 1 }, () => []);
  for (let i = 1; i <= count; i++) semi[i] = label[i] = i;

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
    return semi[label[ancestor[v]]] < semi[label[v]] ? label[ancestor[v]] : label[v];
  }

  function link(parentNode, childNode) {
    ancestor[childNode] = parentNode;
  }

  for (let w = count; w >= 2; w--) {
    for (const v of predecessor[w]) {
      const candidate = evaluate(v);
      if (semi[candidate] < semi[w]) semi[w] = semi[candidate];
    }
    bucket[semi[w]].push(w);
    link(parent[w], w);

    const pending = bucket[parent[w]];
    for (const v of pending) {
      const candidate = evaluate(v);
      idom[v] = semi[candidate] < semi[v] ? candidate : parent[w];
    }
    pending.length = 0;
  }

  for (let w = 2; w <= count; w++) {
    if (idom[w] !== semi[w]) idom[w] = idom[idom[w]];
  }
  idom[1] = 0;

  const immediateDominator = Array(vertexCount).fill(null);
  const children = Array.from({ length: vertexCount }, () => []);
  for (let number = 2; number <= count; number++) {
    const node = vertex[number];
    const dominator = vertex[idom[number]];
    immediateDominator[node] = dominator;
    children[dominator].push(node);
  }

  // Euler intervals over the dominator tree make dominates(a, b) O(1).
  const tin = new Int32Array(vertexCount);
  const tout = new Int32Array(vertexCount);
  let clock = 0;
  function tour(node) {
    tin[node] = ++clock;
    for (const child of children[node]) tour(child);
    tout[node] = clock;
  }
  tour(entry);

  return Object.freeze({
    entry,
    immediateDominator: Object.freeze(immediateDominator),
    children: Object.freeze(children.map((list) => Object.freeze(list.slice()))),
    reachable: Object.freeze(vertex.slice(1)),
    dominates(a, b) {
      if (![a, b].every((v) => Number.isSafeInteger(v) && v >= 0 && v < vertexCount)) {
        throw new RangeError('dominance query vertex is outside the graph');
      }
      return tin[a] !== 0 && tin[b] !== 0 && tin[a] <= tin[b] && tout[b] <= tout[a];
    },
  });
}

function bruteDominators(vertexCount, edges, entry = 0) {
  const predecessors = Array.from({ length: vertexCount }, () => []);
  for (const [from, to] of edges) predecessors[to].push(from);
  const reachable = new Set([entry]);
  const stack = [entry];
  while (stack.length) {
    const node = stack.pop();
    for (const [from, to] of edges) {
      if (from === node && !reachable.has(to)) { reachable.add(to); stack.push(to); }
    }
  }
  const all = new Set(reachable);
  const dom = Array.from({ length: vertexCount }, (_, v) =>
    !reachable.has(v) ? new Set() : v === entry ? new Set([entry]) : new Set(all));
  let changed = true;
  while (changed) {
    changed = false;
    for (const v of reachable) {
      if (v === entry) continue;
      const incoming = predecessors[v].filter((p) => reachable.has(p));
      let next = incoming.length ? new Set(dom[incoming[0]]) : new Set();
      for (const p of incoming.slice(1)) next = new Set([...next].filter((x) => dom[p].has(x)));
      next.add(v);
      if (next.size !== dom[v].size || [...next].some((x) => !dom[v].has(x))) {
        dom[v] = next;
        changed = true;
      }
    }
  }
  return { reachable, dom };
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  const edges = [
    [0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [4, 5], [5, 3],
    [2, 6], [6, 7], [7, 6], [7, 4], [8, 9],
  ];
  const result = computeDominators(10, edges, 0);
  assert.deepEqual(result.immediateDominator, [null, 0, 0, 0, 0, 4, 2, 6, null, null]);
  assert.equal(result.dominates(0, 5), true);
  assert.equal(result.dominates(3, 5), false);
  assert.equal(result.dominates(2, 5), false);
  assert.equal(result.dominates(8, 9), false);

  // Differentially compare immediate dominators with a simple set solver.
  let seed = 0xC0FFEE;
  const random = (limit) => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % limit; };
  for (let trial = 0; trial < 250; trial++) {
    const n = 2 + random(8);
    const graphEdges = [];
    for (let u = 0; u < n; u++) for (let v = 0; v < n; v++) {
      if (random(5) === 0) graphEdges.push([u, v]);
    }
    const entry = random(n);
    const actual = computeDominators(n, graphEdges, entry);
    const expected = bruteDominators(n, graphEdges, entry);
    for (let v = 0; v < n; v++) {
      if (!expected.reachable.has(v)) {
        assert.equal(actual.immediateDominator[v], null);
        continue;
      }
      if (v === entry) continue;
      const strict = [...expected.dom[v]].filter((d) => d !== v);
      const immediate = strict.find((candidate) =>
        strict.every((other) => other === candidate || expected.dom[candidate].has(other)));
      assert.equal(actual.immediateDominator[v], immediate, `trial ${trial}, vertex ${v}`);
      for (let d = 0; d < n; d++) {
        assert.equal(actual.dominates(d, v), expected.dom[v].has(d));
      }
    }
  }

  assert.throws(() => computeDominators(0, []), /vertexCount/);
  assert.throws(() => computeDominators(3, [[0, 3]]), /endpoint/);
  console.log('lengauer-tarjan-dominators: all tests passed');
}

module.exports = { computeDominators };
