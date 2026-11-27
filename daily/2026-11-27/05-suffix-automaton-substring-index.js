'use strict';

// Exercise: build a suffix automaton for a string. Count distinct substrings
// and find a longest common substring against another string in linear time.

function buildSuffixAutomaton(text) {
  const states = [{ next: new Map(), link: -1, length: 0 }];
  let last = 0;
  for (const char of text) {
    const current = states.length;
    states.push({ next: new Map(), link: 0, length: states[last].length + 1 });
    let p = last;
    while (p !== -1 && !states[p].next.has(char)) {
      states[p].next.set(char, current);
      p = states[p].link;
    }
    if (p === -1) {
      states[current].link = 0;
    } else {
      const q = states[p].next.get(char);
      if (states[p].length + 1 === states[q].length) {
        states[current].link = q;
      } else {
        const clone = states.length;
        states.push({
          next: new Map(states[q].next),
          link: states[q].link,
          length: states[p].length + 1
        });
        while (p !== -1 && states[p].next.get(char) === q) {
          states[p].next.set(char, clone);
          p = states[p].link;
        }
        states[q].link = states[current].link = clone;
      }
    }
    last = current;
  }
  return states;
}

function distinctSubstringCount(text) {
  const states = buildSuffixAutomaton(text);
  return states.slice(1).reduce((sum, state) => sum + state.length - states[state.link].length, 0);
}

function longestCommonSubstring(source, query) {
  const states = buildSuffixAutomaton(source);
  let state = 0;
  let length = 0;
  let bestLength = 0;
  let bestEnd = -1;
  for (let i = 0; i < query.length; i += 1) {
    const char = query[i];
    while (state && !states[state].next.has(char)) {
      state = states[state].link;
      length = states[state].length;
    }
    if (states[state].next.has(char)) {
      state = states[state].next.get(char);
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
  return query.slice(bestEnd - bestLength + 1, bestEnd + 1);
}

const assert = require('node:assert/strict');
assert.equal(distinctSubstringCount('ababa'), 9);
assert.equal(distinctSubstringCount(''), 0);
assert.equal(longestCommonSubstring('xabxac', 'abcabxabcd'), 'abxa');
assert.equal(longestCommonSubstring('hello', 'world'), '');
assert.equal(longestCommonSubstring('banana', 'ananas'), 'anana');
console.log('Suffix automaton tests passed');

module.exports = { buildSuffixAutomaton, distinctSubstringCount, longestCommonSubstring };
