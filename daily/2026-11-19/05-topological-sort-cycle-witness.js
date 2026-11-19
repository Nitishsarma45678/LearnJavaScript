'use strict';

/**
 * Exercise: Topologically order a dependency graph and report an actual cycle
 * when no valid ordering exists.
 *
 * Input maps each node to the nodes it depends on. Dependency-only nodes are
 * included automatically. The result places every prerequisite before the
 * node that requires it.
 */

class CycleError extends Error {
  constructor(cycle) {
    super('dependency cycle: ' + cycle.join(' -> '));
    this.name = 'CycleError';
    this.cycle = cycle;
  }
}

function topologicalSort(graph) {
  if (!(graph instanceof Map) && (graph === null || typeof graph !== 'object')) {
    throw new TypeError('graph must be a Map or object');
  }

  const entries = graph instanceof Map ? [...graph.entries()] : Object.entries(graph);
  const nodes = new Set();
  const dependencies = new Map();

  for (const [node, required] of entries) {
    if (typeof required === 'string' || required == null || typeof required[Symbol.iterator] !== 'function') {
      throw new TypeError('each dependency list must be iterable');
    }
    const list = [...required];
    nodes.add(node);
    dependencies.set(node, list);
    for (const dependency of list) nodes.add(dependency);
  }

  const dependents = new Map([...nodes].map((node) => [node, []]));
  const indegree = new Map([...nodes].map((node) => [node, 0]));

  for (const node of nodes) {
    const required = dependencies.get(node) || [];
    indegree.set(node, required.length);
    for (const dependency of required) dependents.get(dependency).push(node);
  }

  const queue = [];
  for (const node of nodes) if (indegree.get(node) === 0) queue.push(node);

  const order = [];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const node = queue[cursor];
    order.push(node);
    for (const dependent of dependents.get(node)) {
      const next = indegree.get(dependent) - 1;
      indegree.set(dependent, next);
      if (next === 0) queue.push(dependent);
    }
  }

  if (order.length === nodes.size) return order;

  const remaining = new Set([...nodes].filter((node) => indegree.get(node) > 0));
  const state = new Map();
  const stack = [];
  let cycle = null;

  function findCycle(node) {
    state.set(node, 1);
    stack.push(node);
    for (const dependency of dependencies.get(node) || []) {
      if (!remaining.has(dependency)) continue;
      if (state.get(dependency) === 1) {
        const start = stack.indexOf(dependency);
        cycle = stack.slice(start).concat(dependency);
        return true;
      }
      if (!state.has(dependency) && findCycle(dependency)) return true;
    }
    stack.pop();
    state.set(node, 2);
    return false;
  }

  for (const node of remaining) {
    if (!state.has(node) && findCycle(node)) break;
  }
  throw new CycleError(cycle || [...remaining]);
}

function runTests() {
  const assert = require('node:assert/strict');
  const graph = new Map([
    ['build', ['compile', 'test']],
    ['compile', ['install']],
    ['test', ['install']],
    ['install', []]
  ]);
  const order = topologicalSort(graph);
  const position = new Map(order.map((node, index) => [node, index]));
  for (const [node, required] of graph) {
    for (const dependency of required) {
      assert.ok(position.get(dependency) < position.get(node));
    }
  }

  assert.deepEqual(topologicalSort({ app: ['lib'], lib: [], docs: [] }).slice(0, 2), ['lib', 'docs']);
  assert.deepEqual(topologicalSort(new Map([['only', []]])), ['only']);

  assert.throws(
    () => topologicalSort({ a: ['b'], b: ['c'], c: ['a'] }),
    (error) => error instanceof CycleError &&
      error.cycle[0] === error.cycle[error.cycle.length - 1] &&
      error.cycle.length === 4
  );
  assert.throws(() => topologicalSort({ broken: null }), /iterable/);
}

if (require.main === module) {
  runTests();
  console.log('Topological sorting: all tests passed');
}

module.exports = { topologicalSort, CycleError };
