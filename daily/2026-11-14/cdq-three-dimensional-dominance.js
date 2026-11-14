/**
 * CDQ Divide-and-Conquer: 3D Dominance Counting
 * ----------------------------------------------
 * For every input point p, count all points q (including p and duplicates)
 * satisfying q.x <= p.x, q.y <= p.y, and q.z <= p.z.
 *
 * Equal coordinate triples are grouped before CDQ so weak inequalities and
 * duplicate multiplicities are handled exactly. Each merge uses a Fenwick
 * tree over compressed z-coordinates and rolls its updates back afterward.
 *
 * Complexity: O(n log^2 n) time and O(n) auxiliary space.
 *
 * Run: node cdq-three-dimensional-dominance.js
 */
'use strict';

const assert = require('node:assert/strict');

class FenwickTree {
  constructor(size) {
    this.tree = new Array(size + 1).fill(0);
  }

  add(index, delta) {
    for (let i = index + 1; i < this.tree.length; i += i & -i) {
      this.tree[i] += delta;
    }
  }

  // Sum of all compressed coordinates in [0, index].
  prefixSum(index) {
    let total = 0;
    for (let i = index + 1; i > 0; i -= i & -i) {
      total += this.tree[i];
    }
    return total;
  }
}

function compareNumber(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sameTriple(a, b) {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

function count3DDominance(points) {
  if (!Array.isArray(points)) throw new TypeError('points must be an array');

  const sorted = points.map((point, originalIndex) => {
    if (!point || !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
      throw new TypeError('Every point must have finite x, y, and z coordinates');
    }
    return {
      x: point.x,
      y: point.y,
      z: point.z,
      originalIndex
    };
  });

  if (sorted.length === 0) return [];

  sorted.sort((a, b) =>
    compareNumber(a.x, b.x) ||
    compareNumber(a.y, b.y) ||
    compareNumber(a.z, b.z)
  );

  // Compress exact duplicates. Every member of a duplicate group has the
  // same answer, and the group's weight contributes to other answers.
  const groups = [];
  for (const point of sorted) {
    const last = groups[groups.length - 1];
    if (last && sameTriple(last, point)) {
      last.weight += 1;
      last.originalIndices.push(point.originalIndex);
    } else {
      groups.push({
        x: point.x,
        y: point.y,
        z: point.z,
        weight: 1,
        count: 1,
        originalIndices: [point.originalIndex]
      });
    }
  }

  for (const group of groups) group.count = group.weight;

  const zCoordinates = [...new Set(groups.map((point) => point.z))]
    .sort(compareNumber);
  const zRank = new Map(zCoordinates.map((value, index) => [value, index]));
  for (const point of groups) point.zIndex = zRank.get(point.z);

  const bit = new FenwickTree(zCoordinates.length);
  const buffer = new Array(groups.length);

  function solve(left, right) {
    if (right - left <= 1) return;

    const middle = (left + right) >> 1;
    solve(left, middle);
    solve(middle, right);

    // Both halves are now sorted by y. Add left-half points before querying
    // each right-half point so the y comparison is inclusive.
    let inserted = left;
    for (let j = middle; j < right; j += 1) {
      while (inserted < middle && groups[inserted].y <= groups[j].y) {
        const point = groups[inserted];
        bit.add(point.zIndex, point.weight);
        inserted += 1;
      }
      groups[j].count += bit.prefixSum(groups[j].zIndex);
    }

    // Roll back every Fenwick update before the sibling recursion uses it.
    for (let i = left; i < inserted; i += 1) {
      bit.add(groups[i].zIndex, -groups[i].weight);
    }

    // Merge the two y-sorted halves while preserving the x-partition.
    let i = left;
    let j = middle;
    let out = left;
    while (i < middle && j < right) {
      if (groups[i].y <= groups[j].y) {
        buffer[out++] = groups[i++];
      } else {
        buffer[out++] = groups[j++];
      }
    }
    while (i < middle) buffer[out++] = groups[i++];
    while (j < right) buffer[out++] = groups[j++];
    for (let k = left; k < right; k += 1) groups[k] = buffer[k];
  }

  solve(0, groups.length);

  const answer = new Array(points.length);
  for (const group of groups) {
    for (const originalIndex of group.originalIndices) {
      answer[originalIndex] = group.count;
    }
  }
  return answer;
}

// ---------------------------------------------------------------------------
// Examples and tests
// ---------------------------------------------------------------------------

const sample = [
  { x: 1, y: 2, z: 3 },
  { x: 2, y: 2, z: 3 },
  { x: 2, y: 3, z: 4 },
  { x: 1, y: 2, z: 3 }
];
assert.deepEqual(count3DDominance(sample), [2, 2, 4, 2]);

assert.deepEqual(count3DDominance([]), []);
assert.deepEqual(
  count3DDominance([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }]),
  [2, 2]
);
assert.deepEqual(
  count3DDominance([
    { x: -2, y: 5, z: 0 },
    { x: -1, y: 4, z: 0 },
    { x: 0, y: 6, z: -1 }
  ]),
  [1, 1, 1]
);
assert.throws(() => count3DDominance([{ x: 1, y: NaN, z: 2 }]), /finite/);
assert.throws(() => count3DDominance(null), /array/);

function bruteForce(points) {
  return points.map((point) => points.reduce((count, candidate) =>
    count + Number(
      candidate.x <= point.x &&
      candidate.y <= point.y &&
      candidate.z <= point.z
    ), 0));
}

let seed = 0x12345678;
function randomInt(max) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed % max;
}

for (let trial = 0; trial < 160; trial += 1) {
  const length = randomInt(36);
  const points = Array.from({ length }, () => ({
    x: randomInt(9) - 4,
    y: randomInt(9) - 4,
    z: randomInt(9) - 4
  }));
  assert.deepEqual(
    count3DDominance(points),
    bruteForce(points),
    'CDQ result must match the cubic reference implementation'
  );
}

console.log('3D dominance tests passed.');
