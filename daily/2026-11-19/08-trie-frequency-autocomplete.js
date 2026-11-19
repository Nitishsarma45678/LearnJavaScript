'use strict';

/**
 * Exercise: Implement a Unicode-aware trie that tracks word frequencies.
 *
 * insert(word) increments the frequency, delete(word) decrements one
 * occurrence and prunes dead branches, and suggest(prefix, limit) returns
 * matches ordered by descending frequency then lexicographically.
 */

class TrieNode {
  constructor() {
    this.children = new Map();
    this.frequency = 0;
  }
}

class Trie {
  constructor() {
    this.root = new TrieNode();
  }

  _assertWord(word) {
    if (typeof word !== 'string') throw new TypeError('word must be a string');
  }

  _walk(text, create = false) {
    let node = this.root;
    for (const character of text) {
      if (!node.children.has(character)) {
        if (!create) return null;
        node.children.set(character, new TrieNode());
      }
      node = node.children.get(character);
    }
    return node;
  }

  insert(word) {
    this._assertWord(word);
    this._walk(word, true).frequency += 1;
    return this;
  }

  count(word) {
    this._assertWord(word);
    const node = this._walk(word);
    return node ? node.frequency : 0;
  }

  contains(word) {
    return this.count(word) > 0;
  }

  startsWith(prefix) {
    this._assertWord(prefix);
    return this._walk(prefix) !== null;
  }

  delete(word) {
    this._assertWord(word);
    const characters = Array.from(word);
    const path = [];
    let node = this.root;

    for (const character of characters) {
      const child = node.children.get(character);
      if (!child) return false;
      path.push([node, character, child]);
      node = child;
    }
    if (node.frequency === 0) return false;

    node.frequency -= 1;
    for (let index = path.length - 1; index >= 0; index -= 1) {
      const [parent, character, child] = path[index];
      if (child.frequency === 0 && child.children.size === 0) {
        parent.children.delete(character);
      } else {
        break;
      }
    }
    return true;
  }

  suggest(prefix, limit = 5) {
    this._assertWord(prefix);
    if (!Number.isInteger(limit) || limit < 0) throw new RangeError('limit must be a non-negative integer');
    if (limit === 0) return [];

    const start = this._walk(prefix);
    if (!start) return [];
    const matches = [];

    function collect(node, word) {
      if (node.frequency > 0) matches.push({ word, frequency: node.frequency });
      for (const [character, child] of node.children) {
        collect(child, word + character);
      }
    }

    collect(start, prefix);
    matches.sort((a, b) => b.frequency - a.frequency || a.word.localeCompare(b.word));
    return matches.slice(0, limit);
  }
}

function runTests() {
  const assert = require('node:assert/strict');
  const trie = new Trie();
  ['car', 'cart', 'cat', 'cat', 'cat', 'care', 'dog', '🐈'].forEach((word) => trie.insert(word));

  assert.equal(trie.contains('cat'), true);
  assert.equal(trie.count('cat'), 3);
  assert.equal(trie.contains('ca'), false);
  assert.equal(trie.startsWith('ca'), true);
  assert.equal(trie.startsWith('z'), false);
  assert.deepEqual(trie.suggest('ca', 3).map((entry) => entry.word), ['cat', 'car', 'care']);
  assert.equal(trie.suggest('ca', 1)[0].frequency, 3);

  assert.equal(trie.delete('cat'), true);
  assert.equal(trie.count('cat'), 2);
  assert.equal(trie.delete('cart'), true);
  assert.equal(trie.contains('cart'), false);
  assert.equal(trie.startsWith('car'), true, 'the car branch must remain');
  assert.equal(trie.delete('missing'), false);
  assert.equal(trie.delete('cat'), true);
  assert.equal(trie.delete('cat'), true);
  assert.equal(trie.startsWith('cat'), false);
  assert.equal(trie.contains('🐈'), true);
  assert.deepEqual(trie.suggest('', 0), []);
  assert.throws(() => trie.suggest('ca', -1), /limit/);
}

if (require.main === module) {
  runTests();
  console.log('Trie autocomplete: all tests passed');
}

module.exports = { Trie };
