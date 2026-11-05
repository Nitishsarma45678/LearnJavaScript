"use strict";

const assert = require("node:assert/strict");

class RollbackDisjointSet {
  constructor(size) {
    if (!Number.isInteger(size) || size < 0) throw new RangeError("size must be non-negative");
    this.parent = Int32Array.from({ length: size }, (_, i) => i);
    this.componentSize = new Int32Array(size).fill(1);
    this.components = size;
    this.history = [];
  }

  find(vertex) {
    this._check(vertex);
    // Deliberately no path compression: every mutation must be reversible.
    while (this.parent[vertex] !== vertex) vertex = this.parent[vertex];
    return vertex;
  }

  connected(a, b) {
    return this.find(a) === this.find(b);
  }

  union(a, b) {
    let rootA = this.find(a);
    let rootB = this.find(b);
    if (rootA === rootB) return false;
    if (this.componentSize[rootA] < this.componentSize[rootB]) {
      [rootA, rootB] = [rootB, rootA];
    }
    this.history.push([rootB, rootA, this.componentSize[rootA]]);
    this.parent[rootB] = rootA;
    this.componentSize[rootA] += this.componentSize[rootB];
    this.components--;
    return true;
  }

  snapshot() {
    return this.history.length;
  }

  rollback(snapshot) {
    if (!Number.isInteger(snapshot) || snapshot < 0 || snapshot > this.history.length) {
      throw new RangeError("invalid rollback snapshot");
    }
    while (this.history.length > snapshot) {
      const [child, root, oldSize] = this.history.pop();
      this.parent[child] = child;
      this.componentSize[root] = oldSize;
      this.components++;
    }
  }

  _check(vertex) {
    if (!Number.isInteger(vertex) || vertex < 0 || vertex >= this.parent.length) {
      throw new RangeError("vertex is out of range");
    }
  }
}

/**
 * Answers connectivity queries in a graph whose edges are added and removed.
 *
 * Operations are processed offline. Each edge lifetime is stored in a segment
 * tree over time; a DFS applies edges to a rollback DSU and restores the exact
 * previous state when leaving a time interval. Complexity is O((q + k) log q
 * log n), where k is the number of edge lifetimes.
 *
 * Operations:
 *   { type: "add", id, u, v }
 *   { type: "remove", id }
 *   { type: "connected", u, v }
 *   { type: "components" }
 */
function solveDynamicConnectivity(vertexCount, operations) {
  if (!Number.isInteger(vertexCount) || vertexCount < 0) {
    throw new RangeError("vertexCount must be non-negative");
  }
  if (!Array.isArray(operations)) throw new TypeError("operations must be an array");
  const timeCount = operations.length;
  if (timeCount === 0) return [];

  const active = new Map();
  const intervals = [];
  const checkVertex = vertex => {
    if (!Number.isInteger(vertex) || vertex < 0 || vertex >= vertexCount) {
      throw new RangeError("operation vertex is out of range");
    }
  };

  for (let time = 0; time < timeCount; time++) {
    const operation = operations[time];
    if (!operation || typeof operation !== "object") throw new TypeError("invalid operation");
    if (operation.type === "add") {
      if (operation.id === undefined || active.has(operation.id)) {
        throw new Error("edge id is missing or already active");
      }
      checkVertex(operation.u);
      checkVertex(operation.v);
      active.set(operation.id, { start: time, u: operation.u, v: operation.v });
    } else if (operation.type === "remove") {
      if (!active.has(operation.id)) throw new Error("cannot remove an inactive edge");
      const edge = active.get(operation.id);
      intervals.push({ start: edge.start, end: time, u: edge.u, v: edge.v });
      active.delete(operation.id);
    } else if (operation.type === "connected") {
      checkVertex(operation.u);
      checkVertex(operation.v);
    } else if (operation.type !== "components") {
      throw new Error("unknown operation type: " + operation.type);
    }
  }
  for (const edge of active.values()) {
    intervals.push({ start: edge.start, end: timeCount, u: edge.u, v: edge.v });
  }

  const timeTree = Array.from({ length: timeCount * 4 }, () => []);
  function addInterval(node, left, right, queryLeft, queryRight, edge) {
    if (queryLeft >= right || queryRight <= left) return;
    if (queryLeft <= left && right <= queryRight) {
      timeTree[node].push(edge);
      return;
    }
    const middle = (left + right) >>> 1;
    addInterval(node * 2, left, middle, queryLeft, queryRight, edge);
    addInterval(node * 2 + 1, middle, right, queryLeft, queryRight, edge);
  }

  for (const edge of intervals) {
    if (edge.start < edge.end) {
      addInterval(1, 0, timeCount, edge.start, edge.end, [edge.u, edge.v]);
    }
  }

  const dsu = new RollbackDisjointSet(vertexCount);
  const answers = [];
  function visit(node, left, right) {
    const checkpoint = dsu.snapshot();
    for (const [u, v] of timeTree[node]) dsu.union(u, v);

    if (right - left === 1) {
      const operation = operations[left];
      if (operation.type === "connected") {
        answers.push({
          index: left,
          type: operation.type,
          value: dsu.connected(operation.u, operation.v)
        });
      } else if (operation.type === "components") {
        answers.push({ index: left, type: operation.type, value: dsu.components });
      }
    } else {
      const middle = (left + right) >>> 1;
      visit(node * 2, left, middle);
      visit(node * 2 + 1, middle, right);
    }
    dsu.rollback(checkpoint);
  }

  visit(1, 0, timeCount);
  return answers;
}

function runTests() {
  const operations = [
    { type: "components" },
    { type: "add", id: "ab", u: 0, v: 1 },
    { type: "connected", u: 0, v: 1 },
    { type: "add", id: "bc", u: 1, v: 2 },
    { type: "connected", u: 0, v: 2 },
    { type: "components" },
    { type: "remove", id: "ab" },
    { type: "connected", u: 0, v: 2 },
    { type: "connected", u: 1, v: 2 },
    { type: "components" },
    { type: "remove", id: "bc" },
    { type: "components" }
  ];
  assert.deepEqual(solveDynamicConnectivity(4, operations), [
    { index: 0, type: "components", value: 4 },
    { index: 2, type: "connected", value: true },
    { index: 4, type: "connected", value: true },
    { index: 5, type: "components", value: 2 },
    { index: 7, type: "connected", value: false },
    { index: 8, type: "connected", value: true },
    { index: 9, type: "components", value: 3 },
    { index: 11, type: "components", value: 4 }
  ]);

  const dsu = new RollbackDisjointSet(5);
  const base = dsu.snapshot();
  dsu.union(0, 1);
  const joined = dsu.snapshot();
  dsu.union(1, 2);
  assert.equal(dsu.components, 3);
  dsu.rollback(joined);
  assert.equal(dsu.connected(0, 1), true);
  assert.equal(dsu.connected(0, 2), false);
  dsu.rollback(base);
  assert.equal(dsu.components, 5);

  assert.throws(() => solveDynamicConnectivity(2, [
    { type: "remove", id: "missing" }
  ]), /inactive/);
  assert.throws(() => solveDynamicConnectivity(2, [
    { type: "add", id: "x", u: 0, v: 1 },
    { type: "add", id: "x", u: 0, v: 1 }
  ]), /already active/);
  console.log("Offline dynamic connectivity tests passed.");
}

if (require.main === module) runTests();

module.exports = { RollbackDisjointSet, solveDynamicConnectivity };
