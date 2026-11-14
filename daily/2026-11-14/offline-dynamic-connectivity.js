'use strict';

/**
 * Offline dynamic connectivity with a segment tree over time and rollback DSU.
 *
 * Operations:
 *   { type: 'add', edgeId, u, v }
 *   { type: 'remove', edgeId }
 *   { type: 'connected', u, v }
 *   { type: 'componentSize', u }
 *   { type: 'components' }
 *
 * Edge IDs distinguish parallel edges. An edge is active from its add
 * operation through the operation immediately before its remove operation.
 * The algorithm answers all queries in O((m + q) log m * alpha*) time, where
 * rollback DSU deliberately omits path compression to make undo possible.
 */

class RollbackDisjointSet {
  constructor(vertexCount) {
    this.parent = Array.from({ length: vertexCount }, (_, index) => index);
    this.size = Array(vertexCount).fill(1);
    this.components = vertexCount;
    this.history = [];
  }

  find(vertex) {
    while (this.parent[vertex] !== vertex) vertex = this.parent[vertex];
    return vertex;
  }

  union(left, right) {
    let rootLeft = this.find(left);
    let rootRight = this.find(right);

    if (rootLeft === rootRight) {
      this.history.push(null);
      return false;
    }

    if (this.size[rootLeft] < this.size[rootRight]) {
      [rootLeft, rootRight] = [rootRight, rootLeft];
    }

    this.history.push({
      child: rootRight,
      parent: rootLeft,
      previousSize: this.size[rootLeft]
    });
    this.parent[rootRight] = rootLeft;
    this.size[rootLeft] += this.size[rootRight];
    this.components -= 1;
    return true;
  }

  componentSize(vertex) {
    return this.size[this.find(vertex)];
  }

  snapshot() {
    return this.history.length;
  }

  rollback(snapshot) {
    if (!Number.isInteger(snapshot) || snapshot < 0 ||
        snapshot > this.history.length) {
      throw new RangeError('Invalid rollback snapshot');
    }

    while (this.history.length > snapshot) {
      const change = this.history.pop();
      if (change === null) continue;
      this.parent[change.child] = change.child;
      this.size[change.parent] = change.previousSize;
      this.components += 1;
    }
  }
}

function validateVertex(vertex, count) {
  if (!Number.isInteger(vertex) || vertex < 0 || vertex >= count) {
    throw new RangeError('Vertex is outside the graph');
  }
}

function prepareIntervals(vertexCount, operations) {
  if (!Number.isInteger(vertexCount) || vertexCount < 0) {
    throw new RangeError('vertexCount must be a non-negative integer');
  }
  if (!Array.isArray(operations)) throw new TypeError('operations must be an array');

  const active = new Map();
  const intervals = [];

  operations.forEach((operation, index) => {
    if (!operation || typeof operation !== 'object') {
      throw new TypeError('Operation at index ' + index + ' must be an object');
    }

    switch (operation.type) {
      case 'add': {
        if (operation.edgeId === undefined || operation.edgeId === null) {
          throw new TypeError('add requires edgeId');
        }
        if (active.has(operation.edgeId)) {
          throw new Error('Edge ID is already active: ' + operation.edgeId);
        }
        validateVertex(operation.u, vertexCount);
        validateVertex(operation.v, vertexCount);
        active.set(operation.edgeId, {
          start: index,
          u: operation.u,
          v: operation.v,
          edgeId: operation.edgeId
        });
        break;
      }

      case 'remove': {
        if (!active.has(operation.edgeId)) {
          throw new Error('Cannot remove an inactive edge: ' + operation.edgeId);
        }
        const edge = active.get(operation.edgeId);
        active.delete(operation.edgeId);
        intervals.push({
          start: edge.start,
          end: index,
          u: edge.u,
          v: edge.v,
          edgeId: edge.edgeId
        });
        break;
      }

      case 'connected':
        validateVertex(operation.u, vertexCount);
        validateVertex(operation.v, vertexCount);
        break;

      case 'componentSize':
        validateVertex(operation.u, vertexCount);
        break;

      case 'components':
        break;

      default:
        throw new SyntaxError('Unknown operation type at index ' + index);
    }
  });

  for (const edge of active.values()) {
    intervals.push({
      start: edge.start,
      end: operations.length,
      u: edge.u,
      v: edge.v,
      edgeId: edge.edgeId
    });
  }

  return intervals;
}

function offlineDynamicConnectivity(vertexCount, operations) {
  const intervals = prepareIntervals(vertexCount, operations);
  const timeCount = operations.length;
  if (timeCount === 0) return [];

  const tree = Array.from({ length: timeCount * 4 + 4 }, () => []);

  function addInterval(node, left, right, queryLeft, queryRight, edge) {
    if (queryLeft >= right || queryRight <= left) return;
    if (queryLeft <= left && right <= queryRight) {
      tree[node].push(edge);
      return;
    }

    const middle = Math.floor((left + right) / 2);
    addInterval(node * 2, left, middle, queryLeft, queryRight, edge);
    addInterval(node * 2 + 1, middle, right, queryLeft, queryRight, edge);
  }

  for (const edge of intervals) {
    if (edge.start < edge.end) {
      addInterval(1, 0, timeCount, edge.start, edge.end, edge);
    }
  }

  const dsu = new RollbackDisjointSet(vertexCount);
  const answers = [];

  function visit(node, left, right) {
    const snapshot = dsu.snapshot();
    for (const edge of tree[node]) dsu.union(edge.u, edge.v);

    if (right - left === 1) {
      const operation = operations[left];
      if (operation.type === 'connected') {
        answers.push({
          index: left,
          type: operation.type,
          value: dsu.find(operation.u) === dsu.find(operation.v)
        });
      } else if (operation.type === 'componentSize') {
        answers.push({
          index: left,
          type: operation.type,
          value: dsu.componentSize(operation.u)
        });
      } else if (operation.type === 'components') {
        answers.push({
          index: left,
          type: operation.type,
          value: dsu.components
        });
      }
    } else {
      const middle = Math.floor((left + right) / 2);
      visit(node * 2, left, middle);
      visit(node * 2 + 1, middle, right);
    }

    dsu.rollback(snapshot);
  }

  visit(1, 0, timeCount);
  return answers;
}

function runTests() {
  const assert = require('node:assert/strict');

  const sample = [
    { type: 'add', edgeId: 'a', u: 0, v: 1 },
    { type: 'add', edgeId: 'b', u: 0, v: 1 },
    { type: 'add', edgeId: 'loop', u: 1, v: 1 },
    { type: 'connected', u: 0, v: 1 },
    { type: 'remove', edgeId: 'a' },
    { type: 'connected', u: 0, v: 1 },
    { type: 'remove', edgeId: 'b' },
    { type: 'connected', u: 0, v: 1 },
    { type: 'componentSize', u: 1 },
    { type: 'components' }
  ];
  assert.deepEqual(offlineDynamicConnectivity(3, sample), [
    { index: 3, type: 'connected', value: true },
    { index: 5, type: 'connected', value: true },
    { index: 7, type: 'connected', value: false },
    { index: 8, type: 'componentSize', value: 1 },
    { index: 9, type: 'components', value: 3 }
  ]);

  let seed = 987654321;
  const randomInt = (limit) => {
    seed = (1103515245 * seed + 12345) >>> 0;
    return seed % limit;
  };

  for (let trial = 0; trial < 80; trial += 1) {
    const count = 2 + randomInt(6);
    const operations = [];
    const active = new Map();
    let nextId = 0;

    for (let step = 0; step < 70; step += 1) {
      const choice = randomInt(5);
      if (choice <= 1 || active.size === 0) {
        const edgeId = 'edge-' + nextId++;
        const edge = { u: randomInt(count), v: randomInt(count) };
        active.set(edgeId, edge);
        operations.push({ type: 'add', edgeId, ...edge });
      } else if (choice === 2) {
        const edgeId = [...active.keys()][randomInt(active.size)];
        active.delete(edgeId);
        operations.push({ type: 'remove', edgeId });
      } else if (choice === 3) {
        operations.push({
          type: 'connected',
          u: randomInt(count),
          v: randomInt(count)
        });
      } else {
        operations.push({ type: 'componentSize', u: randomInt(count) });
      }
    }
    if (randomInt(2) === 0) operations.push({ type: 'components' });

    const expected = [];
    const currentEdges = new Map();

    function componentFrom(start) {
      const adjacency = Array.from({ length: count }, () => []);
      for (const edge of currentEdges.values()) {
        adjacency[edge.u].push(edge.v);
        adjacency[edge.v].push(edge.u);
      }
      const seen = new Set([start]);
      const stack = [start];
      while (stack.length) {
        const vertex = stack.pop();
        for (const next of adjacency[vertex]) {
          if (!seen.has(next)) {
            seen.add(next);
            stack.push(next);
          }
        }
      }
      return seen;
    }

    operations.forEach((operation, index) => {
      if (operation.type === 'add') {
        currentEdges.set(operation.edgeId, { u: operation.u, v: operation.v });
      } else if (operation.type === 'remove') {
        currentEdges.delete(operation.edgeId);
      } else if (operation.type === 'connected') {
        expected.push({
          index,
          type: operation.type,
          value: componentFrom(operation.u).has(operation.v)
        });
      } else if (operation.type === 'componentSize') {
        expected.push({
          index,
          type: operation.type,
          value: componentFrom(operation.u).size
        });
      } else if (operation.type === 'components') {
        const unseen = new Set(Array.from({ length: count }, (_, i) => i));
        let components = 0;
        while (unseen.size) {
          const start = unseen.values().next().value;
          for (const vertex of componentFrom(start)) unseen.delete(vertex);
          components += 1;
        }
        expected.push({ index, type: operation.type, value: components });
      }
    });

    assert.deepEqual(offlineDynamicConnectivity(count, operations), expected);
  }

  assert.throws(() => offlineDynamicConnectivity(2, [
    { type: 'remove', edgeId: 'missing' }
  ]), /inactive edge/);
  assert.throws(() => offlineDynamicConnectivity(2, [
    { type: 'add', edgeId: 'x', u: 0, v: 1 },
    { type: 'add', edgeId: 'x', u: 0, v: 1 }
  ]), /already active/);
  assert.deepEqual(offlineDynamicConnectivity(0, []), []);

  console.log('Offline dynamic connectivity: all tests passed');
}

module.exports = {
  offlineDynamicConnectivity,
  RollbackDisjointSet
};

if (require.main === module) runTests();
