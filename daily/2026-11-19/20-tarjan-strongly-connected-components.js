'use strict';

/**
 * Exercise: Find strongly connected components in a directed graph with
 * Tarjan's algorithm.
 *
 * The input maps each node to an iterable of outgoing neighbors. Nodes that
 * appear only as neighbors are included. The algorithm runs in O(V + E) time.
 */

function stronglyConnectedComponents(graph) {
  if (!(graph instanceof Map) && (graph === null || typeof graph !== 'object')) {
    throw new TypeError('graph must be a Map or object');
  }

  const entries = graph instanceof Map ? [...graph.entries()] : Object.entries(graph);
  const adjacency = new Map();

  for (const [node, neighbors] of entries) {
    if (neighbors == null || typeof neighbors === 'string' ||
        typeof neighbors[Symbol.iterator] !== 'function') {
      throw new TypeError('each adjacency list must be iterable');
    }
    const list = [...neighbors];
    adjacency.set(node, list);
    for (const neighbor of list) {
      if (!adjacency.has(neighbor)) adjacency.set(neighbor, []);
    }
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
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);

    for (const neighbor of adjacency.get(node)) {
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

  for (const node of adjacency.keys()) {
    if (!index.has(node)) visit(node);
  }
  return components;
}

function runTests() {
  const assert = require('node:assert/strict');
  const graph = new Map([
    ['a', ['b']],
    ['b', ['a', 'c']],
    ['c', ['d', 'e']],
    ['d', ['c']],
    ['e', []],
    ['isolated', []]
  ]);
  const components = stronglyConnectedComponents(graph);
  const normalized = components.map((component) => component.slice().sort().join('')).sort();
  assert.deepEqual(normalized, ['ab', 'cd', 'e', 'isolated']);

  const selfLoop = stronglyConnectedComponents({ node: ['node'] });
  assert.deepEqual(selfLoop, [['node']]);
  assert.deepEqual(stronglyConnectedComponents({ source: ['sink'] }).map((part) => part.sort()), [
    ['sink'], ['source']
  ]);
  assert.deepEqual(stronglyConnectedComponents(new Map()), []);
  assert.throws(() => stronglyConnectedComponents({ broken: null }), /iterable/);
}

if (require.main === module) {
  runTests();
  console.log('Tarjan strongly connected components: all tests passed');
}

module.exports = { stronglyConnectedComponents };
