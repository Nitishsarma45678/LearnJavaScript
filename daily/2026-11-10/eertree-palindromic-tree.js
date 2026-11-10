'use strict';

/**
 * Exercise: implement an online palindromic tree (Eertree).
 *
 * Each distinct palindrome is represented by one node. Appending a code point
 * updates the longest palindromic suffix in amortized O(1) time, while the
 * suffix-link tree can later aggregate occurrence counts for every palindrome.
 *
 * Run: node eertree-palindromic-tree.js
 */

const assert = require('node:assert/strict');

class Eertree {
  constructor() {
    // Node 0 is the odd root (-1); node 1 is the even root (0).
    this.nodes = [
      { length: -1, link: 0, next: new Map(), suffixCount: 0, firstEnd: -1, occurrences: 0 },
      { length: 0, link: 0, next: new Map(), suffixCount: 0, firstEnd: -1, occurrences: 0 }
    ];
    this.text = [];
    this.last = 1;
    this.longestNode = 1;
  }

  append(character) {
    const parts = Array.from(character);
    if (parts.length !== 1) {
      throw new TypeError('append() expects exactly one Unicode code point');
    }

    const ch = parts[0];
    const position = this.text.length;
    this.text.push(ch);

    let current = this.last;
    while (true) {
      const left = position - 1 - this.nodes[current].length;
      if (left >= 0 && this.text[left] === ch) break;
      current = this.nodes[current].link;
    }

    const existing = this.nodes[current].next.get(ch);
    if (existing !== undefined) {
      this.last = existing;
      this.nodes[existing].occurrences += 1;
      if (this.nodes[existing].length > this.nodes[this.longestNode].length) {
        this.longestNode = existing;
      }
      return existing;
    }

    const id = this.nodes.length;
    const length = this.nodes[current].length + 2;
    const node = {
      length,
      link: 1,
      next: new Map(),
      suffixCount: 0,
      firstEnd: position,
      occurrences: 1
    };
    this.nodes.push(node);
    this.nodes[current].next.set(ch, id);

    if (length > 1) {
      let candidate = this.nodes[current].link;
      while (true) {
        const left = position - 1 - this.nodes[candidate].length;
        if (left >= 0 && this.text[left] === ch) break;
        candidate = this.nodes[candidate].link;
      }
      const suffix = this.nodes[candidate].next.get(ch);
      if (suffix === undefined) {
        throw new Error('Eertree invariant violated: suffix palindrome is missing');
      }
      node.link = suffix;
    }

    node.suffixCount = 1 + this.nodes[node.link].suffixCount;
    this.last = id;
    if (length > this.nodes[this.longestNode].length) this.longestNode = id;
    return id;
  }

  appendAll(value) {
    for (const character of Array.from(value)) this.append(character);
    return this;
  }

  get length() {
    return this.text.length;
  }

  get distinctCount() {
    return this.nodes.length - 2;
  }

  get longestPalindrome() {
    const node = this.nodes[this.longestNode];
    if (node.length <= 0) return '';
    return this.text.slice(node.firstEnd - node.length + 1, node.firstEnd + 1).join('');
  }

  distinctPalindromes() {
    return this.nodes.slice(2).map(node => ({
      value: this.text.slice(node.firstEnd - node.length + 1, node.firstEnd + 1).join(''),
      length: node.length
    }));
  }

  palindromeCounts() {
    const counts = this.nodes.map(node => node.occurrences);
    const ids = [];
    for (let id = 2; id < this.nodes.length; id += 1) ids.push(id);
    ids.sort((a, b) => this.nodes[b].length - this.nodes[a].length);

    // Every occurrence of a palindrome is also an occurrence of its suffix link.
    for (const id of ids) counts[this.nodes[id].link] += counts[id];

    const result = new Map();
    for (let id = 2; id < this.nodes.length; id += 1) {
      const node = this.nodes[id];
      const value = this.text.slice(node.firstEnd - node.length + 1, node.firstEnd + 1).join('');
      result.set(value, counts[id]);
    }
    return result;
  }

  validate() {
    assert.equal(this.nodes[0].length, -1);
    assert.equal(this.nodes[1].length, 0);
    for (let id = 2; id < this.nodes.length; id += 1) {
      const node = this.nodes[id];
      assert.ok(node.length > 0);
      assert.ok(node.link >= 1 && node.link < this.nodes.length);
      assert.ok(this.nodes[node.link].length < node.length);
      assert.equal(node.suffixCount, 1 + this.nodes[node.link].suffixCount);
    }
    assert.ok(this.last >= 1 && this.last < this.nodes.length);
    return true;
  }
}

function brutePalindromeCounts(value) {
  const chars = Array.from(value);
  const counts = new Map();
  for (let start = 0; start < chars.length; start += 1) {
    for (let end = start + 1; end <= chars.length; end += 1) {
      const part = chars.slice(start, end);
      if (part.join('') === part.slice().reverse().join('')) {
        const key = part.join('');
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  }
  return counts;
}

function runTests() {
  const tree = new Eertree().appendAll('ababa');
  assert.equal(tree.distinctCount, 5);
  assert.equal(tree.longestPalindrome, 'ababa');
  assert.deepEqual([...tree.palindromeCounts()].sort(), [
    ['a', 3], ['aba', 2], ['ababa', 1], ['b', 2], ['bab', 1]
  ]);
  assert.equal(tree.validate(), true);

  const repeated = new Eertree().appendAll('aaaa');
  assert.equal(repeated.distinctCount, 4);
  assert.deepEqual([...repeated.palindromeCounts()].sort(), [
    ['a', 4], ['aa', 3], ['aaa', 2], ['aaaa', 1]
  ]);

  const unicode = new Eertree().appendAll('🙂a🙂');
  assert.equal(unicode.longestPalindrome, '🙂a🙂');
  assert.throws(() => unicode.append('two'), /one Unicode code point/);

  let seed = 0x51f15e;
  const random = max => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % max;
  };
  for (let trial = 0; trial < 250; trial += 1) {
    const chars = Array.from({ length: random(13) }, () => 'abc'[random(3)]);
    const input = chars.join('');
    const actual = new Eertree().appendAll(input);
    const expected = brutePalindromeCounts(input);
    assert.deepEqual([...actual.palindromeCounts()].sort(), [...expected].sort(), input);
    assert.equal(actual.distinctCount, expected.size);
    assert.equal(actual.validate(), true);
  }
  console.log('Eertree tests passed');
}

if (require.main === module) runTests();

module.exports = { Eertree, brutePalindromeCounts };
