'use strict';

const assert = require('node:assert/strict');

/**
 * Incremental Knuth-Morris-Pratt matcher.
 * Returned offsets are UTF-16 code-unit offsets, matching String#indexOf.
 * Matches may overlap and may span any number of pushed chunks.
 */
class StreamingKMP {
  constructor(pattern) {
    if (typeof pattern !== 'string' || pattern.length === 0) {
      throw new TypeError('pattern must be a non-empty string');
    }
    this.pattern = pattern;
    this.prefix = this.#buildPrefix(pattern);
    this.matched = 0;
    this.offset = 0;
  }

  #buildPrefix(pattern) {
    const prefix = Array(pattern.length).fill(0);
    for (let i = 1, j = 0; i < pattern.length; i++) {
      while (j > 0 && pattern[i] !== pattern[j]) j = prefix[j - 1];
      if (pattern[i] === pattern[j]) j++;
      prefix[i] = j;
    }
    return prefix;
  }

  push(chunk) {
    if (typeof chunk !== 'string') throw new TypeError('chunk must be a string');
    const matches = [];
    const m = this.pattern.length;

    for (let i = 0; i < chunk.length; i++) {
      const codeUnit = chunk[i];
      while (this.matched > 0 && codeUnit !== this.pattern[this.matched]) {
        this.matched = this.prefix[this.matched - 1];
      }
      if (codeUnit === this.pattern[this.matched]) this.matched++;

      if (this.matched === m) {
        matches.push(this.offset + i - m + 1);
        this.matched = this.prefix[this.matched - 1];
      }
    }

    this.offset += chunk.length;
    return matches;
  }

  reset() {
    this.matched = 0;
    this.offset = 0;
  }
}

const matcher = new StreamingKMP('aba');
assert.deepEqual(matcher.push('ab'), []);
assert.deepEqual(matcher.push('aba'), [0, 2]);
assert.deepEqual(matcher.push('xaba'), [5]);
matcher.reset();
assert.deepEqual(matcher.push('ababa'), [0, 2]);
assert.throws(() => new StreamingKMP(''), TypeError);
assert.throws(() => matcher.push(42), TypeError);

const overlap = new StreamingKMP('aaa');
assert.deepEqual(overlap.push('aa'), []);
assert.deepEqual(overlap.push('aaa'), [0, 1, 2]);

console.log('Streaming KMP tests passed');
