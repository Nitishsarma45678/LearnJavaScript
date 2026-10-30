'use strict';

/**
 * Tarjan's strongly connected components algorithm.
 * Accepts a Map or plain object adjacency list. Vertices that occur only as
 * neighbors are included automatically. Returns SCCs plus their condensation
 * DAG, with every inter-component edge deduplicated.
 */
function stronglyConnectedComponents(graph) {
  if (!(graph instanceof Map) &&
      (graph === null || typeof graph !== 'object' || Array.isArray(graph))) {
    throw new TypeError('graph must be a Map or adjacency-list object');
  }

  const adjacency = graph instanceof Map
    ? new Map(graph)
    : new Map(Object.entries(graph));

  for (const [vertex, neighbors] of adjacency) {
    if (neighbors == null || typeof neighbors[Symbol.iterator] !== 'function') {
      throw new TypeError(`neighbors of ${String(vertex)} must be iterable`);
    }
    adjacency.set(vertex, Array.from(neighbors));
  }
  for (const neighbors of adjacency.values()) {
    for (const neighbor of neighbors) {
      if (!adjacency.has(neighbor)) adjacency.set(neighbor, []);
    }
  }

  let nextIndex = 0;
  const index = new Map();
  const lowLink = new Map();
  const stack = [];
  const onStack = new Set();
  const components = [];

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
  components.forEach((component, componentIndex) => {
    for (const vertex of component) componentOf.set(vertex, componentIndex);
  });

  const condensation = components.map(() => new Set());
  for (const [vertex, neighbors] of adjacency) {
    const from = componentOf.get(vertex);
    for (const neighbor of neighbors) {
      const to = componentOf.get(neighbor);
      if (from !== to) condensation[from].add(to);
    }
  }

  return {
    components,
    componentOf,
    condensation: condensation.map(edges => [...edges])
  };
}

// ------------------------------- Tests ----------------------------------
if (require.main === module) {
  const assert = require('node:assert/strict');
  const graph = new Map([
    ['A', ['B']], ['B', ['C', 'D']], ['C', ['A']],
    ['D', ['E']], ['E', ['D']], ['F', ['E']], ['G', []]
  ]);
  const result = stronglyConnectedComponents(graph);
  const normalized = result.components.map(group => group.slice().sort()).sort((a, b) => a[0].localeCompare(b[0]));
  assert.deepEqual(normalized, [['A', 'B', 'C'], ['D', 'E'], ['F'], ['G']]);
  assert.equal(result.componentOf.get('A'), result.componentOf.get('C'));
  assert.notEqual(result.componentOf.get('A'), result.componentOf.get('D'));
  assert.deepEqual(stronglyConnectedComponents({ x: ['y'], y: [] }).components.length, 2);
  assert.throws(() => stronglyConnectedComponents({ bad: 42 }), /iterable/);

  const dagEdges = result.condensation.flat();
  assert.equal(new Set(dagEdges.map((to, from) => `${from}:${to}`)).size, dagEdges.length);
  console.log('Tarjan SCC tests passed');
}

module.exports = { stronglyConnectedComponents };
