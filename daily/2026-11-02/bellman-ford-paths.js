const assert = require('node:assert/strict');

function bellmanFord(edges, source) {
  const nodes = new Set([source]);
  for (const edge of edges) {
    if (!Array.isArray(edge) || edge.length !== 3) throw new TypeError('Edges must be [from, to, weight]');
    const [from, to, weight] = edge;
    if (!Number.isFinite(weight)) throw new TypeError('Edge weights must be finite numbers');
    nodes.add(from);
    nodes.add(to);
  }

  const distance = new Map([...nodes].map(node => [node, Infinity]));
  const previous = new Map();
  distance.set(source, 0);

  for (let pass = 0; pass < nodes.size - 1; pass++) {
    let changed = false;
    for (const [from, to, weight] of edges) {
      const base = distance.get(from);
      if (base !== Infinity && base + weight < distance.get(to)) {
        distance.set(to, base + weight);
        previous.set(to, from);
        changed = true;
      }
    }
    if (!changed) break;
  }

  for (const [from, to, weight] of edges) {
    const base = distance.get(from);
    if (base !== Infinity && base + weight < distance.get(to)) {
      throw new Error('Reachable negative-weight cycle detected');
    }
  }

  function pathTo(target) {
    if (!distance.has(target) || distance.get(target) === Infinity) return null;
    const path = [];
    const seen = new Set();
    let current = target;
    while (current !== undefined) {
      if (seen.has(current)) throw new Error('Predecessor cycle detected');
      seen.add(current);
      path.push(current);
      if (Object.is(current, source)) break;
      current = previous.get(current);
    }
    if (!Object.is(path[path.length - 1], source)) return null;
    return path.reverse();
  }

  return { distance, pathTo };
}

const graph = [
  ['s','a',4], ['s','b',5], ['a','b',-2],
  ['a','c',4], ['b','c',3], ['c','d',2], ['b','d',6]
];
const result = bellmanFord(graph, 's');
assert.equal(result.distance.get('d'), 7);
assert.deepEqual(result.pathTo('d'), ['s','a','b','c','d']);
assert.deepEqual(result.pathTo('s'), ['s']);
assert.equal(result.pathTo('missing'), null);
const disconnected = bellmanFord([['x','y',2], ['p','q',-1]], 'x');
assert.equal(disconnected.distance.get('q'), Infinity);
assert.throws(
  () => bellmanFord([['s','a',1], ['a','b',-2], ['b','a',-2]], 's'),
  /negative-weight cycle/
);
console.log('Bellman-Ford tests passed');