/**
 * Strongly Connected Components + Condensation DAG
 *
 * Exercise:
 * Implement Tarjan's algorithm for a directed graph. Return SCCs, a vertex-to-
 * component index, the deduplicated condensation DAG, and a topological order
 * of that DAG. Include vertices that appear only as neighbors.
 *
 * Complexity: O(V + E) time and O(V + E) space.
 * Graph input may be a Map<vertex, vertex[]> or a plain object of string keys.
 */

'use strict';

function normalizeGraph(graph) {
  const adjacency = new Map();
  if (graph instanceof Map) {
    for (const [vertex, neighbors] of graph) {
      if (!Array.isArray(neighbors)) throw new TypeError('Each adjacency list must be an array');
      adjacency.set(vertex, [...neighbors]);
    }
  } else if (graph && typeof graph === 'object' && !Array.isArray(graph)) {
    for (const [vertex, neighbors] of Object.entries(graph)) {
      if (!Array.isArray(neighbors)) throw new TypeError('Each adjacency list must be an array');
      adjacency.set(vertex, [...neighbors]);
    }
  } else {
    throw new TypeError('Graph must be a Map or a plain adjacency object');
  }

  for (const neighbors of adjacency.values()) {
    for (const neighbor of neighbors) {
      if (!adjacency.has(neighbor)) adjacency.set(neighbor, []);
    }
  }
  return adjacency;
}

function stronglyConnectedComponents(graph) {
  const adjacency = normalizeGraph(graph);
  const index = new Map();
  const lowLink = new Map();
  const stack = [];
  const onStack = new Set();
  const components = [];
  let nextIndex = 0;

  function visit(vertex) {
    index.set(vertex, nextIndex);
    lowLink.set(vertex, nextIndex);
    nextIndex += 1;
    stack.push(vertex);
    onStack.add(vertex);

    for (const neighbor of adjacency.get(vertex)) {
      if (!index.has(neighbor)) {
        visit(neighbor);
        lowLink.set(vertex, Math.min(lowLink.get(vertex), lowLink.get(neighbor)));
      } else if (onStack.has(neighbor)) {
        lowLink.set(vertex, Math.min(lowLink.get(vertex), index.get(neighbor)));
      }
    }

    if (lowLink.get(vertex) === index.get(vertex)) {
      const component = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        component.push(member);
      } while (member !== vertex);
      components.push(component);
    }
  }

  for (const vertex of adjacency.keys()) {
    if (!index.has(vertex)) visit(vertex);
  }

  const componentOf = new Map();
  components.forEach((component, componentId) => {
    for (const vertex of component) componentOf.set(vertex, componentId);
  });

  const condensation = new Map(components.map((_, id) => [id, new Set()]));
  const indegree = new Array(components.length).fill(0);

  for (const [from, neighbors] of adjacency) {
    const fromId = componentOf.get(from);
    for (const to of neighbors) {
      const toId = componentOf.get(to);
      if (fromId !== toId && !condensation.get(fromId).has(toId)) {
        condensation.get(fromId).add(toId);
        indegree[toId] += 1;
      }
    }
  }

  const queue = [];
  indegree.forEach((degree, id) => { if (degree === 0) queue.push(id); });
  const topologicalOrder = [];
  for (let head = 0; head < queue.length; head += 1) {
    const id = queue[head];
    topologicalOrder.push(id);
    for (const next of condensation.get(id)) {
      indegree[next] -= 1;
      if (indegree[next] === 0) queue.push(next);
    }
  }

  if (topologicalOrder.length !== components.length) {
    throw new Error('Internal error: SCC condensation must be acyclic');
  }

  const cyclicComponents = components
    .map((members, id) => ({
      id,
      members,
      cyclic: members.length > 1 || adjacency.get(members[0]).includes(members[0])
    }))
    .filter(item => item.cyclic);

  return {
    components,
    componentOf,
    condensation,
    topologicalOrder,
    cyclicComponents
  };
}

function runTests() {
  const assert = require('node:assert/strict');
  const graph = new Map([
    ['A', ['B']],
    ['B', ['A', 'C']],
    ['C', ['D']],
    ['D', ['C', 'E']],
    ['E', ['E']],
    ['F', []]
  ]);
  const result = stronglyConnectedComponents(graph);
  const groups = result.components.map(group => group.slice().sort().join('')).sort();
  assert.deepEqual(groups, ['AB', 'CD', 'E', 'F']);
  assert.equal(result.componentOf.size, 6);
  assert.equal(result.cyclicComponents.length, 3);

  const position = new Map(result.topologicalOrder.map((id, i) => [id, i]));
  for (const [from, targets] of result.condensation) {
    for (const to of targets) assert.ok(position.get(from) < position.get(to));
  }

  const objectGraph = stronglyConnectedComponents({
    start: ['middle'],
    middle: ['finish'],
    finish: ['middle'],
    isolated: []
  });
  assert.equal(objectGraph.components.length, 3);
  assert.equal(objectGraph.componentOf.has('middle'), true);

  const empty = stronglyConnectedComponents(new Map());
  assert.deepEqual(empty.components, []);
  assert.deepEqual(empty.topologicalOrder, []);
  assert.throws(() => stronglyConnectedComponents(null), TypeError);
  console.log('Tarjan SCC tests passed');
}

if (require.main === module) runTests();

module.exports = { stronglyConnectedComponents };
