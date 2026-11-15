/**
 * Compressed Radix Trie with Prefix Suggestions
 * ---------------------------------------------
 * A radix trie stores whole edge labels instead of one node per character.
 * Insertion splits edges at the first mismatch; deletion merges non-terminal
 * unary nodes back together.
 *
 * Supports Unicode code points, empty strings, exact lookup, deletion and
 * lexicographically ordered prefix suggestions.
 */

'use strict';

class CompressedRadixTrie {
  constructor(words = []) {
    this.root = { terminal: false, children: new Map() };
    this._size = 0;
    for (const word of words) this.insert(word);
  }

  get size() {
    return this._size;
  }

  insert(word) {
    this._assertWord(word);
    const chars = Array.from(word);
    let node = this.root;
    let offset = 0;

    while (offset < chars.length) {
      const first = chars[offset];
      const edge = node.children.get(first);
      if (!edge) {
        const label = chars.slice(offset).join('');
        node.children.set(first, {
          label,
          child: { terminal: true, children: new Map() }
        });
        this._size += 1;
        return true;
      }

      const labelChars = Array.from(edge.label);
      let common = 0;
      while (
        common < labelChars.length &&
        offset + common < chars.length &&
        labelChars[common] === chars[offset + common]
      ) {
        common += 1;
      }

      if (common === labelChars.length) {
        offset += common;
        node = edge.child;
        continue;
      }

      // The existing edge and new word diverge (or the new word ends here).
      const commonLabel = labelChars.slice(0, common).join('');
      const oldSuffix = labelChars.slice(common).join('');
      const middle = { terminal: false, children: new Map() };
      middle.children.set(oldSuffix[0], { label: oldSuffix, child: edge.child });
      node.children.set(first, { label: commonLabel, child: middle });

      const newOffset = offset + common;
      if (newOffset === chars.length) {
        middle.terminal = true;
      } else {
        const newSuffix = chars.slice(newOffset).join('');
        middle.children.set(newSuffix[0], {
          label: newSuffix,
          child: { terminal: true, children: new Map() }
        });
      }
      this._size += 1;
      return true;
    }

    if (node.terminal) return false;
    node.terminal = true;
    this._size += 1;
    return true;
  }

  has(word) {
    this._assertWord(word);
    const chars = Array.from(word);
    let node = this.root;
    let offset = 0;

    while (offset < chars.length) {
      const edge = node.children.get(chars[offset]);
      if (!edge) return false;
      const label = Array.from(edge.label);
      if (offset + label.length > chars.length) return false;
      for (let i = 0; i < label.length; i += 1) {
        if (label[i] !== chars[offset + i]) return false;
      }
      offset += label.length;
      node = edge.child;
    }
    return node.terminal;
  }

  delete(word) {
    this._assertWord(word);
    const chars = Array.from(word);

    const remove = (node, offset) => {
      if (offset === chars.length) {
        if (!node.terminal) return false;
        node.terminal = false;
        return true;
      }

      const first = chars[offset];
      const edge = node.children.get(first);
      if (!edge) return false;

      const label = Array.from(edge.label);
      if (offset + label.length > chars.length) return false;
      for (let i = 0; i < label.length; i += 1) {
        if (label[i] !== chars[offset + i]) return false;
      }

      const deleted = remove(edge.child, offset + label.length);
      if (!deleted) return false;

      const child = edge.child;
      if (!child.terminal && child.children.size === 0) {
        node.children.delete(first);
      } else if (!child.terminal && child.children.size === 1) {
        const onlyEdge = child.children.values().next().value;
        edge.label += onlyEdge.label;
        edge.child = onlyEdge.child;
      }
      return true;
    };

    const deleted = remove(this.root, 0);
    if (deleted) this._size -= 1;
    return deleted;
  }

  wordsWithPrefix(prefix, options = {}) {
    this._assertWord(prefix);
    const { limit = Infinity } = options;
    if (!(limit === Infinity || (Number.isInteger(limit) && limit >= 0))) {
      throw new RangeError('limit must be a non-negative integer or Infinity');
    }
    if (limit === 0) return [];

    const located = this._locatePrefix(prefix);
    if (!located) return [];

    const results = [];
    const visit = (node, base) => {
      if (node.terminal) results.push(base);
      for (const edge of node.children.values()) {
        visit(edge.child, base + edge.label);
      }
    };
    visit(located.node, located.base);
    results.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return results.slice(0, limit);
  }

  _locatePrefix(prefix) {
    const chars = Array.from(prefix);
    let node = this.root;
    let offset = 0;
    let base = '';

    while (offset < chars.length) {
      const edge = node.children.get(chars[offset]);
      if (!edge) return null;
      const label = Array.from(edge.label);
      let common = 0;
      while (
        common < label.length &&
        offset + common < chars.length &&
        label[common] === chars[offset + common]
      ) {
        common += 1;
      }
      if (common === 0) return null;
      if (offset + common === chars.length) {
        // The requested prefix may end in the middle of a compressed edge.
        return { node: edge.child, base: base + edge.label };
      }
      if (common !== label.length) return null;
      base += edge.label;
      offset += common;
      node = edge.child;
    }
    return { node, base };
  }

  assertInvariants() {
    let counted = 0;
    const visit = (node, isRoot) => {
      if (node.terminal) counted += 1;
      if (!isRoot && !node.terminal && node.children.size === 1) {
        throw new Error('uncompressed non-terminal unary node');
      }
      for (const [key, edge] of node.children) {
        if (!edge.label || Array.from(edge.label)[0] !== key) {
          throw new Error('edge key must equal its first code point');
        }
        visit(edge.child, false);
      }
    };
    visit(this.root, true);
    if (counted !== this._size) throw new Error('stored size does not match terminal count');
    return true;
  }

  _assertWord(word) {
    if (typeof word !== 'string') throw new TypeError('word must be a string');
  }
}

function runTests() {
  const assert = require('node:assert/strict');

  const trie = new CompressedRadixTrie(['car', 'cart', 'carbon', 'cat', 'dog']);
  assert.equal(trie.size, 5);
  assert.equal(trie.has('car'), true);
  assert.equal(trie.has('ca'), false);
  assert.deepEqual(trie.wordsWithPrefix('car'), ['car', 'carbon', 'cart']);
  assert.deepEqual(trie.wordsWithPrefix('ca', { limit: 2 }), ['car', 'carbon']);
  assert.deepEqual(trie.wordsWithPrefix('cab'), []);

  assert.equal(trie.insert('care'), true); // Split an existing compressed edge.
  assert.equal(trie.insert('care'), false);
  assert.equal(trie.has('care'), true);
  assert.equal(trie.delete('car'), true); // A terminal node can have descendants.
  assert.equal(trie.has('car'), false);
  assert.equal(trie.has('cart'), true);
  assert.equal(trie.delete('not-present'), false);
  assert.equal(trie.delete('carbon'), true);
  assert.equal(trie.delete('cart'), true);
  assert.equal(trie.assertInvariants(), true);

  const unicode = new CompressedRadixTrie(['😀cat', '😀car', 'éclair', '']);
  assert.equal(unicode.has('😀cat'), true);
  assert.deepEqual(unicode.wordsWithPrefix('😀c'), ['😀car', '😀cat']);
  assert.deepEqual(unicode.wordsWithPrefix(''), ['', 'éclair', '😀car', '😀cat'].sort());
  assert.equal(unicode.delete(''), true);
  assert.equal(unicode.has(''), false);
  assert.equal(unicode.assertInvariants(), true);

  assert.throws(() => trie.wordsWithPrefix('c', { limit: -1 }), /limit/);
  assert.throws(() => trie.insert(42), /string/);
  console.log('compressed-radix-trie: all tests passed');
}

if (require.main === module) runTests();

module.exports = { CompressedRadixTrie };
