const assert = require('node:assert/strict');

function findOddCycle(u, v, parent) {
  if (u === v) return [u, u];
  const pathFromU = [];
  const ancestorIndex = new Map();
  for (let node = u; node !== undefined; node = parent.get(node)) {
    ancestorIndex.set(node, pathFromU.length);
    pathFromU.push(node);
  }

  const pathFromV = [];
  let node = v;
  while (!ancestorIndex.has(node)) {
    pathFromV.push(node);
    node = parent.get(node);
    if (node === undefined) return [u, v, u];
  }

  const lca = node;
  return pathFromU.slice(0, ancestorIndex.get(lca) + 1)
    .concat(pathFromV.reverse(), [u]);
}

function analyzeBipartite(graph) {
  const entries = graph instanceof Map ? [...graph.entries()] : Object.entries(graph);
  const adjacency = new Map();
  const addNode = node => { if (!adjacency.has(node)) adjacency.set(node, new Set()); };

  for (const [from, neighbors] of entries) {
    addNode(from);
    for (const to of neighbors) {
      addNode(to);
      adjacency.get(from).add(to);
      adjacency.get(to).add(from); // Treat every listed edge as undirected.
    }
  }

  const colors = new Map();
  const parent = new Map();
  for (const start of adjacency.keys()) {
    if (colors.has(start)) continue;
    colors.set(start, 0);
    const queue = [start];

    for (let head = 0; head < queue.length; head++) {
      const current = queue[head];
      for (const neighbor of adjacency.get(current)) {
        if (!colors.has(neighbor)) {
          colors.set(neighbor, 1 - colors.get(current));
          parent.set(neighbor, current);
          queue.push(neighbor);
        } else if (colors.get(neighbor) === colors.get(current)) {
          return {
            bipartite: false,
            colors,
            oddCycle: findOddCycle(current, neighbor, parent)
          };
        }
      }
    }
  }
  return { bipartite: true, colors, oddCycle: null };
}

const path = analyzeBipartite({ a: ['b'], b: ['c'], c: ['d'], d: [] });
assert.equal(path.bipartite, true);
assert.equal(path.colors.size, 4);

const triangle = analyzeBipartite({ a: ['b', 'c'], b: ['c'], c: [] });
assert.equal(triangle.bipartite, false);
assert.equal((triangle.oddCycle.length - 1) % 2, 1);
assert.equal(triangle.oddCycle[0], triangle.oddCycle.at(-1));

const selfLoop = analyzeBipartite({ x: ['x'] });
assert.deepEqual(selfLoop.oddCycle, ['x', 'x']);
console.log('Bipartite graph tests passed');