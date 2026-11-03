const assert = require('node:assert/strict');

// Hierholzer's algorithm. Returns a vertex sequence using every directed edge once,
// or null when the degree/connectivity conditions for an Euler trail are not met.
function findEulerianTrail(edges) {
  if (!Array.isArray(edges)) throw new TypeError('edges must be an array');
  if (edges.length === 0) return [];

  const adjacency = new Map();
  const indegree = new Map();
  const outdegree = new Map();
  const nodes = new Set();

  for (const edge of edges) {
    if (!Array.isArray(edge) || edge.length !== 2) {
      throw new TypeError('each edge must be a [from, to] pair');
    }
    const [from, to] = edge;
    nodes.add(from);
    nodes.add(to);
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from).push(to);
    outdegree.set(from, (outdegree.get(from) || 0) + 1);
    indegree.set(to, (indegree.get(to) || 0) + 1);
  }

  let start = null;
  let endCount = 0;
  let startCount = 0;
  for (const node of nodes) {
    const difference = (outdegree.get(node) || 0) - (indegree.get(node) || 0);
    if (difference === 1) { start = node; startCount++; }
    else if (difference === -1) endCount++;
    else if (difference !== 0) return null;
  }
  if (!((startCount === 1 && endCount === 1) || (startCount === 0 && endCount === 0))) {
    return null;
  }
  if (start === null) start = edges[0][0];

  const stack = [start];
  const reversedPath = [];
  while (stack.length) {
    const vertex = stack[stack.length - 1];
    const outgoing = adjacency.get(vertex);
    if (outgoing && outgoing.length) {
      stack.push(outgoing.pop());
    } else {
      reversedPath.push(stack.pop());
    }
  }

  if (reversedPath.length !== edges.length + 1) return null;
  return reversedPath.reverse();
}

function usesEveryEdgeOnce(edges, trail) {
  if (!trail || trail.length !== edges.length + 1) return false;
  const counts = new Map();
  for (const [a, b] of edges) {
    const key = JSON.stringify([a, b]);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  for (let i = 1; i < trail.length; i++) {
    const key = JSON.stringify([trail[i - 1], trail[i]]);
    const remaining = counts.get(key) || 0;
    if (remaining === 0) return false;
    counts.set(key, remaining - 1);
  }
  return [...counts.values()].every(count => count === 0);
}

const pathEdges = [['A', 'B'], ['B', 'C'], ['C', 'A'], ['A', 'D']];
const path = findEulerianTrail(pathEdges);
assert.deepEqual(path, ['A', 'B', 'C', 'A', 'D']);
assert.equal(usesEveryEdgeOnce(pathEdges, path), true);

const parallel = [[1, 2], [1, 2], [2, 1]];
assert.equal(usesEveryEdgeOnce(parallel, findEulerianTrail(parallel)), true);
assert.equal(findEulerianTrail([[1, 2], [3, 4]]), null);
assert.equal(findEulerianTrail([[1, 2], [1, 3]]), null);
assert.deepEqual(findEulerianTrail([]), []);
assert.throws(() => findEulerianTrail([[1]]), TypeError);
console.log('Directed Eulerian trail tests passed');
