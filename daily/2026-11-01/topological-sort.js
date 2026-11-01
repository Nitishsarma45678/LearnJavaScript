const assert = require('node:assert/strict');

function topologicalSort(graph) {
  const nodes = new Set(Object.keys(graph));
  for (const edges of Object.values(graph)) for (const v of edges) nodes.add(String(v));
  const indegree = new Map([...nodes].map(n => [n, 0]));
  for (const edges of Object.values(graph)) for (const v of edges) indegree.set(String(v), indegree.get(String(v)) + 1);
  const queue = [...nodes].filter(n => indegree.get(n) === 0);
  const order = [];
  for (let i = 0; i < queue.length; i++) {
    const u = queue[i]; order.push(u);
    for (const v of graph[u] || []) {
      const key = String(v), next = indegree.get(key) - 1;
      indegree.set(key, next);
      if (next === 0) queue.push(key);
    }
  }
  if (order.length !== nodes.size) throw new Error('Graph contains a cycle');
  return order;
}

const order = topologicalSort({compile:['test'], lint:['test'], test:['package'], package:[]});
const pos = new Map(order.map((v,i) => [v,i]));
for (const [u, vs] of Object.entries({compile:['test'],lint:['test'],test:['package']}))
  for (const v of vs) assert.ok(pos.get(u) < pos.get(v));
assert.throws(() => topologicalSort({a:['b'], b:['a']}), /cycle/);
assert.deepEqual(topologicalSort({}), []);
console.log('Topological sort tests passed');