const assert = require('node:assert/strict');

function minimumWordBreak(text, dictionary) {
  const words = new Set(dictionary.filter(word => typeof word === 'string' && word.length > 0));
  const best = Array(text.length + 1).fill(null);
  best[0] = [];

  for (let end = 1; end <= text.length; end++) {
    for (let start = 0; start < end; start++) {
      if (best[start] === null) continue;
      const word = text.slice(start, end);
      if (!words.has(word)) continue;

      const candidate = [...best[start], word];
      const current = best[end];
      if (
        current === null ||
        candidate.length < current.length ||
        (candidate.length === current.length && candidate.join(' ') < current.join(' '))
      ) {
        best[end] = candidate;
      }
    }
  }

  return best[text.length] === null ? null : best[text.length];
}

const dictionary = ['cat', 'cats', 'and', 'sand', 'dog'];
assert.deepEqual(minimumWordBreak('catsanddog', dictionary), ['cat', 'sand', 'dog']);
assert.deepEqual(minimumWordBreak('aaaa', ['a', 'aa', 'aaa']), ['a', 'aaa']);
assert.deepEqual(minimumWordBreak('pineapple', ['pine', 'apple', 'pineapple']), ['pineapple']);
assert.equal(minimumWordBreak('catsandog', dictionary), null);
assert.deepEqual(minimumWordBreak('', dictionary), []);
assert.deepEqual(minimumWordBreak('redblue', ['red', 'blue']), ['red', 'blue']);
console.log('Minimum word-break tests passed');