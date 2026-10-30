'use strict';

/**
 * Compile a small path-aware glob language into a matcher.
 *   *  matches zero or more code points other than '/'
 *   ** matches zero or more code points, including '/'
 *   ?  matches exactly one code point other than '/'
 *   \  escapes the next pattern character (a trailing \ is literal)
 * Matching uses dynamic programming in O(patternLength * inputLength) time
 * and O(inputLength) auxiliary memory; no regular-expression construction.
 */
function tokenize(pattern) {
  const chars = Array.from(pattern);
  const tokens = [];
  for (let i = 0; i < chars.length; i += 1) {
    const char = chars[i];
    if (char === '\\') {
      if (i + 1 < chars.length) tokens.push({ type: 'literal', value: chars[++i] });
      else tokens.push({ type: 'literal', value: '\\' });
    } else if (char === '*') {
      if (chars[i + 1] === '*') {
        tokens.push({ type: 'globstar' });
        i += 1;
      } else {
        tokens.push({ type: 'star' });
      }
    } else if (char === '?') {
      tokens.push({ type: 'one' });
    } else {
      tokens.push({ type: 'literal', value: char });
    }
  }
  return tokens;
}

function compileGlob(pattern) {
  if (typeof pattern !== 'string') throw new TypeError('pattern must be a string');
  const tokens = tokenize(pattern);

  return function matches(candidate) {
    if (typeof candidate !== 'string') throw new TypeError('candidate must be a string');
    const input = Array.from(candidate);
    const width = input.length;
    let previous = new Uint8Array(width + 1);
    previous[0] = 1;

    for (const token of tokens) {
      const current = new Uint8Array(width + 1);
      if (token.type === 'star' || token.type === 'globstar') {
        current[0] = previous[0];
        for (let j = 1; j <= width; j += 1) {
          const canConsume = token.type === 'globstar' || input[j - 1] !== '/';
          current[j] = previous[j] || (canConsume && current[j - 1]) ? 1 : 0;
        }
      } else {
        for (let j = 1; j <= width; j += 1) {
          const char = input[j - 1];
          const matchesChar = token.type === 'one'
            ? char !== '/'
            : char === token.value;
          current[j] = previous[j - 1] && matchesChar ? 1 : 0;
        }
      }
      previous = current;
    }
    return previous[width] === 1;
  };
}

function matchGlob(pattern, candidate) {
  return compileGlob(pattern)(candidate);
}

// Examples and edge-case assertions.
const assert = require('node:assert/strict');
assert.equal(matchGlob('src/*.js', 'src/app.js'), true);
assert.equal(matchGlob('src/*.js', 'src/lib/app.js'), false);
assert.equal(matchGlob('src/**/app.js', 'src/lib/deep/app.js'), true);
assert.equal(matchGlob('**.js', 'src/lib/app.js'), true);
assert.equal(matchGlob('file?.txt', 'file1.txt'), true);
assert.equal(matchGlob('file?.txt', 'file12.txt'), false);
assert.equal(matchGlob('file?.txt', 'file😀.txt'), true);
assert.equal(matchGlob('a\\*b', 'a*b'), true);
assert.equal(matchGlob('a\\*b', 'axxb'), false);
assert.equal(matchGlob('literal\\\\', 'literal\\'), true);
assert.equal(matchGlob('**', 'nested/path/😀.js'), true);
assert.equal(matchGlob('*', 'nested/path'), false);
assert.equal(matchGlob('', ''), true);
assert.equal(matchGlob('', 'x'), false);
assert.throws(() => compileGlob(42), TypeError);
assert.throws(() => matchGlob('*', null), TypeError);
console.log('glob-matcher: all tests passed');
