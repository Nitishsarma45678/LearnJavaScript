/**
 * Tarjan's algorithm: partition a directed graph into strongly connected
 * components in O(V + E) time.
 *
 * Graph format: Map<node, iterable-of-neighbors>. Neighbors absent as keys
 * are treated as terminal nodes with no outgoing edges.
 */
function stronglyConnectedComponents(graph) {
  const nodes = new Set(graph.keys());
  for (const neighbors of graph.values()) {
    for (const neighbor of neighbors) nodes.add(neighbor);
  }

  let nextIndex = 0;
  const index = new Map();
  const lowLink = new Map();
  const stack = [];
  const onStack = new Set();
  const components = [];

  function visit(node) {
    index.set(node, nextIndex);
    lowLink.set(node, nextIndex);
    nextIndex++;
    stack.push(node);
    onStack.add(node);

    for (const neighbor of graph.get(node) ?? []) {
      if (!index.has(neighbor)) {
        visit(neighbor);
        lowLink.set(node, Math.min(lowLink.get(node), lowLink.get(neighbor)));
      } else if (onStack.has(neighbor)) {
        lowLink.set(node, Math.min(lowLink.get(node), index.get(neighbor)));
      }
    }

    if (lowLink.get(node) === index.get(node)) {
      const component = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      components.push(component);
    }
  }

  for (const node of nodes) {
    if (!index.has(node)) visit(node);
  }
  return components;
}

const graph = new Map([
  [1, [2]],
  [2, [3, 4]],
  [3, [1]],
  [4, [5]],
  [5, [4, 6]],
  [6, []]
]);
const normalize = groups => groups.map(group => group.sort()).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
console.assert(JSON.stringify(normalize(stronglyConnectedComponents(graph))) ===
  JSON.stringify(normalize([[1, 2, 3], [4, 5], [6]])));
console.assert(stronglyConnectedComponents(new Map()).length === 0);
console.log("Tarjan SCC practice passed");
