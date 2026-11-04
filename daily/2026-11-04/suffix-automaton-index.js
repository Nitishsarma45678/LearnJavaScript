"use strict";

const assert = require("node:assert/strict");

/**
 * Suffix automaton for a string.
 *
 * Supports:
 * - contains(pattern): O(|pattern|)
 * - countOccurrences(pattern): O(|pattern|) after O(n log n) preprocessing
 * - countDistinctSubstrings(): O(number of states)
 * - longestCommonSubstring(other): O(|other|)
 *
 * Symbols are Unicode code points rather than UTF-16 code units.
 */
class SuffixAutomaton {
  constructor(text) {
    if (typeof text !== "string") {
      throw new TypeError("text must be a string");
    }

    this.text = text;
    this.symbols = Array.from(text);
    this.states = [{
      length: 0,
      link: -1,
      next: new Map(),
      firstPosition: -1,
      occurrences: 0
    }];
    this.last = 0;

    for (let i = 0; i < this.symbols.length; i += 1) {
      this._extend(this.symbols[i], i);
    }

    this._propagateOccurrences();
  }

  _extend(symbol, position) {
    const states = this.states;
    const current = states.length;

    states.push({
      length: states[this.last].length + 1,
      link: 0,
      next: new Map(),
      firstPosition: position,
      occurrences: 1
    });

    let p = this.last;
    while (p !== -1 && !states[p].next.has(symbol)) {
      states[p].next.set(symbol, current);
      p = states[p].link;
    }

    if (p === -1) {
      states[current].link = 0;
    } else {
      const q = states[p].next.get(symbol);

      if (states[p].length + 1 === states[q].length) {
        states[current].link = q;
      } else {
        const clone = states.length;
        states.push({
          length: states[p].length + 1,
          link: states[q].link,
          next: new Map(states[q].next),
          firstPosition: states[q].firstPosition,
          occurrences: 0
        });

        while (p !== -1 && states[p].next.get(symbol) === q) {
          states[p].next.set(symbol, clone);
          p = states[p].link;
        }

        states[q].link = clone;
        states[current].link = clone;
      }
    }

    this.last = current;
  }

  _propagateOccurrences() {
    const order = this.states
      .map((state, index) => index)
      .sort((a, b) => this.states[b].length - this.states[a].length);

    for (const index of order) {
      const link = this.states[index].link;
      if (link !== -1) {
        this.states[link].occurrences += this.states[index].occurrences;
      }
    }
  }

  _walk(pattern) {
    let state = 0;
    for (const symbol of Array.from(pattern)) {
      const next = this.states[state].next.get(symbol);
      if (next === undefined) {
        return -1;
      }
      state = next;
    }
    return state;
  }

  contains(pattern) {
    if (typeof pattern !== "string") {
      throw new TypeError("pattern must be a string");
    }
    return pattern.length === 0 || this._walk(pattern) !== -1;
  }

  countOccurrences(pattern) {
    if (typeof pattern !== "string") {
      throw new TypeError("pattern must be a string");
    }
    if (pattern.length === 0) {
      return this.symbols.length + 1;
    }

    const state = this._walk(pattern);
    return state === -1 ? 0 : this.states[state].occurrences;
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
    if (typeof other !== "string") {
      throw new TypeError("other must be a string");
    }

    const symbols = Array.from(other);
    let state = 0;
    let length = 0;
    let bestLength = 0;
    let bestEnd = -1;

    for (let i = 0; i < symbols.length; i += 1) {
      const symbol = symbols[i];

      while (state !== 0 && !this.states[state].next.has(symbol)) {
        state = this.states[state].link;
        length = Math.min(length, this.states[state].length);
      }

      if (this.states[state].next.has(symbol)) {
        state = this.states[state].next.get(symbol);
        length += 1;
      } else {
        state = 0;
        length = 0;
      }

      if (length > bestLength) {
        bestLength = length;
        bestEnd = i;
      }
    }

    const substring = bestLength === 0
      ? ""
      : symbols.slice(bestEnd - bestLength + 1, bestEnd + 1).join("");

    return { length: bestLength, substring };
  }
}

// Example usage and regression tests.
const index = new SuffixAutomaton("banana");
assert.equal(index.contains("ana"), true);
assert.equal(index.contains("apple"), false);
assert.equal(index.countOccurrences("ana"), 2);
assert.equal(index.countOccurrences("na"), 2);
assert.equal(index.countOccurrences(""), 7);
assert.equal(index.countDistinctSubstrings(), 15);
assert.deepEqual(index.longestCommonSubstring("ananas"), {
  length: 5,
  substring: "anana"
});
assert.deepEqual(index.longestCommonSubstring("xyz"), {
  length: 0,
  substring: ""
});

const unicodeIndex = new SuffixAutomaton("😀a😀");
assert.equal(unicodeIndex.countOccurrences("😀"), 2);
assert.equal(unicodeIndex.contains("a😀"), true);

assert.throws(() => new SuffixAutomaton(null), TypeError);
assert.throws(() => index.contains(42), TypeError);

console.log("SuffixAutomaton tests passed.");

module.exports = { SuffixAutomaton };
