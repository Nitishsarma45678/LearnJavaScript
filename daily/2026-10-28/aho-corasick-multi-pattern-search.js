'use strict';

// Aho-Corasick searches many patterns in one pass through the text.
// Time complexity is O(text length + matches), after trie construction.
const assert = require('node:assert/strict');

class AhoCorasick {
  constructor(patterns) {
    if (!Array.isArray(patterns) ||
        patterns.some(pattern => typeof pattern !== 'string' || pattern.length === 0)) {
      throw new TypeError('patterns must be an array of non-empty strings');
    }

    this.patterns = [...patterns];
    this.nodes = [{ next: new Map(), fail: 0, outputs: [] }];

    this.patterns.forEach((pattern, patternIndex) => {
      let state = 0;
      for (const char of pattern) {
        let nextState = this.nodes[state].next.get(char);
        if (nextState === undefined) {
          nextState = this.nodes.length;
          this.nodes[state].next.set(char, nextState);
          this.nodes.push({ next: new Map(), fail: 0, outputs: [] });
        }
        state = nextState;
      }
      this.nodes[state].outputs.push(patternIndex);
    });

    this._buildFailureLinks();
  }

  _buildFailureLinks() {
    const queue = [];
    for (const child of this.nodes[0].next.values()) {
      this.nodes[child].fail = 0;
      queue.push(child);
    }

    for (let head = 0; head < queue.length; head += 1) {
      const state = queue[head];

      for (const [char, child] of this.nodes[state].next) {
        let fallback = this.nodes[state].fail;
        while (fallback !== 0 && !this.nodes[fallback].next.has(char)) {
          fallback = this.nodes[fallback].fail;
        }

        const candidate = this.nodes[fallback].next.get(char);
        this.nodes[child].fail =
          candidate !== undefined && candidate !== child ? candidate : 0;
        this.nodes[child].outputs.push(...this.nodes[this.nodes[child].fail].outputs);
        queue.push(child);
      }
    }
  }

  search(text) {
    if (typeof text !== 'string') throw new TypeError('text must be a string');

    const matches = [];
    let state = 0;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      while (state !== 0 && !this.nodes[state].next.has(char)) {
        state = this.nodes[state].fail;
      }
      if (this.nodes[state].next.has(char)) {
        state = this.nodes[state].next.get(char);
      }

      for (const patternIndex of this.nodes[state].outputs) {
        const pattern = this.patterns[patternIndex];
        matches.push({ pattern, index: index - pattern.length + 1, patternIndex });
      }
    }

    return matches;
  }
}

// Example tests, including overlaps, suffix matches, and duplicate patterns.
const matcher = new AhoCorasick(['he', 'she', 'hers', 'his']);
const found = matcher.search('ahishers')
  .map(({ pattern, index }) => ({ pattern, index }))
  .sort((a, b) => a.index - b.index || a.pattern.localeCompare(b.pattern));

assert.deepEqual(found, [
  { pattern: 'his', index: 1 },
  { pattern: 'she', index: 3 },
  { pattern: 'he', index: 4 },
  { pattern: 'hers', index: 4 }
]);

const overlapping = new AhoCorasick(['a', 'aa', 'aaa']).search('aaaa');
assert.equal(overlapping.length, 9);

const duplicates = new AhoCorasick(['he', 'he']).search('he');
assert.equal(duplicates.length, 2);
assert.throws(() => new AhoCorasick(['ok', '']), TypeError);
assert.throws(() => matcher.search(null), TypeError);

console.log('AhoCorasick tests passed.');
