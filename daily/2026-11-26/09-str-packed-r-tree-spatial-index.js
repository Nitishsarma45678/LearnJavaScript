'use strict';

// Exercise: build a static STR-packed R-tree and query rectangles by overlap.
// The bulk loader groups entries into bounded fanout nodes bottom-up.

const assert = require('node:assert/strict');

function validateRect(rect) {
  if (!rect || !['minX', 'minY', 'maxX', 'maxY'].every((key) =>
    typeof rect[key] === 'number' && Number.isFinite(rect[key]))) {
    throw new TypeError('rectangle requires finite minX, minY, maxX, maxY');
  }
  if (rect.minX > rect.maxX || rect.minY > rect.maxY) throw new RangeError('invalid rectangle bounds');
}

function boundsOf(items) {
  return {
    minX: Math.min(...items.map((x) => x.bounds ? x.bounds.minX : x.minX)),
    minY: Math.min(...items.map((x) => x.bounds ? x.bounds.minY : x.minY)),
    maxX: Math.max(...items.map((x) => x.bounds ? x.bounds.maxX : x.maxX)),
    maxY: Math.max(...items.map((x) => x.bounds ? x.bounds.maxY : x.maxY))
  };
}

function overlaps(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX &&
    a.minY <= b.maxY && a.maxY >= b.minY;
}

function strGroups(items, maxEntries) {
  const sliceCount = Math.max(1, Math.ceil(Math.sqrt(items.length / maxEntries)));
  const sliceSize = Math.ceil(items.length / sliceCount);
  const byX = [...items].sort((a, b) => {
    const aa = a.bounds || a, bb = b.bounds || b;
    return (aa.minX + aa.maxX) - (bb.minX + bb.maxX);
  });
  const groups = [];
  for (let start = 0; start < byX.length; start += sliceSize) {
    const slice = byX.slice(start, start + sliceSize).sort((a, b) => {
      const aa = a.bounds || a, bb = b.bounds || b;
      return (aa.minY + aa.maxY) - (bb.minY + bb.maxY);
    });
    for (let i = 0; i < slice.length; i += maxEntries) groups.push(slice.slice(i, i + maxEntries));
  }
  return groups;
}

function packRTree(entries, maxEntries = 8) {
  if (!Array.isArray(entries) || !Number.isInteger(maxEntries) || maxEntries < 2) {
    throw new TypeError('entries and maxEntries >= 2 are required');
  }
  const ids = new Set();
  const copies = entries.map((entry) => {
    validateRect(entry);
    if (entry.id === undefined || ids.has(entry.id)) throw new TypeError('entry ids must be unique');
    ids.add(entry.id);
    return { ...entry };
  });
  if (copies.length === 0) return { root: null, size: 0, search: () => [] };

  let level = strGroups(copies, maxEntries).map((children) => ({
    leaf: true, children, bounds: boundsOf(children)
  }));
  while (level.length > 1) {
    level = strGroups(level, maxEntries).map((children) => ({
      leaf: false, children, bounds: boundsOf(children)
    }));
  }
  const root = level[0];

  function search(query) {
    validateRect(query);
    const found = [];
    function visit(node) {
      if (!overlaps(node.bounds, query)) return;
      if (node.leaf) {
        for (const entry of node.children) if (overlaps(entry, query)) found.push(entry);
      } else {
        for (const child of node.children) visit(child);
      }
    }
    visit(root);
    return found;
  }

  return { root, size: copies.length, search };
}

const index = packRTree([
  { id: 'A', minX: 0, minY: 0, maxX: 2, maxY: 2 },
  { id: 'B', minX: 4, minY: 4, maxX: 5, maxY: 5 },
  { id: 'C', minX: 1, minY: 1, maxX: 3, maxY: 3 },
  { id: 'D', minX: 9, minY: 0, maxX: 10, maxY: 1 }
], 2);
assert.deepEqual(index.search({ minX: 1.5, minY: 1.5, maxX: 4.5, maxY: 4.5 })
  .map((x) => x.id).sort(), ['A', 'B', 'C']);
assert.deepEqual(packRTree([]).search({ minX: 0, minY: 0, maxX: 1, maxY: 1 }), []);
assert.throws(() => packRTree([{ id: 1, minX: 2, minY: 0, maxX: 1, maxY: 1 }]), RangeError);

module.exports = { packRTree, overlaps };
