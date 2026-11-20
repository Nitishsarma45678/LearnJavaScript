// Exercise: Search for a pattern across arbitrary text chunks without joining them.
// The matcher retains only the KMP prefix state and reports absolute match offsets.
// Run: node daily/2026-11-20/12-kmp-streaming-matcher.js
"use strict";
const assert = require("node:assert/strict");
function buildPrefixTable(pattern) {
  const prefix = Array(pattern.length).fill(0);
  for (let i = 1, matched = 0; i < pattern.length; i++) {
    while (matched > 0 && pattern[i] !== pattern[matched]) matched = prefix[matched - 1];
    if (pattern[i] === pattern[matched]) matched++;
    prefix[i] = matched;
  }
  return prefix;
}
function createKMPMatcher(pattern) {
  if (typeof pattern !== "string" || pattern.length === 0) throw new TypeError("pattern must be a non-empty string");
  const prefix = buildPrefixTable(pattern);
  let matched = 0;
  let offset = 0;
  return Object.freeze({
    feed(chunk) {
      if (typeof chunk !== "string") throw new TypeError("chunk must be a string");
      const matches = [];
      for (let i = 0; i < chunk.length; i++) {
        const character = chunk[i];
        while (matched > 0 && character !== pattern[matched]) matched = prefix[matched - 1];
        if (character === pattern[matched]) matched++;
        if (matched === pattern.length) {
          matches.push(offset + i - pattern.length + 1);
          matched = prefix[matched - 1]; // Preserve overlapping matches.
        }
      }
      offset += chunk.length;
      return matches;
    },
    get charactersProcessed() { return offset; }
  });
}
const matcher = createKMPMatcher("aba");
assert.deepEqual(matcher.feed("ab"), []);
assert.deepEqual(matcher.feed("aba"), [0, 2]);
assert.equal(matcher.charactersProcessed, 5);
const repeated = createKMPMatcher("aaaa");
assert.deepEqual(repeated.feed("aa"), []);
assert.deepEqual(repeated.feed("aaaaa"), [0, 1, 2]);
const absent = createKMPMatcher("xyz");
assert.deepEqual(absent.feed("xy"), []);
assert.deepEqual(absent.feed("zz"), []);
assert.throws(() => createKMPMatcher(""), /non-empty/);
assert.throws(() => matcher.feed(42), /string/);
console.log("KMP streaming matcher: all tests passed");
