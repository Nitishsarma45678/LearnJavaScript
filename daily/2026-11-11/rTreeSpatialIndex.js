/**
 * Exercise: R-Tree Spatial Index with Quadratic Node Splitting
 *
 * Implement a dynamic rectangle index supporting insertion, intersection
 * search, and deletion with underflow condensation. The index is useful for
 * maps, collision detection, CAD selections, and viewport queries.
 *
 * Run: node daily/2026-11-11/rTreeSpatialIndex.js
 */

const assert = require("node:assert/strict");

function normalizeBox(box) {
  if (!box || !["minX", "minY", "maxX", "maxY"].every(key => Number.isFinite(box[key]))) {
    throw new TypeError("A rectangle needs finite minX, minY, maxX, and maxY values");
  }
  if (box.minX > box.maxX || box.minY > box.maxY) {
    throw new RangeError("Rectangle minimums cannot exceed maximums");
  }
  return { minX: box.minX, minY: box.minY, maxX: box.maxX, maxY: box.maxY };
}

function union(a, b) {
  if (!a) return { ...b };
  if (!b) return { ...a };
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY)
  };
}

function area(box) {
  return box ? (box.maxX - box.minX) * (box.maxY - box.minY) : 0;
}

function enlargement(current, added) {
  return area(union(current, added)) - area(current);
}

function intersects(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX &&
    a.minY <= b.maxY && a.maxY >= b.minY;
}

function boxOf(children) {
  return children.reduce((result, child) => union(result, child.box), null);
}

class Node {
  constructor(leaf) {
    this.leaf = leaf;
    this.children = [];
    this.box = null;
    this.parent = null;
  }
}

class RTree {
  constructor({ maxEntries = 5, minEntries = 2 } = {}) {
    if (!Number.isInteger(maxEntries) || maxEntries < 4) {
      throw new RangeError("maxEntries must be an integer >= 4");
    }
    if (!Number.isInteger(minEntries) || minEntries < 2 ||
        minEntries > Math.floor((maxEntries + 1) / 2)) {
      throw new RangeError("minEntries must be >= 2 and <= floor((maxEntries + 1) / 2)");
    }
    this.maxEntries = maxEntries;
    this.minEntries = minEntries;
    this.root = new Node(true);
    this.items = new Map();
  }

  get size() {
    return this.items.size;
  }

  insert(id, rectangle, value = id) {
    if (id === undefined || id === null) throw new TypeError("id is required");
    if (this.items.has(id)) throw new Error(\`Duplicate spatial id: \${String(id)}\`);
    const entry = { id, box: normalizeBox(rectangle), value };
    const leaf = this._chooseLeaf(this.root, entry.box);
    leaf.children.push(entry);
    this.items.set(id, entry);
    this._adjustAfterInsert(leaf);
    return this;
  }

  _chooseLeaf(node, rectangle) {
    if (node.leaf) return node;
    let best = null;
    for (const child of node.children) {
      const candidate = {
        node: child,
        growth: enlargement(child.box, rectangle),
        area: area(child.box),
        count: child.children.length
      };
      if (!best || candidate.growth < best.growth ||
          (candidate.growth === best.growth && candidate.area < best.area) ||
          (candidate.growth === best.growth && candidate.area === best.area &&
            candidate.count < best.count)) {
        best = candidate;
      }
    }
    if (!best) throw new Error("Corrupt R-tree: internal node has no children");
    return this._chooseLeaf(best.node, rectangle);
  }

  _adjustAfterInsert(start) {
    let node = start;
    while (node) {
      node.box = boxOf(node.children);
      if (node.children.length > this.maxEntries) {
        const sibling = this._split(node);
        const parent = node.parent;
        if (parent) {
          sibling.parent = parent;
          parent.children.push(sibling);
          node = parent;
        } else {
          const root = new Node(false);
          root.children = [node, sibling];
          node.parent = root;
          sibling.parent = root;
          root.box = boxOf(root.children);
          this.root = root;
          return;
        }
      } else {
        node = node.parent;
      }
    }
  }

  _split(node) {
    const entries = node.children.slice();
    const [seedA, seedB] = this._pickSeeds(entries);
    const sibling = new Node(node.leaf);
    sibling.parent = node.parent;
    node.children = [entries[seedA]];
    sibling.children = [entries[seedB]];
    this._setParents(node);
    this._setParents(sibling);
    node.box = boxOf(node.children);
    sibling.box = boxOf(sibling.children);

    const remaining = entries.filter((_, index) => index !== seedA && index !== seedB);
    while (remaining.length) {
      if (node.children.length + remaining.length === this.minEntries) {
        node.children.push(...remaining);
        remaining.length = 0;
        break;
      }
      if (sibling.children.length + remaining.length === this.minEntries) {
        sibling.children.push(...remaining);
        remaining.length = 0;
        break;
      }

      const next = this._pickNext(remaining, node.box, sibling.box);
      const [entry] = remaining.splice(next, 1);
      const growA = enlargement(node.box, entry.box);
      const growB = enlargement(sibling.box, entry.box);
      let destination;
      if (growA < growB) destination = node;
      else if (growB < growA) destination = sibling;
      else if (area(node.box) < area(sibling.box)) destination = node;
      else if (area(sibling.box) < area(node.box)) destination = sibling;
      else destination = node.children.length <= sibling.children.length ? node : sibling;

      destination.children.push(entry);
      if (!destination.leaf) entry.parent = destination;
      destination.box = boxOf(destination.children);
    }

    this._setParents(node);
    this._setParents(sibling);
    node.box = boxOf(node.children);
    sibling.box = boxOf(sibling.children);
    return sibling;
  }

  _pickSeeds(entries) {
    let bestWaste = -Infinity;
    let pair = [0, 1];
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const waste = area(union(entries[i].box, entries[j].box)) -
          area(entries[i].box) - area(entries[j].box);
        if (waste > bestWaste) {
          bestWaste = waste;
          pair = [i, j];
        }
      }
    }
    return pair;
  }

  _pickNext(entries, boxA, boxB) {
    let index = 0;
    let greatestDifference = -Infinity;
    for (let i = 0; i < entries.length; i += 1) {
      const a = enlargement(boxA, entries[i].box);
      const b = enlargement(boxB, entries[i].box);
      const difference = Math.abs(a - b);
      if (difference > greatestDifference) {
        greatestDifference = difference;
        index = i;
      }
    }
    return index;
  }

  _setParents(node) {
    if (!node.leaf) {
      for (const child of node.children) child.parent = node;
    }
  }

  search(rectangle) {
    const query = normalizeBox(rectangle);
    const found = [];
    const visit = node => {
      if (!node.box || !intersects(node.box, query)) return;
      if (node.leaf) {
        for (const entry of node.children) {
          if (intersects(entry.box, query)) found.push(entry);
        }
      } else {
        for (const child of node.children) visit(child);
      }
    };
    visit(this.root);
    return found.map(({ id, box, value }) => ({ id, box: { ...box }, value }));
  }

  get(id) {
    const entry = this.items.get(id);
    return entry ? { id: entry.id, box: { ...entry.box }, value: entry.value } : null;
  }

  remove(id) {
    const path = this._findPath(this.root, id);
    if (!path) return false;
    const leaf = path[path.length - 1];
    const index = leaf.children.findIndex(entry => entry.id === id);
    leaf.children.splice(index, 1);
    this.items.delete(id);
    leaf.box = boxOf(leaf.children);

    const orphaned = [];
    for (let depth = path.length - 2; depth >= 0; depth -= 1) {
      const parent = path[depth];
      const child = path[depth + 1];
      if (child.children.length < this.minEntries) {
        parent.children.splice(parent.children.indexOf(child), 1);
        this._collectLeafEntries(child, orphaned);
      }
      parent.box = boxOf(parent.children);
    }

    if (!this.root.leaf && this.root.children.length === 1) {
      this.root = this.root.children[0];
      this.root.parent = null;
    } else if (!this.root.leaf && this.root.children.length === 0) {
      this.root = new Node(true);
    }
    this.root.parent = null;

    for (const entry of orphaned) {
      this.items.delete(entry.id);
      this.insert(entry.id, entry.box, entry.value);
    }
    return true;
  }

  _findPath(node, id, path = []) {
    const nextPath = path.concat(node);
    if (node.leaf) {
      return node.children.some(entry => entry.id === id) ? nextPath : null;
    }
    for (const child of node.children) {
      const result = this._findPath(child, id, nextPath);
      if (result) return result;
    }
    return null;
  }

  _collectLeafEntries(node, output) {
    if (node.leaf) output.push(...node.children);
    else for (const child of node.children) this._collectLeafEntries(child, output);
  }

  all() {
    return [...this.items.values()].map(({ id, box, value }) => ({
      id, box: { ...box }, value
    }));
  }
}

function bruteForce(items, query) {
  return items.filter(item => intersects(item.box, query)).map(item => item.id).sort();
}

function runTests() {
  const tree = new RTree({ maxEntries: 4, minEntries: 2 });
  const source = [];
  for (let i = 0; i < 80; i += 1) {
    const x = (i * 17) % 53;
    const y = (i * 29) % 47;
    const item = {
      id: \`p\${i}\`,
      box: { minX: x, minY: y, maxX: x + (i % 4), maxY: y + (i % 3) },
      value: { label: \`point-\${i}\` }
    };
    source.push(item);
    tree.insert(item.id, item.box, item.value);
  }
  assert.equal(tree.size, 80);
  assert.throws(() => tree.insert("p0", { minX: 0, minY: 0, maxX: 1, maxY: 1 }), /Duplicate/);

  for (let q = 0; q < 100; q += 1) {
    const x = (q * 11) % 60;
    const y = (q * 7) % 55;
    const query = { minX: x, minY: y, maxX: x + 8, maxY: y + 6 };
    assert.deepEqual(tree.search(query).map(item => item.id).sort(), bruteForce(source, query));
  }

  for (let i = 0; i < 35; i += 1) {
    assert.equal(tree.remove(\`p\${i}\`), true);
    assert.equal(tree.remove(\`p\${i}\`), false);
  }
  const remaining = source.slice(35);
  assert.equal(tree.size, remaining.length);
  for (let q = 0; q < 50; q += 1) {
    const x = (q * 13) % 60;
    const y = (q * 19) % 55;
    const query = { minX: x, minY: y, maxX: x + 12, maxY: y + 9 };
    assert.deepEqual(
      tree.search(query).map(item => item.id).sort(),
      bruteForce(remaining, query)
    );
  }

  assert.equal(tree.get("p79").value.label, "point-79");
  assert.equal(tree.remove("p79"), true);
  assert.equal(tree.get("p79"), null);

  const tiny = new RTree({ maxEntries: 4, minEntries: 2 });
  tiny.insert("left", { minX: 0, minY: 0, maxX: 1, maxY: 1 });
  tiny.insert("right", { minX: 10, minY: 10, maxX: 11, maxY: 11 });
  tiny.remove("right");
  assert.deepEqual(tiny.root.box, { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    "deleting from a root leaf must refresh its bounding rectangle");

  assert.throws(() => tree.search({ minX: 5, minY: 0, maxX: 1, maxY: 2 }), /minimums/);
  assert.throws(() => tree.insert("bad", { minX: NaN, minY: 0, maxX: 1, maxY: 1 }), /finite/);
  console.log("rTreeSpatialIndex: all tests passed");
}

if (require.main === module) runTests();

module.exports = { RTree, intersects, union, area, normalizeBox };
