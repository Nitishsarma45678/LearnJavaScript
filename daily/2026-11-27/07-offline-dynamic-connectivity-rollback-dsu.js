'use strict';

// Exercise: answer connectivity queries in a graph whose edges are added and
// removed over time. A segment tree over time plus rollback DSU avoids rebuilding
// connected components for every query.

class RollbackDSU {
  constructor(size) {
    this.parent = Array.from({ length: size }, (_, i) => i);
    this.size = Array(size).fill(1);
    this.history = [];
  }
  find(x) {
    while (this.parent[x] !== x) x = this.parent[x];
    return x;
  }
  union(a, b) {
    a = this.find(a);
    b = this.find(b);
    if (a === b) {
      this.history.push(null);
      return false;
    }
    if (this.size[a] < this.size[b]) [a, b] = [b, a];
    this.history.push([b, a, this.size[a]]);
    this.parent[b] = a;
    this.size[a] += this.size[b];
    return true;
  }
  checkpoint() { return this.history.length; }
  rollback(checkpoint) {
    while (this.history.length > checkpoint) {
      const change = this.history.pop();
      if (!change) continue;
      const [child, root, oldSize] = change;
      this.parent[child] = child;
      this.size[root] = oldSize;
    }
  }
  connected(a, b) { return this.find(a) === this.find(b); }
}

function offlineDynamicConnectivity(vertexCount, operations) {
  const n = operations.length;
  const tree = Array.from({ length: Math.max(1, n * 4) }, () => []);
  const active = new Map();
  const edgeKey = (a, b) => a < b ? a + ':' + b : b + ':' + a;
  const addInterval = (ql, qr, edge, node = 1, left = 0, right = n) => {
    if (ql >= right || qr <= left || ql >= qr) return;
    if (ql <= left && right <= qr) {
      tree[node].push(edge);
      return;
    }
    const mid = (left + right) >> 1;
    addInterval(ql, qr, edge, node * 2, left, mid);
    addInterval(ql, qr, edge, node * 2 + 1, mid, right);
  };

  operations.forEach((op, time) => {
    if (op.type === 'add') {
      const key = edgeKey(op.u, op.v);
      if (active.has(key)) throw new Error('Edge is already active: ' + key);
      active.set(key, { start: time, edge: [op.u, op.v] });
    } else if (op.type === 'remove') {
      const key = edgeKey(op.u, op.v);
      const entry = active.get(key);
      if (!entry) throw new Error('Cannot remove inactive edge: ' + key);
      addInterval(entry.start, time, entry.edge);
      active.delete(key);
    } else if (op.type !== 'connected') {
      throw new TypeError('Unknown operation: ' + op.type);
    }
  });
  for (const entry of active.values()) addInterval(entry.start, n, entry.edge);

  const dsu = new RollbackDSU(vertexCount);
  const answers = [];
  function visit(node, left, right) {
    const checkpoint = dsu.checkpoint();
    for (const [u, v] of tree[node]) dsu.union(u, v);
    if (right - left === 1) {
      const op = operations[left];
      if (op.type === 'connected') {
        answers.push({ time: left, connected: dsu.connected(op.u, op.v) });
      }
    } else {
      const mid = (left + right) >> 1;
      visit(node * 2, left, mid);
      visit(node * 2 + 1, mid, right);
    }
    dsu.rollback(checkpoint);
  }
  if (n) visit(1, 0, n);
  return answers;
}

const assert = require('node:assert/strict');
const answers = offlineDynamicConnectivity(4, [
  { type: 'add', u: 0, v: 1 },
  { type: 'connected', u: 0, v: 1 },
  { type: 'add', u: 1, v: 2 },
  { type: 'connected', u: 0, v: 2 },
  { type: 'remove', u: 0, v: 1 },
  { type: 'connected', u: 0, v: 2 }
]);
assert.deepEqual(answers, [
  { time: 1, connected: true },
  { time: 3, connected: true },
  { time: 5, connected: false }
]);
assert.throws(() => offlineDynamicConnectivity(2, [
  { type: 'remove', u: 0, v: 1 }
]), /inactive edge/);
console.log('Offline dynamic connectivity tests passed');

module.exports = { RollbackDSU, offlineDynamicConnectivity };
