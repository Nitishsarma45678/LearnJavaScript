/**
 * Exercise: Build a k-d tree for k-nearest-neighbor queries in k dimensions.
 * Use median splitting and branch-and-bound pruning. Points are numeric arrays
 * of equal dimension. Return neighbors ordered by ascending squared distance.
 * Run: node 17-kd-tree-k-nearest-neighbors.js
 */
"use strict";
const assert = require("node:assert/strict");

function squaredDistance(a, b) {
  let total = 0;
  for (let i = 0; i < a.length; i++) total += (a[i] - b[i]) ** 2;
  return total;
}

class KDTree {
  constructor(points) {
    if (!Array.isArray(points) || points.length === 0) throw new TypeError("points must be non-empty");
    const dimension = points[0].length;
    if (!Number.isInteger(dimension) || dimension < 1 ||
        points.some(point => !Array.isArray(point) || point.length !== dimension ||
          point.some(value => !Number.isFinite(value)))) {
      throw new TypeError("all points must have the same positive dimension and finite coordinates");
    }
    this.dimension = dimension;
    this.root = this.build(points.map((point, id) => ({ point: point.slice(), id })), 0);
  }
  build(items, depth) {
    if (!items.length) return null;
    const axis = depth % this.dimension;
    items.sort((a, b) => a.point[axis] - b.point[axis] || a.id - b.id);
    const middle = Math.floor(items.length / 2);
    return {
      item: items[middle], axis,
      left: this.build(items.slice(0, middle), depth + 1),
      right: this.build(items.slice(middle + 1), depth + 1)
    };
  }
  nearest(target, k = 1) {
    if (!Array.isArray(target) || target.length !== this.dimension ||
        target.some(value => !Number.isFinite(value))) throw new TypeError("invalid target point");
    if (!Number.isInteger(k) || k < 1) throw new RangeError("k must be positive");
    const best = [];
    const insertCandidate = candidate => {
      let index = 0;
      while (index < best.length &&
        (best[index].distanceSquared < candidate.distanceSquared ||
         (best[index].distanceSquared === candidate.distanceSquared && best[index].id < candidate.id))) index++;
      best.splice(index, 0, candidate);
      if (best.length > k) best.pop();
    };
    const visit = node => {
      if (!node) return;
      const { point, id } = node.item;
      insertCandidate({ point: point.slice(), id, distanceSquared: squaredDistance(point, target) });
      const delta = target[node.axis] - point[node.axis];
      const near = delta <= 0 ? node.left : node.right;
      const far = delta <= 0 ? node.right : node.left;
      visit(near);
      const worst = best.length < k ? Infinity : best[best.length - 1].distanceSquared;
      if (delta * delta <= worst) visit(far);
    };
    visit(this.root);
    return best.map(({ point, distanceSquared }) => ({ point, distanceSquared }));
  }
}

const tree = new KDTree([[0, 0], [5, 4], [1, 1], [-2, 3], [8, 8]]);
assert.deepEqual(tree.nearest([0, 0], 2).map(item => item.point), [[0, 0], [1, 1]]);
assert.equal(tree.nearest([6, 5], 1)[0].point.join(","), "5,4");
assert.equal(tree.nearest([0, 0], 20).length, 5);
assert.throws(() => tree.nearest([1], 1), TypeError);
assert.throws(() => tree.nearest([1, 2], 0), RangeError);
console.log("KD-tree nearest-neighbor tests passed");
module.exports = { KDTree, squaredDistance };
