/**
 * Exercise: implement Myers' O((N + M)D) shortest edit script for sequences.
 * The returned operations transform `before` into `after` with the minimum
 * number of insertions and deletions. `equals` may compare structured values.
 *
 * Run: node myers-sequence-diff.js
 */
'use strict';
const assert = require('node:assert/strict');

function diffSequence(before, after, equals = Object.is) {
  if (!Array.isArray(before) || !Array.isArray(after)) throw new TypeError('Expected two arrays');
  if (typeof equals !== 'function') throw new TypeError('equals must be a function');
  const n = before.length, m = after.length, max = n + m, offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  v.fill(-1);
  v[offset + 1] = 0;
  const trace = [];

  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) {
        x = v[offset + k + 1];
      } else {
        x = v[offset + k - 1] + 1;
      }
      let y = x - k;
      while (x < n && y < m && equals(before[x], after[y])) { x++; y++; }
      v[offset + k] = x;
      if (x >= n && y >= m) return backtrack(trace, before, after, offset);
    }
  }
  throw new Error('Unreachable: edit graph has no terminal path');
}

function backtrack(trace, before, after, offset) {
  let x = before.length, y = after.length;
  const reversed = [];
  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d], k = x - y;
    const previousK = (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) ? k + 1 : k - 1;
    const previousX = v[offset + previousK];
    const previousY = previousX - previousK;
    while (x > previousX && y > previousY) {
      reversed.push({ type: 'equal', value: after[y - 1] });
      x--; y--;
    }
    if (d === 0) break;
    if (x === previousX) {
      reversed.push({ type: 'insert', value: after[y - 1] });
      y--;
    } else {
      reversed.push({ type: 'delete', value: before[x - 1] });
      x--;
    }
  }
  return reversed.reverse();
}

function applyEditScript(before, operations, equals = Object.is) {
  let cursor = 0;
  const output = [];
  for (const operation of operations) {
    if (!operation || !['equal', 'insert', 'delete'].includes(operation.type)) {
      throw new TypeError('Invalid edit operation');
    }
    if (operation.type === 'insert') {
      output.push(operation.value);
      continue;
    }
    if (cursor >= before.length || !equals(before[cursor], operation.value)) {
      throw new Error(`Patch does not match source at index ${cursor}`);
    }
    if (operation.type === 'equal') output.push(operation.value);
    cursor++;
  }
  if (cursor !== before.length) throw new Error('Patch did not consume the complete source');
  return output;
}

function editDistance(operations) {
  return operations.reduce((count, op) => count + (op.type === 'equal' ? 0 : 1), 0);
}

function runTests() {
  const cases = [
    [[], [], []],
    [[], ['a', 'b'], ['a', 'b']],
    [['a', 'b'], [], []],
    [['a', 'b', 'c'], ['a', 'x', 'c'], ['a', 'x', 'c']],
    [['a', 'b', 'a'], ['b', 'a', 'b'], ['b', 'a', 'b']],
    [[1, 2, 3, 4], [0, 2, 4, 6], [0, 2, 4, 6]],
  ];
  for (const [before, after, expected] of cases) {
    const script = diffSequence(before, after);
    assert.deepEqual(applyEditScript(before, script), expected);
    assert.equal(editDistance(script), script.filter(op => op.type !== 'equal').length);
  }
  const left = [{ id: 1, label: 'old' }, { id: 2, label: 'same' }];
  const right = [{ id: 1, label: 'new' }, { id: 2, label: 'same' }];
  const byId = (a, b) => a.id === b.id;
  assert.deepEqual(applyEditScript(left, diffSequence(left, right, byId), byId), right);

  // Randomized reconstruction and minimality against an LCS dynamic program.
  let seed = 0x51f15e;
  const random = n => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; };
  for (let trial = 0; trial < 500; trial++) {
    const a = Array.from({ length: random(9) }, () => random(4));
    const b = Array.from({ length: random(9) }, () => random(4));
    const script = diffSequence(a, b);
    assert.deepEqual(applyEditScript(a, script), b);
    const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
    assert.equal(editDistance(script), a.length + b.length - 2 * dp[a.length][b.length]);
  }
  assert.throws(() => applyEditScript([1, 2], [{ type: 'equal', value: 9 }]), /does not match/);
  console.log('Myers sequence diff: all tests passed');
}

if (require.main === module) runTests();
module.exports = { diffSequence, applyEditScript, editDistance };
