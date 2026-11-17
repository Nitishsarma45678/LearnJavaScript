/**
 * EXERCISE: Aho-Corasick Multi-Pattern Matcher
 *
 * Build a trie with failure links to find many patterns in one pass over text.
 * The matcher reports overlapping occurrences and preserves UTF-16 offsets,
 * even though matching itself is performed over Unicode code points.
 *
 * Complexity: O(total pattern length + text length + matches), after building.
 */

"use strict";

class AhoCorasick {
  constructor() {
    this.root = this._node();
    this.patternCount = 0;
    this.built = false;
  }

  _node() {
    return { next: new Map(), fail: null, outputs: [] };
  }

  add(pattern, value = pattern) {
    if (this.built) throw new Error("Cannot add patterns after build()");
    if (typeof pattern !== "string" || pattern.length === 0) {
      throw new TypeError("Patterns must be non-empty strings");
    }

    let node = this.root;
    const chars = Array.from(pattern);
    for (const char of chars) {
      if (!node.next.has(char)) node.next.set(char, this._node());
      node = node.next.get(char);
    }

    const id = this.patternCount++;
    node.outputs.push({ id, pattern, value, length: chars.length });
    return id;
  }

  build() {
    if (this.built) return this;
    this.root.fail = this.root;

    const queue = [];
    for (const child of this.root.next.values()) {
      child.fail = this.root;
      queue.push(child);
    }

    for (let head = 0; head < queue.length; head++) {
      const node = queue[head];

      for (const [char, child] of node.next) {
        let fallback = node.fail;
        while (fallback !== this.root && !fallback.next.has(char)) {
          fallback = fallback.fail;
        }

        child.fail = fallback.next.get(char) || this.root;
        if (child.fail !== child) {
          child.outputs = child.outputs.concat(child.fail.outputs);
        }
        queue.push(child);
      }
    }

    this.built = true;
    return this;
  }

  createStream() {
    this.build();
    let state = this.root;
    let codeUnitOffset = 0;
    let codePointOffset = 0;
    const starts = [];

    return {
      push: (chunk) => {
        if (typeof chunk !== "string") throw new TypeError("Chunks must be strings");
        const matches = [];

        for (const char of chunk) {
          starts.push(codeUnitOffset);
          codeUnitOffset += char.length;

          while (state !== this.root && !state.next.has(char)) {
            state = state.fail;
          }
          state = state.next.get(char) || this.root;

          for (const output of state.outputs) {
            const firstPoint = codePointOffset - output.length + 1;
            matches.push({
              id: output.id,
              pattern: output.pattern,
              value: output.value,
              index: starts[firstPoint],
              end: codeUnitOffset
            });
          }
          codePointOffset++;
        }

        return matches;
      },
      reset: () => {
        state = this.root;
        codeUnitOffset = 0;
        codePointOffset = 0;
        starts.length = 0;
      },
      get offset() {
        return codeUnitOffset;
      }
    };
  }

  search(text) {
    const stream = this.createStream();
    return stream.push(text);
  }
}

function runTests() {
  const assert = require("node:assert/strict");
  const matcher = new AhoCorasick();
  matcher.add("he");
  matcher.add("she");
  matcher.add("his");
  matcher.add("hers");
  matcher.add("he", "duplicate payload");

  const matches = matcher.search("ushers");
  const pairs = matches.map((m) => [m.pattern, m.index]);
  assert.deepEqual(pairs, [
    ["she", 1],
    ["he", 2],
    ["he", 2],
    ["hers", 2]
  ]);
  assert.equal(matches.find((m) => m.value === "duplicate payload").index, 2);
  assert.throws(() => matcher.add("new"), /after build/);

  const streaming = new AhoCorasick();
  streaming.add("needle");
  streaming.add("dle");
  const stream = streaming.createStream();
  assert.deepEqual(stream.push("nee"), []);
  assert.deepEqual(stream.push("dle!").map((m) => [m.pattern, m.index]), [
    ["needle", 0],
    ["dle", 3]
  ]);
  assert.equal(stream.offset, 7);

  const unicode = new AhoCorasick();
  unicode.add("😀x");
  unicode.add("x😀");
  assert.deepEqual(
    unicode.search("😀x😀").map((m) => [m.pattern, m.index, m.end]),
    [["😀x", 0, 3], ["x😀", 2, 5]]
  );

  const overlap = new AhoCorasick();
  overlap.add("aba");
  assert.deepEqual(overlap.search("ababa").map((m) => m.index), [0, 2]);

  console.log("Aho-Corasick tests passed");
}

if (require.main === module) runTests();

module.exports = { AhoCorasick };
