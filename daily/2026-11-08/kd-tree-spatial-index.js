"use strict";

const assert = require("node:assert/strict");

function finite(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(label + " must be a finite number");
  }
  return value;
}

function compareIds(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareCandidates(a, b) {
  if (a.distanceSquared !== b.distanceSquared) {
    return a.distanceSquared < b.distanceSquared ? -1 : 1;
  }
  return compareIds(a.point.id, b.point.id);
}

function boxDistanceSquared(node, x, y) {
  const dx = x < node.minX ? node.minX - x : x > node.maxX ? x - node.maxX : 0;
  const dy = y < node.minY ? node.minY - y : y > node.maxY ? y - node.maxY : 0;
  return dx * dx + dy * dy;
}

class MaxHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  peek() {
    return this.items[0];
  }

  push(value) {
    const items = this.items;
    items.push(value);
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (compareCandidates(items[parent], items[index]) >= 0) break;
      [items[parent], items[index]] = [items[index], items[parent]];
      index = parent;
    }
  }

  pop() {
    const items = this.items;
    if (items.length === 0) return undefined;
    const root = items[0];
    const last = items.pop();
    if (items.length) {
      items[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let worst = index;
        if (
          left < items.length &&
          compareCandidates(items[left], items[worst]) > 0
        ) worst = left;
        if (
          right < items.length &&
          compareCandidates(items[right], items[worst]) > 0
        ) worst = right;
        if (worst === index) break;
        [items[index], items[worst]] = [items[worst], items[index]];
        index = worst;
      }
    }
    return root;
  }
}

function build(points, depth = 0) {
  if (points.length === 0) return null;
  const axis = depth & 1;
  const primary = axis === 0 ? "x" : "y";
  const secondary = axis === 0 ? "y" : "x";

  points.sort((a, b) =>
    a[primary] - b[primary] ||
    a[secondary] - b[secondary] ||
    compareIds(a.id, b.id)
  );

  const middle = points.length >> 1;
  const node = {
    point: points[middle],
    axis,
    left: build(points.slice(0, middle), depth + 1),
    right: build(points.slice(middle + 1), depth + 1),
    minX: points[middle].x,
    maxX: points[middle].x,
    minY: points[middle].y,
    maxY: points[middle].y
  };

  for (const child of [node.left, node.right]) {
    if (!child) continue;
    node.minX = Math.min(node.minX, child.minX);
    node.maxX = Math.max(node.maxX, child.maxX);
    node.minY = Math.min(node.minY, child.minY);
    node.maxY = Math.max(node.maxY, child.maxY);
  }
  return node;
}

/**
 * Static 2D k-d tree with bounding boxes.
 *
 * Construction is O(n log^2 n) with this simple median-sort builder.
 * range() prunes disjoint subtrees; nearest() uses a max-heap of the current
 * k best points and prunes boxes whose lower-bound distance is too large.
 * Point IDs are normalized to strings and provide deterministic tie-breaking.
 */
class KDTree {
  constructor(inputPoints) {
    if (!Array.isArray(inputPoints)) {
      throw new TypeError("points must be an array");
    }

    const ids = new Set();
    const points = inputPoints.map((point, index) => {
      if (!point || typeof point !== "object") {
        throw new TypeError("each point must be an object");
      }
      const x = finite(point.x, "point.x");
      const y = finite(point.y, "point.y");
      const id = point.id === undefined ? String(index) : String(point.id);
      if (ids.has(id)) throw new Error("point IDs must be unique: " + id);
      ids.add(id);
      return Object.freeze({ x, y, id });
    });

    this.size = points.length;
    this.root = build(points);
  }

  range(minX, minY, maxX, maxY) {
    finite(minX, "minX");
    finite(minY, "minY");
    finite(maxX, "maxX");
    finite(maxY, "maxY");
    if (minX > maxX || minY > maxY) {
      throw new RangeError("rectangle bounds are reversed");
    }

    const result = [];
    const visit = node => {
      if (!node) return;
      if (
        node.maxX < minX || node.minX > maxX ||
        node.maxY < minY || node.minY > maxY
      ) return;

      const point = node.point;
      if (
        point.x >= minX && point.x <= maxX &&
        point.y >= minY && point.y <= maxY
      ) result.push(point);

      visit(node.left);
      visit(node.right);
    };

    visit(this.root);
    result.sort((a, b) => compareIds(a.id, b.id));
    return result;
  }

  nearest(x, y, k = 1) {
    finite(x, "query x");
    finite(y, "query y");
    if (!Number.isInteger(k) || k < 0) {
      throw new RangeError("k must be a non-negative integer");
    }
    if (k === 0 || !this.root) return [];

    const best = new MaxHeap();
    const visit = node => {
      if (!node) return;

      const dx = node.point.x - x;
      const dy = node.point.y - y;
      const candidate = {
        point: node.point,
        distanceSquared: dx * dx + dy * dy
      };

      if (best.size < k) {
        best.push(candidate);
      } else if (compareCandidates(candidate, best.peek()) < 0) {
        best.pop();
        best.push(candidate);
      }

      const children = [node.left, node.right]
        .filter(Boolean)
        .map(child => ({
          node: child,
          lowerBound: boxDistanceSquared(child, x, y)
        }))
        .sort((a, b) => a.lowerBound - b.lowerBound);

      for (const child of children) {
        // Use > rather than >=: equal-distance boxes may contain a smaller ID.
        if (
          best.size < k ||
          child.lowerBound <= best.peek().distanceSquared
        ) visit(child.node);
      }
    };

    visit(this.root);
    return best.items.slice().sort(compareCandidates);
  }
}

function runTests() {
  const example = new KDTree([
    { id: "origin", x: 0, y: 0 },
    { id: "east", x: 4, y: 0 },
    { id: "north", x: 0, y: 3 },
    { id: "far", x: 8, y: 8 }
  ]);
  assert.deepEqual(
    example.nearest(1, 1, 2).map(item => item.point.id),
    ["origin", "north"]
  );
  assert.deepEqual(
    example.range(-1, -1, 4, 3).map(point => point.id),
    ["east", "north", "origin"].sort()
  );

  let seed = 0x6d2b79f5;
  const random = max => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % max;
  };

  for (let trial = 0; trial < 80; trial++) {
    const points = Array.from({ length: 1 + random(70) }, (_, index) => ({
      id: "p" + index,
      x: random(31) - 15,
      y: random(31) - 15
    }));
    const tree = new KDTree(points);

    for (let query = 0; query < 25; query++) {
      const x = random(41) - 20;
      const y = random(41) - 20;
      const k = random(points.length + 4);
      const expected = points
        .map(point => ({
          point: { ...point },
          distanceSquared: (point.x - x) ** 2 + (point.y - y) ** 2
        }))
        .sort(compareCandidates)
        .slice(0, k);

      assert.deepEqual(tree.nearest(x, y, k), expected);

      const ax = random(31) - 15;
      const bx = random(31) - 15;
      const ay = random(31) - 15;
      const by = random(31) - 15;
      const minX = Math.min(ax, bx);
      const maxX = Math.max(ax, bx);
      const minY = Math.min(ay, by);
      const maxY = Math.max(ay, by);
      const expectedRange = points
        .filter(p =>
          p.x >= minX && p.x <= maxX &&
          p.y >= minY && p.y <= maxY
        )
        .map(p => ({ ...p }))
        .sort((a, b) => compareIds(a.id, b.id));
      assert.deepEqual(tree.range(minX, minY, maxX, maxY), expectedRange);
    }
  }

  assert.equal(new KDTree([]).nearest(0, 0, 3).length, 0);
  assert.throws(
    () => new KDTree([{ id: "same", x: 0, y: 0 }, { id: "same", x: 1, y: 1 }]),
    /unique/
  );
  assert.throws(() => example.nearest(0, 0, -1), RangeError);
}

if (require.main === module) {
  runTests();
  console.log("KDTree: all tests passed");
}

module.exports = { KDTree };
