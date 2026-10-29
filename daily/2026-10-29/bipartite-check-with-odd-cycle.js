// Determine whether an undirected graph is bipartite. If it is not,
// return a closed odd-cycle witness, including the repeated start vertex.

function bipartiteCheck(vertexCount, edges) {
  if (!Number.isInteger(vertexCount) || vertexCount < 0) {
    throw new RangeError('vertexCount must be a non-negative integer');
  }
  if (!Array.isArray(edges)) throw new TypeError('edges must be an array');

  const graph = Array.from({ length: vertexCount }, () => []);
  for (const edge of edges) {
    if (!Array.isArray(edge) || edge.length !== 2) {
      throw new TypeError('each edge must be a pair of vertices');
    }
    const [u, v] = edge;
    if (!Number.isInteger(u) || !Number.isInteger(v) ||
        u < 0 || v < 0 || u >= vertexCount || v >= vertexCount) {
      throw new RangeError('edge contains an invalid vertex');
    }
    graph[u].push(v);
    graph[v].push(u);
  }

  const color = Array(vertexCount).fill(-1);
  const parent = Array(vertexCount).fill(-1);
  const depth = Array(vertexCount).fill(0);

  function buildOddCycle(u, v) {
    const ancestors = new Map();
    const pathU = [];
    let node = u;
    while (node !== -1) {
      ancestors.set(node, pathU.length);
      pathU.push(node);
      node = parent[node];
    }

    const pathV = [];
    node = v;
    while (!ancestors.has(node)) {
      pathV.push(node);
      node = parent[node];
    }
    const lca = node;
    const left = pathU.slice(0, ancestors.get(lca) + 1);
    const right = pathV.reverse();
    return left.concat(right, [u]);
  }

  for (let start = 0; start < vertexCount; start += 1) {
    if (color[start] !== -1) continue;
    color[start] = 0;
    const queue = [start];
    let head = 0;

    while (head < queue.length) {
      const u = queue[head++];
      for (const v of graph[u]) {
        if (color[v] === -1) {
          color[v] = 1 - color[u];
          parent[v] = u;
          depth[v] = depth[u] + 1;
          queue.push(v);
        } else if (color[v] === color[u]) {
          // For a self-loop the witness is [u, u], an odd cycle of length 1.
          const cycle = buildOddCycle(u, v);
          return { bipartite: false, colors: null, oddCycle: cycle };
        }
      }
    }
  }
  return { bipartite: true, colors: color, oddCycle: null };
}

const assert = require('node:assert/strict');

assert.deepEqual(bipartiteCheck(4, [[0, 1], [1, 2], [2, 3]]), {
  bipartite: true, colors: [0, 1, 0, 1], oddCycle: null
});
const triangle = bipartiteCheck(3, [[0, 1], [1, 2], [2, 0]]);
assert.equal(triangle.bipartite, false);
assert.equal(triangle.oddCycle[0], triangle.oddCycle[triangle.oddCycle.length - 1]);
assert.equal((triangle.oddCycle.length - 1) % 2, 1);
for (let i = 1; i < triangle.oddCycle.length; i += 1) {
  const a = triangle.oddCycle[i - 1];
  const b = triangle.oddCycle[i];
  assert.ok([[0, 1], [1, 2], [2, 0]].some(([x, y]) =>
    (x === a && y === b) || (x === b && y === a)));
}
assert.deepEqual(bipartiteCheck(1, [[0, 0]]).oddCycle, [0, 0]);
assert.deepEqual(bipartiteCheck(0, []), { bipartite: true, colors: [], oddCycle: null });
assert.throws(() => bipartiteCheck(2, [[0, 3]]), RangeError);

console.log('bipartite witness tests passed');
