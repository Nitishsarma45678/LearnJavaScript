'use strict';

/**
 * Suffix automaton for a Unicode string (iterated by code point).
 * Supports substring occurrence counts, distinct-substring counting, and
 * longest repeated substring queries in linear or near-linear time.
 */
class SuffixAutomaton {
  constructor(text = '') {
    if (typeof text !== 'string') throw new TypeError('text must be a string');
    this.text = Array.from(text);
    this.states = [{ length: 0, link: -1, next: new Map(), firstPosition: -1, occurrences: 0 }];
    this.last = 0;
    this.processed = 0;
    for (const character of this.text) this.#extend(character);
    this.#computeOccurrences();
  }

  #extend(character) {
    const current = this.states.length;
    this.states.push({
      length: this.states[this.last].length + 1,
      link: 0,
      next: new Map(),
      firstPosition: this.processed,
      occurrences: 1
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
          length: this.states[p].length + 1,
          link: this.states[q].link,
          next: new Map(this.states[q].next),
          firstPosition: this.states[q].firstPosition,
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
    this.processed += 1;
  }

  #computeOccurrences() {
    const ordered = this.states.map((state, index) => index)
      .sort((a, b) => this.states[b].length - this.states[a].length);
    for (const index of ordered) {
      const link = this.states[index].link;
      if (link !== -1) this.states[link].occurrences += this.states[index].occurrences;
    }
  }

  countOccurrences(pattern) {
    if (typeof pattern !== 'string') throw new TypeError('pattern must be a string');
    const characters = Array.from(pattern);
    if (characters.length === 0) return this.text.length + 1;
    let state = 0;
    for (const character of characters) {
      const next = this.states[state].next.get(character);
      if (next === undefined) return 0;
      state = next;
    }
    return this.states[state].occurrences;
  }

  get distinctSubstringCount() {
    let total = 0;
    for (let i = 1; i < this.states.length; i += 1) {
      total += this.states[i].length - this.states[this.states[i].link].length;
    }
    return total;
  }

  longestRepeatedSubstring(minOccurrences = 2) {
    if (!Number.isSafeInteger(minOccurrences) || minOccurrences < 2) {
      throw new RangeError('minOccurrences must be an integer of at least 2');
    }
    let best = '';
    let bestLength = 0;
    for (const state of this.states) {
      if (state.occurrences < minOccurrences || state.length <= bestLength) continue;
      const start = state.firstPosition - state.length + 1;
      best = this.text.slice(start, state.firstPosition + 1).join('');
      bestLength = state.length;
    }
    return best;
  }
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  const banana = new SuffixAutomaton('banana');
  assert.equal(banana.countOccurrences('ana'), 2);
  assert.equal(banana.countOccurrences('na'), 2);
  assert.equal(banana.countOccurrences('apple'), 0);
  assert.equal(banana.countOccurrences(''), 7);
  assert.equal(banana.distinctSubstringCount, 15);
  assert.equal(banana.longestRepeatedSubstring(), 'ana');
  assert.equal(new SuffixAutomaton('aaaa').distinctSubstringCount, 4);
  assert.equal(new SuffixAutomaton('aaaa').countOccurrences('aa'), 3);
  assert.equal(new SuffixAutomaton('🙂🙂🙂').longestRepeatedSubstring(), '🙂🙂');
  assert.equal(new SuffixAutomaton('abc').longestRepeatedSubstring(), '');
  const unicode = new SuffixAutomaton('🙂a🙂a🙂');
  assert.equal(unicode.countOccurrences('🙂a'), 2);
  assert.equal(unicode.longestRepeatedSubstring(), '🙂a🙂');
  assert.throws(() => banana.longestRepeatedSubstring(1), /at least 2/);
  console.log('Suffix automaton tests passed');
}

module.exports = { SuffixAutomaton };
