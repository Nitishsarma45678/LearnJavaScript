/**
 * Suffix Automaton — substring indexing without storing every suffix.
 *
 * Build in O(n) expected time for a text of n code points. Supports:
 * - distinct-substring count,
 * - pattern occurrence count,
 * - longest common substring against another text,
 * - 1-based lexicographic selection of a distinct substring.
 *
 * Run: node suffix-automaton-index.js
 */

"use strict";

const assert = require("node:assert/strict");

class SuffixAutomaton {
  constructor(text = "") {
    this.text = String(text);
    this.symbols = Array.from(this.text);
    this.states = [{ len: 0, link: -1, next: new Map(), firstEnd: -1, terminalCount: 0 }];
    this.last = 0;
    for (const symbol of this.symbols) this.extend(symbol);
    this._occurrences = null;
    this._paths = null;
  }

  extend(symbol) {
    const current = this.states.length;
    this.states.push({
      len: this.states[this.last].len + 1,
      link: 0,
      next: new Map(),
      firstEnd: this.states[this.last].len,
      terminalCount: 1
    });

    let p = this.last;
    while (p !== -1 && !this.states[p].next.has(symbol)) {
      this.states[p].next.set(symbol, current);
      p = this.states[p].link;
    }

    if (p === -1) {
      this.states[current].link = 0;
    } else {
      const q = this.states[p].next.get(symbol);
      if (this.states[p].len + 1 === this.states[q].len) {
        this.states[current].link = q;
      } else {
        const clone = this.states.length;
        this.states.push({
          len: this.states[p].len + 1,
          link: this.states[q].link,
          next: new Map(this.states[q].next),
          firstEnd: this.states[q].firstEnd,
          terminalCount: 0
        });
        while (p !== -1 && this.states[p].next.get(symbol) === q) {
          this.states[p].next.set(symbol, clone);
          p = this.states[p].link;
        }
        this.states[q].link = clone;
        this.states[current].link = clone;
      }
    }

    this.last = current;
    this._occurrences = null;
    this._paths = null;
  }

  contains(pattern) {
    let state = 0;
    for (const symbol of Array.from(String(pattern))) {
      const next = this.states[state].next.get(symbol);
      if (next === undefined) return false;
      state = next;
    }
    return true;
  }

  distinctSubstringCount() {
    let total = 0n;
    for (let i = 1; i < this.states.length; i++) {
      const state = this.states[i];
      total += BigInt(state.len - this.states[state.link].len);
    }
    return total;
  }

  occurrenceCounts() {
    if (this._occurrences) return this._occurrences.slice();
    const counts = this.states.map(state => state.terminalCount);
    const order = this.states.map((_, index) => index)
      .sort((a, b) => this.states[b].len - this.states[a].len);
    for (const index of order) {
      const link = this.states[index].link;
      if (link !== -1) counts[link] += counts[index];
    }
    this._occurrences = counts;
    return counts.slice();
  }

  countOccurrences(pattern) {
    const symbols = Array.from(String(pattern));
    if (symbols.length === 0) return this.symbols.length + 1;
    let state = 0;
    for (const symbol of symbols) {
      const next = this.states[state].next.get(symbol);
      if (next === undefined) return 0;
      state = next;
    }
    return this.occurrenceCounts()[state];
  }

  longestCommonSubstring(otherText) {
    const other = Array.from(String(otherText));
    let state = 0;
    let length = 0;
    let bestLength = 0;
    let bestEnd = -1;

    for (let i = 0; i < other.length; i++) {
      const symbol = other[i];
      while (state !== 0 && !this.states[state].next.has(symbol)) {
        state = this.states[state].link;
        length = Math.min(length, this.states[state].len);
      }
      const next = this.states[state].next.get(symbol);
      if (next !== undefined) {
        state = next;
        length++;
      } else {
        state = 0;
        length = 0;
      }
      if (length > bestLength) {
        bestLength = length;
        bestEnd = i;
      }
    }

    return {
      length: bestLength,
      substring: bestLength === 0 ? "" : other.slice(bestEnd - bestLength + 1, bestEnd + 1).join("")
    };
  }

  _pathCounts() {
    if (this._paths) return this._paths;
    const order = this.states.map((_, index) => index)
      .sort((a, b) => this.states[b].len - this.states[a].len);
    const paths = Array(this.states.length).fill(0n);
    for (const index of order) {
      let count = 0n;
      for (const next of this.states[index].next.values()) count += 1n + paths[next];
      paths[index] = count;
    }
    this._paths = paths;
    return paths;
  }

  kthDistinctSubstring(k) {
    if (typeof k !== "bigint") k = BigInt(k);
    if (k < 1n) throw new RangeError("k is 1-based and must be positive");
    const paths = this._pathCounts();
    if (k > paths[0]) return null;

    let state = 0;
    let result = "";
    while (true) {
      const edges = Array.from(this.states[state].next.entries())
        .sort((a, b) => a[0].codePointAt(0) - b[0].codePointAt(0));
      let selected = false;
      for (const [symbol, next] of edges) {
        const block = 1n + paths[next];
        if (k > block) {
          k -= block;
          continue;
        }
        result += symbol;
        if (k === 1n) return result;
        k -= 1n;
        state = next;
        selected = true;
        break;
      }
      if (!selected) throw new Error("Internal suffix-automaton path-count inconsistency");
    }
  }
}

function bruteDistinctSubstrings(text) {
  const symbols = Array.from(text);
  const found = new Set();
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j <= symbols.length; j++) found.add(symbols.slice(i, j).join(""));
  }
  return [...found].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
}

function runTests() {
  const banana = new SuffixAutomaton("banana");
  assert.equal(banana.distinctSubstringCount(), 15n);
  assert.equal(banana.countOccurrences("ana"), 2);
  assert.equal(banana.countOccurrences("na"), 2);
  assert.equal(banana.countOccurrences("missing"), 0);
  assert.equal(banana.countOccurrences(""), 7);
  assert.equal(banana.contains("ban"), true);
  assert.equal(banana.contains("nab"), false);
  assert.deepEqual(banana.longestCommonSubstring("ananas"), { length: 5, substring: "anana" });

  for (const sample of ["", "a", "aba", "ababa", "mississippi", "😀a😀"]) {
    const index = new SuffixAutomaton(sample);
    const expected = bruteDistinctSubstrings(sample);
    assert.equal(index.distinctSubstringCount(), BigInt(expected.length));
    for (let k = 1; k <= expected.length; k++) {
      assert.equal(index.kthDistinctSubstring(BigInt(k)), expected[k - 1]);
    }
    assert.equal(index.kthDistinctSubstring(BigInt(expected.length + 1)), null);
  }

  let seed = 0x51ff1;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let trial = 0; trial < 120; trial++) {
    const text = Array.from({ length: 1 + Math.floor(random() * 9) },
      () => "abc"[Math.floor(random() * 3)]).join("");
    const index = new SuffixAutomaton(text);
    const all = bruteDistinctSubstrings(text);
    assert.equal(index.distinctSubstringCount(), BigInt(all.length));
    for (const candidate of ["a", "b", "ab", "cc", "abc"]) {
      const expected = Array.from(text.matchAll(new RegExp("(?=" + candidate + ")", "g"))).length;
      assert.equal(index.countOccurrences(candidate), expected);
    }
  }

  console.log("SuffixAutomaton: all tests passed");
}

module.exports = { SuffixAutomaton, bruteDistinctSubstrings };

if (require.main === module) runTests();
