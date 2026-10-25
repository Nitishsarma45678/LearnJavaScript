/**
 * Kahn's algorithm for topological ordering.
 * Throws if the directed graph contains a cycle.
 */
function topologicalSort(graph) {
  const indegree = new Map();
  for (const [node, neighbors] of graph) {
    if (!indegree.has(node)) indegree.set(node, 0);
    for (const next of neighbors) {
      if (!indegree.has(next)) indegree.set(next, 0);
      indegree.set(next, indegree.get(next) + 1);
    }
  }

  const queue = [...indegree].filter(([, degree]) => degree === 0).map(([node]) => node);
  const order = [];
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head];
    order.push(node);
    for (const next of graph.get(node) ?? []) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  if (order.length !== indegree.size) throw new Error("Graph contains a cycle");
  return order;
}

const graph = new Map([["compile", ["test"]], ["lint", ["test"]], ["test", ["deploy"]], ["deploy", []]]);
const order = topologicalSort(graph);
console.assert(order.indexOf("compile") < order.indexOf("test"));
console.assert(order.indexOf("test") < order.indexOf("deploy"));
try { topologicalSort(new Map([["a", ["b"]], ["b", ["a"]]])); throw new Error("Expected cycle"); }
catch (error) { console.assert(error.message === "Graph contains a cycle"); }
console.log("topological sort practice passed");
