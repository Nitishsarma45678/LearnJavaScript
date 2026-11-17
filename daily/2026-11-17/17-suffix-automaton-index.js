'use strict';

/**
 * Suffix Automaton String Index
 * -----------------------------
 * Build a compact automaton for all substrings of a source string. It supports
 * membership, occurrence counts, longest-common-substring queries, the number
 * of distinct substrings, and 1-based lexicographic selection of a distinct
 * substring. Input is indexed by Unicode code points rather than UTF-16 units.
 *
 * Construction is O(n) expected time with Map transitions. Occurrence counts
 * are propagated through suffix links in O(n log n); each LCS query is O(m),
 * and distinct-substring counting / kth selection uses BigInt path counts.
 */

class SuffixAutomaton {
  #occurrences;
  #ways;

  constructor(text) {
    if (typeof text !== 'string') throw new TypeError('text must be a string');
    this.text = text;
    this.symbols = Array.from(text);
    this.states = [{ length: 0, link: -1, next: new Map(), firstPosition: -1, terminalCount: 0 }];
    this.last = 0;
    for (let index = 0; index < this.symbols.length; index += 1) {
      this.#extend(this.symbols[index], index);
    }
    this.#occurrences = null;
    this.#ways = null;
  }

  #extend(symbol, position) {
    const states = this.states;
    const current = states.length;
    states.push({ length: states[this.last].length + 1, link: 0, next: new Map(), firstPosition: position, terminalCount: 1 });
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
          terminalCount: 0,
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

  #walk(pattern) {
    let state = 0;
    for (const symbol of Array.from(pattern)) {
      const next = this.states[state].next.get(symbol);
      if (next === undefined) return -1;
      state = next;
    }
    return state;
  }

  contains(pattern) {
    if (typeof pattern !== 'string') throw new TypeError('pattern must be a string');
    return pattern.length === 0 || this.#walk(pattern) !== -1;
  }

  #getOccurrenceCounts() {
    if (this.#occurrences) return this.#occurrences;
    const counts = this.states.map((state) => state.terminalCount);
    const order = this.states.map((_, index) => index).sort((a, b) => this.states[b].length - this.states[a].length);
    for (const index of order) {
      const link = this.states[index].link;
      if (link !== -1) counts[link] += counts[index];
    }
    this.#occurrences = counts;
    return counts;
  }

  countOccurrences(pattern) {
    if (typeof pattern !== 'string') throw new TypeError('pattern must be a string');
    if (pattern.length === 0) return this.symbols.length + 1;
    const state = this.#walk(pattern);
    return state === -1 ? 0 : this.#getOccurrenceCounts()[state];
  }

  longestRepeatedSubstring() {
    const counts = this.#getOccurrenceCounts();
    let best = { substring: '', length: 0, occurrences: 0, start: -1 };
    for (let index = 1; index < this.states.length; index += 1) {
      const state = this.states[index];
      if (counts[index] >= 2 && state.length > best.length) {
        const start = state.firstPosition - state.length + 1;
        best = {
          substring: this.symbols.slice(start, state.firstPosition + 1).join(''),
          length: state.length,
          occurrences: counts[index],
          start,
        };
      }
    }
    return best;
  }

  longestCommonSubstring(other) {
    if (typeof other !== 'string') throw new TypeError('other must be a string');
    let stateIndex = 0;
    let length = 0;
    let best = { substring: '', length: 0, startInText: -1, startInOther: -1 };
    const symbols = Array.from(other);
    for (let index = 0; index < symbols.length; index += 1) {
      const symbol = symbols[index];
      while (stateIndex !== 0 && !this.states[stateIndex].next.has(symbol)) {
        stateIndex = this.states[stateIndex].link;
        length = Math.min(length, this.states[stateIndex].length);
      }
      const next = this.states[stateIndex].next.get(symbol);
      if (next === undefined) {
        stateIndex = 0;
        length = 0;
        continue;
      }
      stateIndex = next;
      length += 1;
      if (length > best.length) {
        const startInOther = index - length + 1;
        const startInText = this.states[stateIndex].firstPosition - length + 1;
        best = {
          substring: symbols.slice(startInOther, index + 1).join(''),
          length,
          startInText,
          startInOther,
        };
      }
    }
    return best;
  }

  #getPathCounts() {
    if (this.#ways) return this.#ways;
    const ways = Array(this.states.length).fill(0n);
    const order = this.states.map((_, index) => index).sort((a, b) => this.states[b].length - this.states[a].length);
    for (const index of order) {
      for (const next of this.states[index].next.values()) ways[index] += 1n + ways[next];
    }
    this.#ways = ways;
    return ways;
  }

  distinctSubstringCount() {
    return this.#getPathCounts()[0];
  }

  kthDistinctSubstring(k) {
    if (typeof k === 'number') {
      if (!Number.isSafeInteger(k)) throw new TypeError('numeric k must be a safe integer');
      k = BigInt(k);
    }
    if (typeof k !== 'bigint' || k < 1n) throw new RangeError('k must be a positive integer');
    const ways = this.#getPathCounts();
    if (k > ways[0]) return null;
    let state = 0;
    let result = '';
    while (k > 0n) {
      const transitions = [...this.states[state].next.entries()].sort(([a], [b]) => a.codePointAt(0) - b.codePointAt(0));
      let selected = false;
      for (const [symbol, next] of transitions) {
        const block = 1n + ways[next];
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
      if (!selected) throw new Error('internal kth-substring invariant failed');
    }
    return result;
  }
}

function runTests() {
  const assert = require('node:assert/strict');
  const index = new SuffixAutomaton('banana');
  assert.equal(index.contains('ana'), true);
  assert.equal(index.contains('apple'), false);
  assert.equal(index.countOccurrences('ana'), 2);
  assert.equal(index.countOccurrences('na'), 2);
  assert.equal(index.countOccurrences(''), 7);
  assert.equal(index.distinctSubstringCount(), 15n);
  assert.deepEqual(index.longestRepeatedSubstring(), { substring: 'ana', length: 3, occurrences: 2, start: 1 });
  assert.equal(index.longestCommonSubstring('ananas').substring, 'anana');

  const unique = [...new Set(Array.from('banana').flatMap((_, start, chars) =>
    chars.slice(start).map((__, offset) => chars.slice(start, start + offset + 1).join(''))))].sort();
  assert.equal(index.distinctSubstringCount(), BigInt(unique.length));
  unique.forEach((value, position) => assert.equal(index.kthDistinctSubstring(BigInt(position + 1)), value));
  assert.equal(index.kthDistinctSubstring(16n), null);
  assert.throws(() => index.kthDistinctSubstring(0), /positive/);

  const unicode = new SuffixAutomaton('🙂a🙂a界');
  assert.equal(unicode.countOccurrences('🙂a'), 2);
  assert.equal(unicode.contains('a界'), true);
  // Verify selection order on a small source with supplementary-plane symbols.
  const unicodeIndex = new SuffixAutomaton('🙂a');
  const unicodeExpected = ['a', '🙂', '🙂a'];
  unicodeExpected.forEach((value, position) => assert.equal(unicodeIndex.kthDistinctSubstring(position + 1), value));
  const lcs = unicode.longestCommonSubstring('x🙂a界y');
  assert.equal(lcs.substring, '🙂a界');
  assert.equal(lcs.length, 3);

  let seed = 0xabc123;
  const random = (limit) => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed % limit;
  };
  const alphabet = ['a', 'b', 'c'];
  for (let trial = 0; trial < 100; trial += 1) {
    const text = Array.from({ length: random(9) }, () => alphabet[random(alphabet.length)]).join('');
    const automaton = new SuffixAutomaton(text);
    const substrings = new Set();
    for (let start = 0; start < text.length; start += 1) {
      for (let end = start + 1; end <= text.length; end += 1) substrings.add(text.slice(start, end));
    }
    const sorted = [...substrings].sort();
    assert.equal(automaton.distinctSubstringCount(), BigInt(sorted.length));
    sorted.forEach((value, position) => assert.equal(automaton.kthDistinctSubstring(position + 1), value));
    for (const pattern of ['a', 'ab', 'bc', 'cc', '']) {
      let expected = 0;
      if (pattern === '') expected = text.length + 1;
      else for (let at = text.indexOf(pattern); at !== -1; at = text.indexOf(pattern, at + 1)) expected += 1;
      assert.equal(automaton.countOccurrences(pattern), expected);
    }
  }
}

if (require.main === module) {
  runTests();
  console.log('Suffix Automaton String Index: all tests passed');
}

module.exports = { SuffixAutomaton };
