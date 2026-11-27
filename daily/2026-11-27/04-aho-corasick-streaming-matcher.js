'use strict';

// Exercise: build a multi-pattern matcher with failure links and preserve
// automaton state across arbitrary text chunks.

function createMatcher(patterns) {
  if (!patterns.length || patterns.some(pattern => pattern.length === 0)) {
    throw new TypeError('Provide non-empty patterns');
  }
  const nodes = [{ next: new Map(), fail: 0, outputs: [] }];
  patterns.forEach((pattern, id) => {
    let state = 0;
    for (const char of pattern) {
      if (!nodes[state].next.has(char)) {
        nodes[state].next.set(char, nodes.length);
        nodes.push({ next: new Map(), fail: 0, outputs: [] });
      }
      state = nodes[state].next.get(char);
    }
    nodes[state].outputs.push({ id, pattern });
  });

  const queue = [];
  for (const child of nodes[0].next.values()) queue.push(child);
  for (let head = 0; head < queue.length; head += 1) {
    const state = queue[head];
    for (const [char, child] of nodes[state].next) {
      queue.push(child);
      let fallback = nodes[state].fail;
      while (fallback && !nodes[fallback].next.has(char)) fallback = nodes[fallback].fail;
      nodes[child].fail = nodes[fallback].next.get(char) ?? 0;
      nodes[child].outputs.push(...nodes[nodes[child].fail].outputs);
    }
  }

  let state = 0;
  let offset = 0;
  return {
    feed(chunk) {
      const matches = [];
      for (const char of chunk) {
        while (state && !nodes[state].next.has(char)) state = nodes[state].fail;
        state = nodes[state].next.get(char) ?? 0;
        for (const output of nodes[state].outputs) {
          matches.push({ ...output, start: offset - output.pattern.length + 1, end: offset + 1 });
        }
        offset += 1;
      }
      return matches;
    },
    reset() { state = 0; offset = 0; }
  };
}

const assert = require('node:assert/strict');
const matcher = createMatcher(['he', 'she', 'his', 'hers']);
assert.deepEqual(matcher.feed('us'), []);
assert.deepEqual(matcher.feed('hers'), [
  { id: 0, pattern: 'he', start: 2, end: 4 },
  { id: 3, pattern: 'hers', start: 2, end: 6 }
]);
const split = createMatcher(['aba', 'ba']);
assert.deepEqual(split.feed('ab'), []);
assert.deepEqual(split.feed('aba'), [
  { id: 0, pattern: 'aba', start: 0, end: 3 },
  { id: 1, pattern: 'ba', start: 1, end: 3 },
  { id: 0, pattern: 'aba', start: 2, end: 5 },
  { id: 1, pattern: 'ba', start: 3, end: 5 }
]);
split.reset();
assert.deepEqual(split.feed('aba'), [
  { id: 0, pattern: 'aba', start: 0, end: 3 },
  { id: 1, pattern: 'ba', start: 1, end: 3 }
]);
assert.throws(() => createMatcher(['ok', '']), TypeError);
console.log('Aho-Corasick streaming tests passed');

module.exports = { createMatcher };
