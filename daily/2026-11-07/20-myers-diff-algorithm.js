'use strict';

/**
 * Exercise: implement Myers' shortest-edit-script algorithm.
 *
 * Given two sequences, return a minimal insertion/deletion script in
 * O((N + M)D) time, where D is the edit distance. Preserve equal runs,
 * support custom equality, apply scripts safely, and expose a Unicode-aware
 * text helper. Substitution is represented as delete + insert.
 *
 * Run: node 20-myers-diff-algorithm.js
 */

const assert = require('node:assert/strict');

function myersDiff(before, after, equals = Object.is) {
  if (!Array.isArray(before) || !Array.isArray(after)) {
    throw new TypeError('myersDiff expects two arrays');
  }
  if (typeof equals !== 'function') throw new TypeError('equals must be a function');

  const n = before.length;
  const m = after.length;
  const limit = n + m;
  const frontier = new Map([[1, 0]]);
  const trace = [];

  for (let distance = 0; distance <= limit; distance++) {
    trace.push(new Map(frontier));

    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      const down = frontier.get(diagonal + 1) ?? -Infinity;
      const right = frontier.get(diagonal - 1) ?? -Infinity;
      let x;

      if (diagonal === -distance ||
          (diagonal !== distance && right < down)) {
        x = down;
      } else {
        x = right + 1;
      }

      let y = x - diagonal;
      while (x < n && y < m && equals(before[x], after[y])) {
        x++;
        y++;
      }
      frontier.set(diagonal, x);

      if (x >= n && y >= m) {
        return backtrack(trace, before, after, distance);
      }
    }
  }

  throw new Error('edit path not found');
}

function backtrack(trace, before, after, distance) {
  let x = before.length;
  let y = after.length;
  const reversed = [];

  for (let d = distance; d > 0; d--) {
    const frontier = trace[d];
    const diagonal = x - y;
    const down = frontier.get(diagonal + 1) ?? -Infinity;
    const right = frontier.get(diagonal - 1) ?? -Infinity;
    const previousDiagonal =
      diagonal === -d || (diagonal !== d && right < down)
        ? diagonal + 1
        : diagonal - 1;

    const previousX = frontier.get(previousDiagonal) ?? 0;
    const previousY = previousX - previousDiagonal;

    while (x > previousX && y > previousY) {
      reversed.push({ type: 'equal', value: before[x - 1] });
      x--;
      y--;
    }

    if (x === previousX) {
      reversed.push({ type: 'insert', value: after[y - 1] });
      y--;
    } else {
      reversed.push({ type: 'delete', value: before[x - 1] });
      x--;
    }
  }

  while (x > 0 && y > 0) {
    reversed.push({ type: 'equal', value: before[x - 1] });
    x--;
    y--;
  }
  while (x > 0) {
    reversed.push({ type: 'delete', value: before[--x] });
  }
  while (y > 0) {
    reversed.push({ type: 'insert', value: after[--y] });
  }

  return reversed.reverse();
}

function applyDiff(source, operations, equals = Object.is) {
  if (!Array.isArray(source) || !Array.isArray(operations)) {
    throw new TypeError('source and operations must be arrays');
  }

  const output = [];
  let cursor = 0;

  for (const operation of operations) {
    if (!operation || !['equal', 'insert', 'delete'].includes(operation.type)) {
      throw new TypeError('invalid diff operation');
    }

    if (operation.type === 'insert') {
      output.push(operation.value);
      continue;
    }

    if (cursor >= source.length || !equals(source[cursor], operation.value)) {
      throw new Error('diff does not match source at index ' + cursor);
    }

    if (operation.type === 'equal') output.push(source[cursor]);
    cursor++;
  }

  if (cursor !== source.length) throw new Error('diff did not consume the complete source');
  return output;
}

function diffText(before, after) {
  return myersDiff(Array.from(before), Array.from(after));
}

function editCost(operations) {
  return operations.reduce((count, operation) =>
    count + (operation.type === 'equal' ? 0 : 1), 0);
}

function referenceDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1);
    }
  }
  return dp[a.length][b.length];
}

function runTests() {
  const cases = [
    [[], [], []],
    [[], ['a', 'b'], ['a', 'b']],
    [['a', 'b'], [], []],
    [['a', 'b', 'c'], ['a', 'x', 'c'], ['a', 'x', 'c']],
    [['a', 'b', 'c'], ['a', 'b', 'c'], ['a', 'b', 'c']],
    [['x', 'x', 'y'], ['x', 'y', 'x'], ['x', 'y', 'x']]
  ];

  for (const [before, after, expected] of cases) {
    const operations = myersDiff(before, after);
    assert.deepEqual(applyDiff(before, operations), expected);
    assert.equal(editCost(operations), referenceDistance(before, after));
  }

  const textOps = diffText('café🙂', 'cafe🙂!');
  assert.deepEqual(applyDiff(Array.from('café🙂'), textOps), Array.from('cafe🙂!'));

  let seed = 0xdecafbad;
  const random = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 0x100000000);
  for (let trial = 0; trial < 350; trial++) {
    const a = Array.from({ length: Math.floor(random() * 11) }, () => Math.floor(random() * 5));
    const b = Array.from({ length: Math.floor(random() * 11) }, () => Math.floor(random() * 5));
    const operations = myersDiff(a, b);
    assert.deepEqual(applyDiff(a, operations), b);
    assert.equal(editCost(operations), referenceDistance(a, b));
  }

  assert.throws(() => applyDiff(['a'], [{ type: 'equal', value: 'wrong' }]), /does not match/);
  assert.throws(() => myersDiff('abc', 'abd'), /arrays/);
}

runTests();
module.exports = { myersDiff, applyDiff, diffText, editCost };
