'use strict';

/*
 * Exercise: Build a suffix automaton for fast substring queries.
 *
 * Implement:
 *   - substring membership and occurrence counting;
 *   - the number of distinct non-empty substrings;
 *   - the kth distinct substring in code-point lexicographic order;
 *   - the longest common substring against another string.
 *
 * A suffix automaton has O(n) states and transitions for a text of n
 * code points. Occurrence counts are propagated through suffix links.
 */

const assert = require('node:assert/strict');

class SuffixAutomaton {
  constructor(text) {
    this.text = String(text);
    this.symbols = Array.from(this.text);
    this.states = [{
      length: 0,
      link: -1,
      next: new Map(),
      firstPosition: -1,
      occurrences: 0
    }];
    this.last = 0;
    this._build();
    this._propagateOccurrences();
  }

  _build() {
    for (let position = 0; position < this.symbols.length; position += 1) {
      const symbol = this.symbols[position];
      const current = this.states.length;
      this.states.push({
        length: this.states[this.last].length + 1,
        link: 0,
        next: new Map(),
        firstPosition: position,
        occurrences: 1
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

          while (p !== -1 && this.states[p].next.get(symbol) === q) {
            this.states[p].next.set(symbol, clone);
            p = this.states[p].link;
          }
          this.states[q].link = clone;
          this.states[current].link = clone;
        }
      }
      this.last = current;
    }
  }

  _descendingStates() {
    return this.states
      .map((state, index) => ({ index, length: state.length }))
      .sort((a, b) => b.length - a.length)
      .map(item => item.index);
  }

  _propagateOccurrences() {
    for (const index of this._descendingStates()) {
      const parent = this.states[index].link;
      if (parent !== -1) {
        this.states[parent].occurrences += this.states[index].occurrences;
      }
    }
  }

  _follow(pattern) {
    let state = 0;
    for (const symbol of Array.from(String(pattern))) {
      const next = this.states[state].next.get(symbol);
      if (next === undefined) return -1;
      state = next;
    }
    return state;
  }

  contains(pattern) {
    return this._follow(pattern) !== -1;
  }

  countOccurrences(pattern) {
    const symbols = Array.from(String(pattern));
    if (symbols.length === 0) return this.symbols.length + 1;
    const state = this._follow(pattern);
    return state === -1 ? 0 : this.states[state].occurrences;
  }

  countDistinctSubstrings() {
    let total = 0n;
    for (let index = 1; index < this.states.length; index += 1) {
      const state = this.states[index];
      total += BigInt(state.length - this.states[state.link].length);
    }
    return total;
  }

  _pathCounts() {
    const ways = Array(this.states.length).fill(0n);
    for (const index of this._descendingStates()) {
      let count = 0n;
      for (const target of this.states[index].next.values()) {
        count += 1n + ways[target];
      }
      ways[index] = count;
    }
    return ways;
  }

  kthDistinctSubstring(k) {
    if (typeof k === 'number') {
      if (!Number.isSafeInteger(k)) throw new TypeError('k must be a safe integer or BigInt');
      k = BigInt(k);
    }
    if (typeof k !== 'bigint' || k < 1n) {
      throw new RangeError('k is a 1-based positive integer');
    }

    const ways = this._pathCounts();
    if (k > ways[0]) throw new RangeError('k exceeds the number of distinct substrings');

    const compareSymbols = (a, b) => a.codePointAt(0) - b.codePointAt(0);
    let state = 0;
    let result = '';

    while (true) {
      const edges = Array.from(this.states[state].next.entries())
        .sort((a, b) => compareSymbols(a[0], b[0]));
      let selected = false;

      for (const [symbol, target] of edges) {
        const blockSize = 1n + ways[target];
        if (k > blockSize) {
          k -= blockSize;
          continue;
        }

        result += symbol;
        if (k === 1n) return result;
        k -= 1n;
        state = target;
        selected = true;
        break;
      }
      if (!selected) throw new Error('Internal path-count inconsistency');
    }
  }

  longestCommonSubstring(otherText) {
    const other = Array.from(String(otherText));
    let state = 0;
    let length = 0;
    let bestLength = 0;
    let bestEndOther = -1;
    let bestEndThis = -1;

    for (let index = 0; index < other.length; index += 1) {
      const symbol = other[index];

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
        bestEndOther = index;
        bestEndThis = this.states[state].firstPosition;
      }
    }

    const startOther = bestEndOther - bestLength + 1;
    const startThis = bestEndThis - bestLength + 1;
    return {
      length: bestLength,
      substring: bestLength === 0
        ? ''
        : other.slice(startOther, bestEndOther + 1).join(''),
      startInThis: bestLength === 0 ? -1 : startThis,
      startInOther: bestLength === 0 ? -1 : startOther
    };
  }
}

// Example usage and tests.
function runTests() {
  const sam = new SuffixAutomaton('banana');
  assert.equal(sam.contains('ana'), true);
  assert.equal(sam.contains('apple'), false);
  assert.equal(sam.countOccurrences('ana'), 2);
  assert.equal(sam.countOccurrences('na'), 2);
  assert.equal(sam.countOccurrences(''), 7);
  assert.equal(sam.countDistinctSubstrings(), 15n);

  const all = [];
  for (let i = 1n; i <= sam.countDistinctSubstrings(); i += 1n) {
    all.push(sam.kthDistinctSubstring(i));
  }
  const expected = Array.from(new Set(
    Array.from({ length: 6 }, (_, start) =>
      Array.from({ length: 6 - start }, (_, offset) =>
        Array.from('banana').slice(start, start + offset + 1).join('')
      )
    ).flat()
  )).sort((a, b) => {
    const aa = Array.from(a);
    const bb = Array.from(b);
    for (let i = 0; i < Math.min(aa.length, bb.length); i += 1) {
      const difference = aa[i].codePointAt(0) - bb[i].codePointAt(0);
      if (difference) return difference;
    }
    return aa.length - bb.length;
  });
  assert.deepEqual(all, expected);
  assert.throws(() => sam.kthDistinctSubstring(16), RangeError);

  const common = new SuffixAutomaton('xabxac').longestCommonSubstring('abcabxabcd');
  assert.equal(common.length, 4);
  assert.equal(common.substring, 'abxa');

  const unicode = new SuffixAutomaton('🙂a🙂');
  assert.equal(unicode.countOccurrences('🙂'), 2);
  assert.equal(unicode.countDistinctSubstrings(), 5n);

  // Randomized cross-check against a naive set and occurrence counter.
  let seed = 712367;
  const random = max => {
    seed = (seed * 48271) % 2147483647;
    return seed % max;
  };
  for (let trial = 0; trial < 120; trial += 1) {
    const alphabet = ['a', 'b', 'c'];
    const text = Array.from({ length: random(9) }, () => alphabet[random(3)]).join('');
    const index = new SuffixAutomaton(text);
    const naive = new Set();
    for (let start = 0; start < text.length; start += 1) {
      for (let end = start + 1; end <= text.length; end += 1) {
        naive.add(text.slice(start, end));
      }
    }
    assert.equal(index.countDistinctSubstrings(), BigInt(naive.size));
    for (const candidate of ['', 'a', 'b', 'ab', 'cc']) {
      let count = 0;
      if (candidate === '') count = text.length + 1;
      else {
        for (let at = text.indexOf(candidate); at !== -1;
          at = text.indexOf(candidate, at + 1)) count += 1;
      }
      assert.equal(index.countOccurrences(candidate), count);
    }
    const ordered = Array.from(naive).sort();
    for (let k = 0; k < ordered.length; k += 1) {
      assert.equal(index.kthDistinctSubstring(BigInt(k + 1)), ordered[k]);
    }
  }

  console.log('SuffixAutomaton: all tests passed');
}

if (require.main === module) runTests();

module.exports = { SuffixAutomaton };
