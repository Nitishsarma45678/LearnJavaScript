'use strict';

/**
 * Offline Dynamic Connectivity
 * ----------------------------
 * Answer connectivity and component-size queries while undirected edges are
 * inserted and removed. The whole operation timeline is known in advance.
 *
 * Technique: put each edge's active time interval into a segment tree over
 * time, then traverse that tree with a rollback disjoint-set union (DSU).
 * Rollback DSU deliberately omits path compression; union-by-size keeps its
 * tree height logarithmic while making every mutation reversible.
 *
 * Operations:
 *   { type: 'add', id, u, v }
 *   { type: 'remove', id }
 *   { type: 'connected', u, v }
 *   { type: 'componentSize', u }
 *   { type: 'componentCount' }
 *
 * Query results are returned in the same order as query operations.
 * Complexity: O((A log T + Q) log V), where A is the number of edge-lifetimes,
 * T is the timeline length, and Q is the number of queries.
 */

class RollbackDSU {
  constructor(size) {
    this.parent = Array.from({ length: size }, (_, index) => index);
    this.size = Array(size).fill(1);
    this.components = size;
    this.history = [];
  }

  find(value) {
    while (this.parent[value] !== value) value = this.parent[value];
    return value;
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
    this.history.push({ child: rootRight, parent: rootLeft, oldParentSize: this.size[rootLeft] });
    this.parent[rootRight] = rootLeft;
    this.size[rootLeft] += this.size[rootRight];
    this.components -= 1;
    return true;
  }

  snapshot() {
    return this.history.length;
  }

  rollback(snapshot) {
    while (this.history.length > snapshot) {
      const change = this.history.pop();
      if (change === null) continue;
      this.parent[change.child] = change.child;
      this.size[change.parent] = change.oldParentSize;
      this.components += 1;
    }
  }

  componentSize(value) {
    return this.size[this.find(value)];
  }
}

function solveDynamicConnectivity(vertexCount, operations) {
  if (!Number.isInteger(vertexCount) || vertexCount < 0) {
    throw new TypeError('vertexCount must be a non-negative integer');
  }
  if (!Array.isArray(operations)) throw new TypeError('operations must be an array');
  const n = operations.length;
  if (n === 0) return [];

  const checkVertex = (vertex) => {
    if (!Number.isInteger(vertex) || vertex < 0 || vertex >= vertexCount) {
      throw new RangeError(`vertex must be an integer in [0, ${vertexCount - 1}]`);
    }
  };
  const active = new Map();
  const intervals = [];

  operations.forEach((operation, time) => {
    if (!operation || typeof operation !== 'object') throw new TypeError(`invalid operation at ${time}`);
    switch (operation.type) {
      case 'add':
        if (operation.id === undefined || operation.id === null) throw new TypeError('edge id is required');
        checkVertex(operation.u);
        checkVertex(operation.v);
        if (active.has(operation.id)) throw new Error(`edge ${String(operation.id)} is already active`);
        active.set(operation.id, { start: time, u: operation.u, v: operation.v });
        break;
      case 'remove': {
        if (!active.has(operation.id)) throw new Error(`edge ${String(operation.id)} is not active`);
        const edge = active.get(operation.id);
        intervals.push({ start: edge.start, end: time, u: edge.u, v: edge.v });
        active.delete(operation.id);
        break;
      }
      case 'connected':
        checkVertex(operation.u);
        checkVertex(operation.v);
        break;
      case 'componentSize':
        checkVertex(operation.u);
        break;
      case 'componentCount':
        break;
      default:
        throw new TypeError(`unknown operation type: ${String(operation.type)}`);
    }
  });

  for (const edge of active.values()) {
    intervals.push({ start: edge.start, end: n, u: edge.u, v: edge.v });
  }

  const tree = Array.from({ length: 4 * n }, () => []);
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
    if (edge.start < edge.end) addInterval(1, 0, n, edge.start, edge.end, edge);
  }

  const dsu = new RollbackDSU(vertexCount);
  const answers = [];
  function visit(node, left, right) {
    const checkpoint = dsu.snapshot();
    for (const edge of tree[node]) dsu.union(edge.u, edge.v);
    if (right - left === 1) {
      const operation = operations[left];
      switch (operation.type) {
        case 'connected':
          answers.push(dsu.find(operation.u) === dsu.find(operation.v));
          break;
        case 'componentSize':
          answers.push(dsu.componentSize(operation.u));
          break;
        case 'componentCount':
          answers.push(dsu.components);
          break;
      }
    } else {
      const middle = (left + right) >> 1;
      visit(node * 2, left, middle);
      visit(node * 2 + 1, middle, right);
    }
    dsu.rollback(checkpoint);
  }
  visit(1, 0, n);
  return answers;
}

function runTests() {
  const assert = require('node:assert/strict');
  const operations = [
    { type: 'add', id: 'ab', u: 0, v: 1 },
    { type: 'add', id: 'bc', u: 1, v: 2 },
    { type: 'connected', u: 0, v: 2 },
    { type: 'componentSize', u: 1 },
    { type: 'remove', id: 'ab' },
    { type: 'connected', u: 0, v: 2 },
    { type: 'componentCount' },
    { type: 'add', id: 'ac', u: 0, v: 2 },
    { type: 'connected', u: 0, v: 2 },
    { type: 'componentSize', u: 0 },
  ];
  assert.deepEqual(solveDynamicConnectivity(4, operations), [true, 3, false, 3, true, 3]);
  assert.deepEqual(solveDynamicConnectivity(0, []), []);
  assert.deepEqual(solveDynamicConnectivity(2, [{ type: 'componentCount' }]), [2]);
  assert.throws(() => solveDynamicConnectivity(2, [{ type: 'remove', id: 'missing' }]), /not active/);
  assert.throws(() => solveDynamicConnectivity(2, [{ type: 'add', id: 1, u: 0, v: 2 }]), /vertex/);

  // Differential test against a simple BFS rebuilt at every query.
  let seed = 0x51f15e;
  const random = (limit) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % limit;
  };
  for (let trial = 0; trial < 80; trial += 1) {
    const vertices = 2 + random(7);
    const timeline = [];
    const live = new Map();
    let nextId = 0;
    const expected = [];
    for (let step = 0; step < 45; step += 1) {
      const choice = random(5);
      if (choice <= 1 && live.size < 8) {
        const id = `e${nextId++}`;
        const edge = { id, u: random(vertices), v: random(vertices) };
        live.set(id, edge);
        timeline.push({ type: 'add', ...edge });
      } else if (choice === 2 && live.size > 0) {
        const id = [...live.keys()][random(live.size)];
        live.delete(id);
        timeline.push({ type: 'remove', id });
      } else {
        const u = random(vertices);
        const v = random(vertices);
        const graph = Array.from({ length: vertices }, () => []);
        for (const edge of live.values()) {
          graph[edge.u].push(edge.v);
          graph[edge.v].push(edge.u);
        }
        const seen = new Set([u]);
        const queue = [u];
        for (let head = 0; head < queue.length; head += 1) {
          for (const next of graph[queue[head]]) {
            if (!seen.has(next)) { seen.add(next); queue.push(next); }
          }
        }
        if (choice === 3) {
          timeline.push({ type: 'connected', u, v });
          expected.push(seen.has(v));
        } else {
          timeline.push({ type: 'componentSize', u });
          expected.push(seen.size);
        }
      }
    }
    assert.deepEqual(solveDynamicConnectivity(vertices, timeline), expected);
  }
}

if (require.main === module) {
  runTests();
  console.log('Offline Dynamic Connectivity: all tests passed');
}

module.exports = { RollbackDSU, solveDynamicConnectivity };
