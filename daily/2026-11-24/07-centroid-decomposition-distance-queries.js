'use strict';

const assert = require('node:assert/strict');

function upperBound(sorted, target) {
  let low = 0, high = sorted.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (sorted[mid] <= target) low = mid + 1;
    else high = mid;
  }
  return low;
}

class CentroidDistanceIndex {
  constructor(vertexCount, edges) {
    if (!Number.isInteger(vertexCount) || vertexCount < 1) throw new RangeError('Tree must have at least one vertex');
    this.n = vertexCount;
    this.graph = Array.from({ length: vertexCount }, () => []);
    for (const [a, b] of edges) {
      if (a < 0 || b < 0 || a >= vertexCount || b >= vertexCount || a === b) throw new RangeError('Invalid edge');
      this.graph[a].push(b);
      this.graph[b].push(a);
    }
    if (edges.length !== vertexCount - 1) throw new TypeError('Input must be a tree');
    this.removed = Array(vertexCount).fill(false);
    this.records = Array.from({ length: vertexCount }, () => []);
    this.data = Array(vertexCount).fill(null);
    this._decompose(0);
  }

  _findCentroid(start) {
    const parent = Array(this.n).fill(-2);
    const order = [start];
    parent[start] = -1;
    for (let i = 0; i < order.length; i++) {
      const v = order[i];
      for (const next of this.graph[v]) {
        if (this.removed[next] || next === parent[v]) continue;
        parent[next] = v;
        order.push(next);
      }
    }
    const size = Array(this.n).fill(0);
    for (let i = order.length - 1; i >= 0; i--) {
      const v = order[i];
      size[v] = 1;
      for (const next of this.graph[v]) if (!this.removed[next] && parent[next] === v) size[v] += size[next];
    }
    const total = order.length;
    for (const v of order) {
      let largest = total - size[v];
      for (const next of this.graph[v]) if (!this.removed[next] && parent[next] === v) largest = Math.max(largest, size[next]);
      if (largest * 2 <= total) return v;
    }
    throw new Error('Centroid not found');
  }

  _collect(start, parent, distance, branch, all, part) {
    const stack = [[start, parent, distance]];
    while (stack.length) {
      const [v, p, d] = stack.pop();
      all.push(d);
      part.push(d);
      this.records[v].push({ centroid: this.currentCentroid, distance: d, branch });
      for (const next of this.graph[v]) {
        if (next !== p && !this.removed[next]) stack.push([next, v, d + 1]);
      }
    }
  }

  _decompose(start) {
    const centroid = this._findCentroid(start);
    this.currentCentroid = centroid;
    this.removed[centroid] = true;
    this.records[centroid].push({ centroid, distance: 0, branch: -1 });
    const all = [0];
    const parts = [];
    for (const neighbor of this.graph[centroid]) {
      if (this.removed[neighbor]) continue;
      const part = [];
      const branch = parts.length;
      this._collect(neighbor, centroid, 1, branch, all, part);
      part.sort((a, b) => a - b);
      parts.push(part);
    }
    all.sort((a, b) => a - b);
    this.data[centroid] = { all, parts };
    for (const neighbor of this.graph[centroid]) if (!this.removed[neighbor]) this._decompose(neighbor);
  }

  countWithin(vertex, maxDistance) {
    if (!Number.isInteger(vertex) || vertex < 0 || vertex >= this.n) throw new RangeError('Invalid vertex');
    if (maxDistance < 0) return 0;
    let count = 0;
    for (const record of this.records[vertex]) {
      const remaining = maxDistance - record.distance;
      if (remaining < 0) continue;
      const { all, parts } = this.data[record.centroid];
      count += upperBound(all, remaining);
      if (record.branch >= 0) count -= upperBound(parts[record.branch], remaining);
    }
    return count;
  }
}

const tree = new CentroidDistanceIndex(7, [[0,1],[0,2],[1,3],[1,4],[2,5],[5,6]]);
assert.equal(tree.countWithin(0, 1), 3);
assert.equal(tree.countWithin(0, 2), 6);
assert.equal(tree.countWithin(3, 1), 2);
assert.equal(tree.countWithin(6, 0), 1);
assert.equal(tree.countWithin(6, 3), 7);
assert.equal(tree.countWithin(2, -1), 0);
console.log('Centroid-distance examples passed.');

module.exports = { CentroidDistanceIndex };
