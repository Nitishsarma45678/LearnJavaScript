"use strict";
// Incremental Knuth-Morris-Pratt matcher.
// Positions are zero-based UTF-16 code-unit offsets, matching JavaScript string indexing.
const assert = require("node:assert/strict");

function buildPrefixTable(pattern) {
  const table = new Array(pattern.length).fill(0);
  let matched = 0;
  for (let i = 1; i < pattern.length; i++) {
    while (matched > 0 && pattern[i] !== pattern[matched]) matched = table[matched - 1];
    if (pattern[i] === pattern[matched]) matched++;
    table[i] = matched;
  }
  return table;
}

class StreamingMatcher {
  constructor(pattern) {
    if (typeof pattern !== "string" || pattern.length === 0) {
      throw new TypeError("pattern must be a non-empty string");
    }
    this.pattern = pattern;
    this.prefix = buildPrefixTable(pattern);
    this.matched = 0;
    this.processed = 0;
  }

  push(chunk) {
    if (typeof chunk !== "string") throw new TypeError("chunk must be a string");
    const found = [];
    for (let i = 0; i < chunk.length; i++) {
      const char = chunk[i];
      while (this.matched > 0 && char !== this.pattern[this.matched]) {
        this.matched = this.prefix[this.matched - 1];
      }
      if (char === this.pattern[this.matched]) this.matched++;
      if (this.matched === this.pattern.length) {
        found.push(this.processed + i - this.pattern.length + 1);
        // Retain the longest suffix that is also a prefix to detect overlaps.
        this.matched = this.prefix[this.matched - 1];
      }
    }
    this.processed += chunk.length;
    return found;
  }

  reset() {
    this.matched = 0;
    this.processed = 0;
  }
}

// Example tests
const matcher = new StreamingMatcher("aba");
assert.deepEqual(matcher.push("ab"), []);
assert.deepEqual(matcher.push("aba"), [0, 2]); // both matches cross/occur within chunks
assert.deepEqual(matcher.push(""), []);
matcher.reset();
assert.deepEqual(matcher.push("xxab"), []);
assert.deepEqual(matcher.push("a"), [2]);

const overlapping = new StreamingMatcher("aa");
assert.deepEqual(overlapping.push("a"), []);
assert.deepEqual(overlapping.push("aa"), [0, 1]);
assert.throws(() => new StreamingMatcher(""), /non-empty/);
assert.throws(() => matcher.push(42), /chunk must be a string/);
console.log("Streaming KMP tests passed");
