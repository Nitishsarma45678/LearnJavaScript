"use strict";

const assert = require("node:assert/strict");

/**
 * Aho-Corasick multi-pattern matcher.
 * Input and patterns use Unicode code points. Match ranges are half-open
 * code-point offsets [start, end). Duplicate patterns keep distinct indexes.
 */
class AhoCorasick {
  constructor(patterns) {
    if (!Array.isArray(patterns)) throw new TypeError("patterns must be an array");

    this.nodes = [{ next: new Map(), fail: 0, output: [] }];
    this.patterns = patterns.slice();

    for (let patternIndex = 0; patternIndex < patterns.length; patternIndex += 1) {
      const pattern = patterns[patternIndex];
      if (typeof pattern !== "string" || pattern.length === 0) {
        throw new TypeError("each pattern must be a non-empty string");
      }

      let state = 0;
      const symbols = Array.from(pattern);

      for (const symbol of symbols) {
        let child = this.nodes[state].next.get(symbol);
        if (child === undefined) {
          child = this.nodes.length;
          this.nodes[state].next.set(symbol, child);
          this.nodes.push({ next: new Map(), fail: 0, output: [] });
        }
        state = child;
      }

      this.nodes[state].output.push({
        pattern,
        patternIndex,
        length: symbols.length
      });
    }

    const queue = [];
    for (const child of this.nodes[0].next.values()) queue.push(child);

    for (let head = 0; head < queue.length; head += 1) {
      const state = queue[head];

      for (const [symbol, child] of this.nodes[state].next) {
        let fallback = this.nodes[state].fail;
        while (fallback !== 0 && !this.nodes[fallback].next.has(symbol)) {
          fallback = this.nodes[fallback].fail;
        }

        const candidate = this.nodes[fallback].next.get(symbol);
        if (candidate !== undefined && candidate !== child) fallback = candidate;

        this.nodes[child].fail = fallback;
        this.nodes[child].output.push(...this.nodes[fallback].output);
        queue.push(child);
      }
    }
  }

  createScanner() {
    const nodes = this.nodes;
    let state = 0;
    let offset = 0;

    return {
      get offset() {
        return offset;
      },

      push(chunk) {
        if (typeof chunk !== "string") throw new TypeError("chunk must be a string");
        const matches = [];

        for (const symbol of chunk) {
          while (state !== 0 && !nodes[state].next.has(symbol)) {
            state = nodes[state].fail;
          }

          state = nodes[state].next.get(symbol) ?? 0;
          offset += 1;

          for (const output of nodes[state].output) {
            matches.push({
              pattern: output.pattern,
              patternIndex: output.patternIndex,
              start: offset - output.length,
              end: offset
            });
          }
        }

        return matches;
      }
    };
  }

  search(text) {
    return this.createScanner().push(text);
  }
}

// Overlapping matches and duplicate patterns are all retained.
const matcher = new AhoCorasick(["he", "she", "his", "hers", "he"]);
assert.deepEqual(
  matcher.search("ushers").map(({ pattern, patternIndex, start, end }) => [
    pattern, patternIndex, start, end
  ]),
  [
    ["she", 1, 1, 4],
    ["he", 0, 2, 4],
    ["he", 4, 2, 4],
    ["hers", 3, 2, 6]
  ]
);

// A match can begin in one chunk and finish in the next.
const scanner = new AhoCorasick(["🙂a"]).createScanner();
assert.deepEqual(scanner.push("x🙂"), []);
assert.deepEqual(scanner.push("a🙂"), [
  { pattern: "🙂a", patternIndex: 0, start: 1, end: 3 }
]);
assert.deepEqual(scanner.push("a"), [
  { pattern: "🙂a", patternIndex: 0, start: 3, end: 5 }
]);
assert.equal(scanner.offset, 5);

assert.deepEqual(new AhoCorasick([]).search("anything"), []);
assert.throws(() => new AhoCorasick(["ok", ""]), /non-empty string/);

module.exports = { AhoCorasick };
