'use strict';

// Exercise: recursively account for a virtual filesystem. Links may point to
// directories or files, cycles must be reported, and hard-linked files can be
// counted once or once per directory entry.

function analyzeFileSystem(root, { followLinks = true, countHardLinksOnce = true } = {}) {
  const active = new Set();
  const countedFiles = new Set();
  const result = { bytes: 0, files: 0, directories: 0, links: 0, cycles: 0, danglingLinks: 0 };

  function visit(node) {
    if (!node || typeof node !== 'object') throw new TypeError('invalid filesystem node');
    if (node.type === 'file') {
      if (countHardLinksOnce && node.id && countedFiles.has(node.id)) return;
      if (node.id) countedFiles.add(node.id);
      if (!Number.isFinite(node.size) || node.size < 0) throw new RangeError('invalid file size');
      result.files++;
      result.bytes += node.size;
      return;
    }

    if (node.type === 'link') {
      result.links++;
      if (!followLinks) return;
      if (!node.target) { result.danglingLinks++; return; }
      if (active.has(node.target.id)) { result.cycles++; return; }
      visit(node.target);
      return;
    }

    if (node.type !== 'dir' || !node.entries || typeof node.entries !== 'object') {
      throw new TypeError('unknown filesystem node');
    }
    const identity = node.id || node;
    if (active.has(identity)) { result.cycles++; return; }

    active.add(identity);
    result.directories++;
    for (const child of Object.values(node.entries)) visit(child);
    active.delete(identity);
  }

  visit(root);
  return result;
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  const shared = { type: 'file', id: 'inode-1', size: 12 };
  const root = { type: 'dir', id: 'root', entries: {} };
  const sub = { type: 'dir', id: 'sub', entries: { copy: shared } };
  root.entries = {
    a: shared,
    sub,
    back: { type: 'link', target: root },
    missing: { type: 'link', target: null }
  };

  assert.deepEqual(analyzeFileSystem(root), {
    bytes: 12, files: 1, directories: 2, links: 2, cycles: 1, danglingLinks: 1
  });
  assert.deepEqual(analyzeFileSystem(root, { followLinks: false }), {
    bytes: 12, files: 1, directories: 2, links: 2, cycles: 0, danglingLinks: 0
  });
  assert.equal(analyzeFileSystem(root, { countHardLinksOnce: false }).bytes, 24);
  assert.throws(() => analyzeFileSystem({ type: 'file', size: -1 }), RangeError);
  console.log('filesystem accounting: all tests passed');
}

module.exports = { analyzeFileSystem };
