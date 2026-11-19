'use strict';

/**
 * Exercise: Compute Levenshtein distance and reconstruct an executable edit
 * script containing keep, insert, delete, and replace operations.
 *
 * Array.from() makes the algorithm operate on Unicode code points rather than
 * UTF-16 code units. The dynamic-programming table uses O(m*n) time and space.
 */

function editDistance(source, target) {
  if (typeof source !== 'string' || typeof target !== 'string') {
    throw new TypeError('source and target must be strings');
  }
  const left = Array.from(source);
  const right = Array.from(target);
  const rows = left.length + 1;
  const columns = right.length + 1;
  const dp = Array.from({ length: rows }, () => new Array(columns).fill(0));

  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < columns; j += 1) dp[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < columns; j += 1) {
      if (left[i - 1] === right[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],     // delete
          dp[i][j - 1],     // insert
          dp[i - 1][j - 1]  // replace
        );
      }
    }
  }

  const operations = [];
  let i = left.length;
  let j = right.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && left[i - 1] === right[j - 1] &&
        dp[i][j] === dp[i - 1][j - 1]) {
      operations.push({ type: 'keep', value: left[i - 1] });
      i -= 1;
      j -= 1;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      operations.push({ type: 'replace', from: left[i - 1], to: right[j - 1] });
      i -= 1;
      j -= 1;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      operations.push({ type: 'delete', value: left[i - 1] });
      i -= 1;
    } else {
      operations.push({ type: 'insert', value: right[j - 1] });
      j -= 1;
    }
  }

  operations.reverse();
  return { distance: dp[left.length][right.length], operations };
}

function applyEditScript(source, operations) {
  const input = Array.from(source);
  const output = [];
  let cursor = 0;

  for (const operation of operations) {
    if (operation.type === 'keep') {
      if (input[cursor] !== operation.value) throw new Error('keep operation does not match source');
      output.push(input[cursor]);
      cursor += 1;
    } else if (operation.type === 'delete') {
      if (input[cursor] !== operation.value) throw new Error('delete operation does not match source');
      cursor += 1;
    } else if (operation.type === 'replace') {
      if (input[cursor] !== operation.from) throw new Error('replace operation does not match source');
      output.push(operation.to);
      cursor += 1;
    } else if (operation.type === 'insert') {
      output.push(operation.value);
    } else {
      throw new TypeError('unknown edit operation: ' + operation.type);
    }
  }

  if (cursor !== input.length) throw new Error('edit script did not consume the full source');
  return output.join('');
}

function runTests() {
  const assert = require('node:assert/strict');
  const result = editDistance('kitten', 'sitting');
  assert.equal(result.distance, 3);
  assert.equal(applyEditScript('kitten', result.operations), 'sitting');

  const unicode = editDistance('🐱a', '🐶a');
  assert.equal(unicode.distance, 1);
  assert.equal(applyEditScript('🐱a', unicode.operations), '🐶a');

  assert.equal(editDistance('', 'abc').distance, 3);
  assert.equal(editDistance('same', 'same').distance, 0);
  assert.equal(applyEditScript('', editDistance('', 'ready').operations), 'ready');
  assert.throws(() => editDistance(42, 'text'), /strings/);
  assert.throws(() => applyEditScript('x', [{ type: 'keep', value: 'y' }]), /keep/);
}

if (require.main === module) {
  runTests();
  console.log('Levenshtein edit script: all tests passed');
}

module.exports = { editDistance, applyEditScript };
