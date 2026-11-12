'use strict';

const assert = require('node:assert/strict');

/** Answer many lowest-common-ancestor queries in a forest using Tarjan's
 * offline algorithm. Iterative DFS avoids JavaScript call-stack limits.
 * Complexity: O((V + E + Q) alpha(V)) amortized.
 */
function offlineLCA(n, edges, queries) {
  if (!Number.isInteger(n) || n < 1) throw new TypeError('n must be a positive integer');
  if (!Array.isArray(edges) || !Array.isArray(queries)) throw new TypeError('edges and queries must be arrays');
  const adj = Array.from({ length: n }, () => []);
  const dsuParent = Array.from({ length: n }, (_, i) => i);
  const dsuSize = Array(n).fill(1);
  const ancestor = Array.from({ length: n }, (_, i) => i);
  const color = new Uint8Array(n); // 0 = white, 1 = gray, 2 = black
  const queryAdj = Array.from({ length: n }, () => []);

  const check = (u, label) => {
    if (!Number.isInteger(u) || u < 0 || u >= n) throw new RangeError(label + ' node out of range: ' + u);
  };
  for (const [u, v] of edges) {
    check(u, 'Edge'); check(v, 'Edge');
    if (u === v) throw new Error('A forest cannot contain self-loops');
    adj[u].push(v); adj[v].push(u);
  }
  for (let i = 0; i < queries.length; i++) {
    const pair = queries[i];
    if (!Array.isArray(pair) || pair.length !== 2) throw new TypeError('Each query must be [u, v]');
    const [u, v] = pair;
    check(u, 'Query'); check(v, 'Query');
    queryAdj[u].push([v, i]);
    if (u !== v) queryAdj[v].push([u, i]);
  }

  function find(x) {
    let root = x;
    while (dsuParent[root] !== root) root = dsuParent[root];
    while (dsuParent[x] !== x) {
      const next = dsuParent[x];
      dsuParent[x] = root;
      x = next;
    }
    return root;
  }

  function unite(a, b) {
    a = find(a); b = find(b);
    if (a === b) return a;
    if (dsuSize[a] < dsuSize[b]) [a, b] = [b, a];
    dsuParent[b] = a;
    dsuSize[a] += dsuSize[b];
    return a;
  }

  const answers = Array(queries.length).fill(null);
  const component = Array(n).fill(-1);
  let componentId = 0;

  for (let root = 0; root < n; root++) {
    if (color[root] !== 0) continue;
    const seen = new Set([root]);
    const stack = [{ node: root, parent: -1, next: 0 }];
    color[root] = 1;
    component[root] = componentId;

    while (stack.length) {
      const frame = stack[stack.length - 1];
      const u = frame.node;
      if (frame.next < adj[u].length) {
        const v = adj[u][frame.next++];
        if (v === frame.parent) continue;
        if (seen.has(v)) throw new Error('Input graph contains a cycle; expected a forest');
        seen.add(v);
        component[v] = componentId;
        color[v] = 1;
        stack.push({ node: v, parent: u, next: 0 });
        continue;
      }

      // Finish u: it becomes black before its parent absorbs its DSU set.
      color[u] = 2;
      for (const [v, queryIndex] of queryAdj[u]) {
        if (color[v] === 2 && component[v] === component[u]) {
          answers[queryIndex] = ancestor[find(v)];
        }
      }
      stack.pop();
      if (frame.parent !== -1) {
        const representative = unite(frame.parent, u);
        ancestor[representative] = frame.parent;
      }
    }
    componentId++;
  }

  // Queries spanning different trees in the forest intentionally remain null.
  return answers;
}

function naiveLCA(adj, u, v) {
  // Match offlineLCA's deterministic rooting: the smallest-index vertex in
  // each component is its root, rather than rooting separately at query u.
  const component = new Set([u]);
  const discover = [u];
  for (let i = 0; i < discover.length; i++) {
    for (const next of adj[discover[i]]) if (!component.has(next)) {
      component.add(next);
      discover.push(next);
    }
  }
  if (!component.has(v)) return null;
  const root = Math.min(...component);
  const parent = Array(adj.length).fill(-1);
  const depth = Array(adj.length).fill(0);
  const queue = [root];
  parent[root] = root;
  for (let i = 0; i < queue.length; i++) {
    const x = queue[i];
    for (const y of adj[x]) if (parent[y] === -1) {
      parent[y] = x;
      depth[y] = depth[x] + 1;
      queue.push(y);
    }
  }
  while (depth[u] > depth[v]) u = parent[u];
  while (depth[v] > depth[u]) v = parent[v];
  while (u !== v) { u = parent[u]; v = parent[v]; }
  return u;
}

function runTests() {
  const edges = [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [6, 7]];
  const queries = [[3, 4], [3, 5], [2, 6], [7, 7], [0, 5], [6, 7]];
  assert.deepEqual(offlineLCA(9, edges, queries), [1, 0, null, 7, 0, 6]);
  assert.throws(() => offlineLCA(3, [[0, 1], [1, 2], [2, 0]], []), /cycle/);
  assert.throws(() => offlineLCA(2, [], [[0, 2]]), /out of range/);

  let seed = 0x7a12;
  const random = max => ((seed = (seed * 1103515245 + 12345) >>> 0) % max);
  for (let trial = 0; trial < 100; trial++) {
    const n = 2 + random(70);
    const adj = Array.from({ length: n }, () => []);
    const forest = [];
    for (let v = 1; v < n; v++) {
      if (random(5) === 0) continue; // start another component
      const candidates = [];
      for (let u = 0; u < v; u++) if (random(3) !== 0) candidates.push(u);
      if (candidates.length) {
        const p = candidates[random(candidates.length)];
        forest.push([p, v]); adj[p].push(v); adj[v].push(p);
      }
    }
    const qs = Array.from({ length: 100 }, () => [random(n), random(n)]);
    const actual = offlineLCA(n, forest, qs);
    const expected = qs.map(([u, v]) => naiveLCA(adj, u, v));
    assert.deepEqual(actual, expected);
  }
  console.log('Tarjan Offline LCA: all tests passed');
}

if (require.main === module) runTests();
module.exports = { offlineLCA };
