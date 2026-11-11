'use strict';

// Patricia radix trie: compressed string edges, edge splitting, prefix search,
// longest-prefix lookup and deletion with upward path compression.
const assert = require('node:assert/strict');

class Node {
  constructor(terminal = false, value = undefined) {
    this.terminal = terminal;
    this.value = value;
    this.children = new Map();
  }
}

class PatriciaRadixTrie {
  constructor() {
    this.root = new Node();
    this.size = 0;
  }

  _check(key) {
    if (typeof key !== 'string') throw new TypeError('keys must be strings');
  }

  insert(key, value) {
    this._check(key);
    let node = this.root, offset = 0;
    while (offset < key.length) {
      const edge = node.children.get(key[offset]);
      if (!edge) {
        const label = key.slice(offset);
        node.children.set(label[0], { label, node: new Node(true, value) });
        this.size++;
        return true;
      }
      let common = 0;
      while (common < edge.label.length && offset + common < key.length &&
        edge.label[common] === key[offset + common]) common++;
      if (common === edge.label.length) {
        offset += common;
        node = edge.node;
        if (offset === key.length) {
          if (node.terminal) { node.value = value; return false; }
          node.terminal = true;
          node.value = value;
          this.size++;
          return true;
        }
        continue;
      }
      const shared = edge.label.slice(0, common);
      const oldSuffix = edge.label.slice(common);
      const middle = new Node();
      middle.children.set(oldSuffix[0], { label: oldSuffix, node: edge.node });
      node.children.set(shared[0], { label: shared, node: middle });
      offset += common;
      if (offset === key.length) {
        middle.terminal = true;
        middle.value = value;
      } else {
        const suffix = key.slice(offset);
        middle.children.set(suffix[0], { label: suffix, node: new Node(true, value) });
      }
      this.size++;
      return true;
    }
    if (node.terminal) { node.value = value; return false; }
    node.terminal = true;
    node.value = value;
    this.size++;
    return true;
  }

  _exact(key) {
    let node = this.root, offset = 0;
    while (offset < key.length) {
      const edge = node.children.get(key[offset]);
      if (!edge || !key.startsWith(edge.label, offset)) return null;
      offset += edge.label.length;
      node = edge.node;
    }
    return node;
  }

  _prefix(prefix) {
    let node = this.root, offset = 0, base = '';
    while (offset < prefix.length) {
      const edge = node.children.get(prefix[offset]);
      if (!edge) return null;
      const remaining = prefix.slice(offset);
      if (remaining.length <= edge.label.length) {
        return edge.label.startsWith(remaining)
          ? { node: edge.node, base: base + edge.label }
          : null;
      }
      if (!remaining.startsWith(edge.label)) return null;
      base += edge.label;
      offset += edge.label.length;
      node = edge.node;
    }
    return { node, base };
  }

  has(key) {
    this._check(key);
    const node = this._exact(key);
    return Boolean(node && node.terminal);
  }

  get(key) {
    this._check(key);
    const node = this._exact(key);
    return node && node.terminal ? node.value : undefined;
  }

  startsWith(prefix) {
    this._check(prefix);
    return prefix === '' || this._prefix(prefix) !== null;
  }

  longestPrefixOf(query) {
    this._check(query);
    let node = this.root, offset = 0;
    let best = node.terminal ? '' : null;
    while (offset < query.length) {
      const edge = node.children.get(query[offset]);
      if (!edge || !query.startsWith(edge.label, offset)) break;
      offset += edge.label.length;
      node = edge.node;
      if (node.terminal) best = query.slice(0, offset);
    }
    return best;
  }

  entries(prefix = '') {
    this._check(prefix);
    const start = this._prefix(prefix);
    if (!start) return [];
    const result = [];
    const visit = (node, key) => {
      if (node.terminal) result.push([key, node.value]);
      const edges = [...node.children.values()].sort((a, b) => a.label.localeCompare(b.label));
      for (const edge of edges) visit(edge.node, key + edge.label);
    };
    visit(start.node, start.base);
    return result;
  }

  delete(key) {
    this._check(key);
    let node = this.root, offset = 0;
    const path = [];
    while (offset < key.length) {
      const edge = node.children.get(key[offset]);
      if (!edge || !key.startsWith(edge.label, offset)) return false;
      path.push({ parent: node, first: edge.label[0], edge });
      offset += edge.label.length;
      node = edge.node;
    }
    if (!node.terminal) return false;
    node.terminal = false;
    node.value = undefined;
    this.size--;
    for (let i = path.length - 1; i >= 0; i--) {
      const { parent, first, edge } = path[i];
      const child = edge.node;
      if (!child.terminal && child.children.size === 0) {
        parent.children.delete(first);
      } else if (!child.terminal && child.children.size === 1) {
        const only = child.children.values().next().value;
        parent.children.set(first, { label: edge.label + only.label, node: only.node });
      } else {
        break;
      }
    }
    return true;
  }
}

function runTests() {
  const trie = new PatriciaRadixTrie();
  assert.equal(trie.insert('car', 1), true);
  assert.equal(trie.insert('cart', 2), true);
  assert.equal(trie.insert('cat', 3), true);
  assert.equal(trie.insert('dog', 4), true);
  assert.equal(trie.insert('', 'root'), true);
  assert.equal(trie.insert('car', 10), false);
  assert.equal(trie.size, 5);
  assert.equal(trie.get('car'), 10);
  assert.equal(trie.get('ca'), undefined);
  assert.equal(trie.has('cart'), true);
  assert.equal(trie.startsWith('ca'), true);
  assert.equal(trie.startsWith('cab'), false);
  assert.equal(trie.longestPrefixOf('carpet'), 'car');
  assert.equal(trie.longestPrefixOf('zebra'), '');
  assert.deepEqual(trie.entries('ca').map(([key]) => key), ['car', 'cart', 'cat']);
  assert.deepEqual(trie.entries('car'), [['car', 10], ['cart', 2]]);
  assert.equal(trie.delete('car'), true);
  assert.equal(trie.has('car'), false);
  assert.equal(trie.has('cart'), true);
  assert.equal(trie.delete('cat'), true);
  assert.equal(trie.delete('missing'), false);
  assert.equal(trie.size, 3);
  assert.deepEqual(trie.entries().map(([key]) => key), ['', 'cart', 'dog']);
  assert.equal(trie.delete(''), true);
  assert.equal(trie.longestPrefixOf('cartwheel'), 'cart');
  assert.throws(() => trie.insert(42, 'bad'), /strings/);

  const split = new PatriciaRadixTrie();
  split.insert('foobar', 1);
  split.insert('foozip', 2);
  split.insert('foo', 3);
  assert.deepEqual(split.entries('fo'), [['foo', 3], ['foobar', 1], ['foozip', 2]]);
  split.delete('foo');
  assert.equal(split.get('foobar'), 1);
  assert.equal(split.get('foozip'), 2);
  console.log('patriciaRadixTrie: all tests passed');
}

if (require.main === module) runTests();
module.exports = { PatriciaRadixTrie };
