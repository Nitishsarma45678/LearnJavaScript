'use strict';

// Exercise: Build an online suffix automaton for a Unicode string.
// Support substring membership, occurrence counts, distinct-substring counts,
// and the longest common substring against another string.
//
// Expected complexity: O(n) states and transitions; O(|query|) membership;
// O(1) occurrence lookup after finalization; O(|other|) longest-common scan.

const assert = require('node:assert/strict');

class SuffixAutomaton {
  constructor(text = '') {
    this.states = [{
      next: new Map(),
      link: -1,
      length: 0,
      firstPosition: -1,
      terminalCount: 0,
      occurrences: 0
    }];
    this.last = 0;
    this.length = 0;
    this.dirty = true;
    for (const character of text) this.extend(character);
  }

  extend(character) {
    if (typeof character !== 'string' || Array.from(character).length !== 1) {
      throw new TypeError('extend expects exactly one Unicode code point');
    }

    const current = this.states.length;
    this.states.push({
      next: new Map(),
      link: 0,
      length: this.states[this.last].length + 1,
      firstPosition: this.length,
      terminalCount: 1,
      occurrences: 0
    });

    let p = this.last;
    while (p !== -1 && !this.states[p].next.has(character)) {
      this.states[p].next.set(character, current);
      p = this.states[p].link;
    }

    if (p === -1) {
      this.states[current].link = 0;
    } else {
      const q = this.states[p].next.get(character);
      if (this.states[p].length + 1 === this.states[q].length) {
        this.states[current].link = q;
      } else {
        const clone = this.states.length;
        this.states.push({
          next: new Map(this.states[q].next),
          link: this.states[q].link,
          length: this.states[p].length + 1,
          firstPosition: this.states[q].firstPosition,
          terminalCount: 0,
          occurrences: 0
        });

        while (p !== -1 && this.states[p].next.get(character) === q) {
          this.states[p].next.set(character, clone);
          p = this.states[p].link;
        }
        this.states[q].link = clone;
        this.states[current].link = clone;
      }
    }

    this.last = current;
    this.length += 1;
    this.dirty = true;
    return this;
  }

  finalize() {
    if (!this.dirty) return this;
    for (const state of this.states) state.occurrences = state.terminalCount;

    const order = this.states.map((_, index) => index);
    order.sort((a, b) => this.states[b].length - this.states[a].length);
    for (const index of order) {
      const link = this.states[index].link;
      if (link !== -1) {
        this.states[link].occurrences += this.states[index].occurrences;
      }
    }
    this.dirty = false;
    return this;
  }

  has(pattern) {
    let state = 0;
    for (const character of pattern) {
      const next = this.states[state].next.get(character);
      if (next === undefined) return false;
      state = next;
    }
    return true;
  }

  countOccurrences(pattern) {
    this.finalize();
    if (pattern.length === 0) return this.length + 1;
    let state = 0;
    for (const character of pattern) {
      const next = this.states[state].next.get(character);
      if (next === undefined) return 0;
      state = next;
    }
    return this.states[state].occurrences;
  }

  countDistinctSubstrings() {
    let total = 0;
    for (let i = 1; i < this.states.length; i += 1) {
      const state = this.states[i];
      total += state.length - this.states[state.link].length;
    }
    return total;
  }

  longestCommonSubstring(other) {
    const characters = Array.from(other);
    let state = 0;
    let matched = 0;
    let bestLength = 0;
    let bestEnd = -1;

    for (let i = 0; i < characters.length; i += 1) {
      const character = characters[i];
      while (state !== 0 && !this.states[state].next.has(character)) {
        state = this.states[state].link;
        matched = Math.min(matched, this.states[state].length);
      }

      const next = this.states[state].next.get(character);
      if (next === undefined) {
        state = 0;
        matched = 0;
      } else {
        state = next;
        matched += 1;
      }

      if (matched > bestLength) {
        bestLength = matched;
        bestEnd = i;
      }
    }

    const start = bestEnd - bestLength + 1;
    return {
      length: bestLength,
      startIndex: bestLength === 0 ? -1 : start,
      substring: bestLength === 0
        ? ''
        : characters.slice(start, bestEnd + 1).join('')
    };
  }
}

function bruteSubstrings(text) {
  const characters = Array.from(text);
  const counts = new Map();
  for (let start = 0; start < characters.length; start += 1) {
    for (let end = start + 1; end <= characters.length; end += 1) {
      const value = characters.slice(start, end).join('');
      counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  return counts;
}

function runTests() {
  const index = new SuffixAutomaton('banana');
  assert.equal(index.has('ana'), true);
  assert.equal(index.has('apple'), false);
  assert.equal(index.countOccurrences('ana'), 2);
  assert.equal(index.countOccurrences('na'), 2);
  assert.equal(index.countOccurrences(''), 7);
  assert.equal(index.countDistinctSubstrings(), 15);
  assert.deepEqual(index.longestCommonSubstring('ananas'), {
    length: 5, startIndex: 0, substring: 'anana'
  });

  index.extend('!');
  assert.equal(index.countOccurrences('ana'), 2);
  assert.equal(index.has('a!'), true);

  const unicode = new SuffixAutomaton('🙂a🙂');
  assert.equal(unicode.countOccurrences('🙂'), 2);
  assert.equal(unicode.has('a🙂'), true);

  let seed = 0x12345678;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  for (let trial = 0; trial < 80; trial += 1) {
    const length = random() % 9;
    let text = '';
    for (let i = 0; i < length; i += 1) text += 'abc'[random() % 3];
    const automaton = new SuffixAutomaton(text);
    const expected = bruteSubstrings(text);
    assert.equal(automaton.countDistinctSubstrings(), expected.size);
    for (const [pattern, count] of expected) {
      assert.equal(automaton.countOccurrences(pattern), count, text + ' / ' + pattern);
      assert.equal(automaton.has(pattern), true);
    }
    assert.equal(automaton.countOccurrences('z'), 0);
  }
  console.log('SuffixAutomaton: all tests passed');
}

if (require.main === module) runTests();
module.exports = { SuffixAutomaton };
