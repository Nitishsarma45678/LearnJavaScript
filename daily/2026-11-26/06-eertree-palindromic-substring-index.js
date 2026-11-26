'use strict';

// Exercise: maintain an Eertree (palindromic tree) to index every distinct
// palindromic substring and count its occurrences in linear time.

const assert = require('node:assert/strict');

function buildEertree(text) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  const chars = Array.from(text);
  const nodes = [
    { length: -1, link: 0, next: new Map(), occurrences: 0, firstEnd: -1, suffixCount: 0 },
    { length: 0, link: 0, next: new Map(), occurrences: 0, firstEnd: -1, suffixCount: 0 }
  ];
  let last = 1;

  for (let i = 0; i < chars.length; i += 1) {
    const char = chars[i];
    let current = last;
    while (i - 1 - nodes[current].length < 0 ||
      chars[i - 1 - nodes[current].length] !== char) {
      current = nodes[current].link;
    }

    if (nodes[current].next.has(char)) {
      last = nodes[current].next.get(char);
      nodes[last].occurrences += 1;
      continue;
    }

    const created = {
      length: nodes[current].length + 2,
      link: 1,
      next: new Map(),
      occurrences: 1,
      firstEnd: i,
      suffixCount: 0
    };
    const id = nodes.length;
    nodes.push(created);
    nodes[current].next.set(char, id);

    if (created.length > 1) {
      let candidate = nodes[current].link;
      while (i - 1 - nodes[candidate].length < 0 ||
        chars[i - 1 - nodes[candidate].length] !== char) {
        candidate = nodes[candidate].link;
      }
      created.link = nodes[candidate].next.get(char);
    }
    created.suffixCount = 1 + nodes[created.link].suffixCount;
    last = id;
  }

  const order = nodes.map((node, id) => id)
    .filter((id) => id > 1)
    .sort((a, b) => nodes[b].length - nodes[a].length);
  for (const id of order) nodes[nodes[id].link].occurrences += nodes[id].occurrences;

  const palindromes = order.map((id) => {
    const node = nodes[id];
    const start = node.firstEnd - node.length + 1;
    return {
      value: chars.slice(start, node.firstEnd + 1).join(''),
      length: node.length,
      occurrences: node.occurrences
    };
  }).sort((a, b) => a.length - b.length || a.value.localeCompare(b.value));

  return {
    distinctCount: nodes.length - 2,
    totalOccurrences: palindromes.reduce((sum, item) => sum + item.occurrences, 0),
    longestSuffixCount: chars.length ? nodes[last].suffixCount : 0,
    palindromes
  };
}

const result = buildEertree('ababa');
assert.equal(result.distinctCount, 5);
assert.equal(result.palindromes.find((x) => x.value === 'a').occurrences, 3);
assert.equal(result.palindromes.find((x) => x.value === 'aba').occurrences, 2);
assert.equal(result.palindromes.find((x) => x.value === 'ababa').occurrences, 1);
assert.equal(buildEertree('').distinctCount, 0);
assert.equal(buildEertree('aaaa').distinctCount, 4);
assert.throws(() => buildEertree(42), TypeError);

module.exports = { buildEertree };
