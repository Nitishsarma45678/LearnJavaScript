'use strict';

/**
 * Exercise: answer connectivity queries while edges are added and removed.
 *
 * Use a segment tree over operation time and a rollback disjoint-set union.
 * The DSU deliberately avoids path compression: union-by-size keeps find()
 * logarithmic while every successful union can be undone in O(1).
 *
 * Operations:
 *   { type: 'add', id, u, v }
 *   { type: 'remove', id }
 *   { type: 'connected', u, v }
 *   { type: 'componentSize', vertex }
 *
 * Edge IDs identify lifetimes, so parallel edges are supported.
 * Run: node daily/2026-11-11/rollbackDynamicConnectivity.js
 */

const assert = require('node:assert/strict');

class RollbackDSU {
  constructor(vertexCount) {
    if (!Number.isInteger(vertexCount) || vertexCount < 0) {
      throw new RangeError('vertexCount must be a non-negative integer');
    }
    this.parent = Array.from({ length: vertexCount }, (_, index) => index);
    this.size = new Array(vertexCount).fill(1);
    this.history = [];
    this.components = vertexCount;
  }

  _check(vertex) {
    if (!Number.isInteger(vertex) || vertex < 0 || vertex >= this.parent.length) {
      throw new RangeError('vertex is outside the DSU');
    }
  }

  find(vertex) {
    this._check(vertex);
    while (this.parent[vertex] !== vertex) vertex = this.parent[vertex];
    return vertex;
  }

  connected(a, b) {
    return this.find(a) === this.find(b);
  }

  componentSize(vertex) {
    return this.size[this.find(vertex)];
  }

  snapshot() {
    return this.history.length;
  }

  union(a, b) {
    let rootA = this.find(a);
    let rootB = this.find(b);
    if (rootA === rootB) return false;

    if (this.size[rootA] < this.size[rootB]) {
      [rootA, rootB] = [rootB, rootA];
    }

    this.history.push({
      childRoot: rootB,
      parentRoot: rootA,
      previousParentSize: this.size[rootA]
    });
    this.parent[rootB] = rootA;
    this.size[rootA] += this.size[rootB];
    this.components -= 1;
    return true;
  }

  rollback(checkpoint) {
    if (!Number.isInteger(checkpoint) || checkpoint < 0 || checkpoint > this.history.length) {
      throw new RangeError('invalid rollback checkpoint');
    }
    while (this.history.length > checkpoint) {
      const change = this.history.pop();
      this.parent[change.childRoot] = change.childRoot;
      this.size[change.parentRoot] = change.previousParentSize;
      this.components += 1;
    }
  }
}

function offlineDynamicConnectivity(vertexCount, operations) {
  if (!Array.isArray(operations)) throw new TypeError('operations must be an array');
  const timeCount = operations.length;
  if (timeCount === 0) return [];

  const active = new Map();
  const intervals = [];

  const checkVertex = vertex => {
    if (!Number.isInteger(vertex) || vertex < 0 || vertex >= vertexCount) {
      throw new RangeError('operation contains an invalid vertex');
    }
  };

  for (let time = 0; time < timeCount; time += 1) {
    const operation = operations[time];
    if (!operation || typeof operation !== 'object') {
      throw new TypeError('each operation must be an object');
    }

    if (operation.type === 'add') {
      const { id, u, v } = operation;
      if (id === undefined || id === null) throw new TypeError('edge add requires an id');
      if (active.has(id)) throw new Error('edge id is already active');
      checkVertex(u);
      checkVertex(v);
      active.set(id, { start: time, u, v });
    } else if (operation.type === 'remove') {
      const edge = active.get(operation.id);
      if (!edge) throw new Error('cannot remove an edge that is not active');
      intervals.push({ start: edge.start, end: time, u: edge.u, v: edge.v });
      active.delete(operation.id);
    } else if (operation.type === 'connected') {
      checkVertex(operation.u);
      checkVertex(operation.v);
    } else if (operation.type === 'componentSize') {
      checkVertex(operation.vertex);
    } else {
      throw new Error('unknown operation type: ' + operation.type);
    }
  }

  for (const edge of active.values()) {
    intervals.push({ start: edge.start, end: timeCount, u: edge.u, v: edge.v });
  }

  const tree = Array.from({ length: timeCount * 4 }, () => []);

  function addInterval(node, left, right, queryLeft, queryRight, edge) {
    if (queryLeft >= right || queryRight <= left) return;
    if (queryLeft <= left && right <= queryRight) {
      tree[node].push(edge);
      return;
    }
    const middle = (left + right) >> 1;
    addInterval(node * 2, left, middle, queryLeft, queryRight, edge);
    addInterval(node * 2 + 1, middle, right, queryLeft, queryRight, edge);
  }

  for (const edge of intervals) {
    if (edge.start < edge.end) {
      addInterval(1, 0, timeCount, edge.start, edge.end, edge);
    }
  }

  const dsu = new RollbackDSU(vertexCount);
  const answers = [];

  function visit(node, left, right) {
    const checkpoint = dsu.snapshot();
    for (const edge of tree[node]) dsu.union(edge.u, edge.v);

    if (right - left === 1) {
      const operation = operations[left];
      if (operation.type === 'connected') {
        answers.push({ time: left, type: operation.type, value: dsu.connected(operation.u, operation.v) });
      } else if (operation.type === 'componentSize') {
        answers.push({ time: left, type: operation.type, value: dsu.componentSize(operation.vertex) });
      }
    } else {
      const middle = (left + right) >> 1;
      visit(node * 2, left, middle);
      visit(node * 2 + 1, middle, right);
    }

    dsu.rollback(checkpoint);
  }

  visit(1, 0, timeCount);
  return answers;
}

function bruteForceAnswers(vertexCount, operations) {
  const active = new Map();
  const answers = [];

  function componentFrom(start) {
    const adjacency = Array.from({ length: vertexCount }, () => []);
    for (const edge of active.values()) {
      adjacency[edge.u].push(edge.v);
      adjacency[edge.v].push(edge.u);
    }
    const seen = new Set([start]);
    const queue = [start];
    for (let head = 0; head < queue.length; head += 1) {
      for (const next of adjacency[queue[head]]) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return seen;
  }

  operations.forEach((operation, time) => {
    if (operation.type === 'add') {
      active.set(operation.id, { u: operation.u, v: operation.v });
    } else if (operation.type === 'remove') {
      active.delete(operation.id);
    } else if (operation.type === 'connected') {
      answers.push({
        time,
        type: operation.type,
        value: componentFrom(operation.u).has(operation.v)
      });
    } else if (operation.type === 'componentSize') {
      answers.push({
        time,
        type: operation.type,
        value: componentFrom(operation.vertex).size
      });
    }
  });
  return answers;
}

function runTests() {
  const dsu = new RollbackDSU(5);
  const base = dsu.snapshot();
  dsu.union(0, 1);
  const joined = dsu.snapshot();
  dsu.union(1, 2);
  assert.equal(dsu.connected(0, 2), true);
  assert.equal(dsu.componentSize(1), 3);
  dsu.rollback(joined);
  assert.equal(dsu.connected(0, 2), false);
  dsu.rollback(base);
  assert.equal(dsu.components, 5);

  const sample = [
    { type: 'add', id: 'ab', u: 0, v: 1 },
    { type: 'add', id: 'bc', u: 1, v: 2 },
    { type: 'connected', u: 0, v: 2 },
    { type: 'remove', id: 'ab' },
    { type: 'connected', u: 0, v: 2 },
    { type: 'componentSize', vertex: 1 },
    { type: 'add', id: 'parallel', u: 1, v: 2 },
    { type: 'add', id: 'loop', u: 2, v: 2 },
    { type: 'componentSize', vertex: 2 }
  ];
  assert.deepEqual(offlineDynamicConnectivity(3, sample), [
    { time: 2, type: 'connected', value: true },
    { time: 4, type: 'connected', value: false },
    { time: 5, type: 'componentSize', value: 2 },
    { time: 8, type: 'componentSize', value: 2 }
  ]);

  assert.throws(() => offlineDynamicConnectivity(2, [
    { type: 'remove', id: 'missing' }
  ]), /not active/);
  assert.throws(() => offlineDynamicConnectivity(2, [
    { type: 'add', id: 'x', u: 0, v: 2 }
  ]), /invalid vertex/);

  let seed = 0x51f15e;
  const random = limit => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed % limit;
  };
  let randomizedQueries = 0;

  for (let trial = 0; trial < 120; trial += 1) {
    const vertices = 2 + random(8);
    const operations = [];
    const activeIds = [];
    let nextId = 0;

    for (let time = 0; time < 90; time += 1) {
      const choice = random(100);
      if (choice < 32) {
        const id = 'edge-' + nextId++;
        const u = random(vertices);
        const v = random(vertices);
        operations.push({ type: 'add', id, u, v });
        activeIds.push(id);
      } else if (choice < 48 && activeIds.length > 0) {
        const index = random(activeIds.length);
        const [id] = activeIds.splice(index, 1);
        operations.push({ type: 'remove', id });
      } else if (choice < 78) {
        operations.push({ type: 'connected', u: random(vertices), v: random(vertices) });
        randomizedQueries += 1;
      } else {
        operations.push({ type: 'componentSize', vertex: random(vertices) });
        randomizedQueries += 1;
      }
    }

    assert.deepEqual(
      offlineDynamicConnectivity(vertices, operations),
      bruteForceAnswers(vertices, operations)
    );
  }

  return { randomizedTrials: 120, randomizedQueries };
}

if (require.main === module) {
  console.log('Rollback dynamic connectivity:', runTests());
}

module.exports = { RollbackDSU, offlineDynamicConnectivity, runTests };
