'use strict';

/**
 * Myers O((N + M)D) shortest-edit-script algorithm for token arrays.
 * Values are compared with Object.is. The returned script is ordered and can
 * be replayed with applyEditScript; equal-cost alternatives are deterministic.
 */
function myersDiff(before, after) {
  if (!Array.isArray(before) || !Array.isArray(after)) {
    throw new TypeError('before and after must be arrays');
  }

  const n = before.length;
  const m = after.length;
  const max = n + m;
  let frontier = new Map([[1, 0]]);
  const trace = [];

  for (let distance = 0; distance <= max; distance += 1) {
    trace.push(new Map(frontier));
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      const down = frontier.get(diagonal + 1);
      const right = frontier.get(diagonal - 1);
      let x;
      if (diagonal === -distance ||
          (diagonal !== distance && (right ?? -Infinity) < (down ?? -Infinity))) {
        x = down ?? 0;
      } else {
        x = (right ?? 0) + 1;
      }
      let y = x - diagonal;
      while (x < n && y < m && Object.is(before[x], after[y])) {
        x += 1;
        y += 1;
      }
      frontier.set(diagonal, x);
      if (x >= n && y >= m) return backtrack(trace, before, after);
    }
  }
  throw new Error('unreachable: edit graph has no terminal path');
}

function backtrack(trace, before, after) {
  let x = before.length;
  let y = after.length;
  const reversed = [];

  for (let distance = trace.length - 1; distance >= 0; distance -= 1) {
    const frontier = trace[distance];
    const diagonal = x - y;
    const down = frontier.get(diagonal + 1);
    const right = frontier.get(diagonal - 1);
    const previousDiagonal = diagonal === -distance ||
      (diagonal !== distance && (right ?? -Infinity) < (down ?? -Infinity))
      ? diagonal + 1
      : diagonal - 1;
    const previousX = frontier.get(previousDiagonal) ?? 0;
    const previousY = previousX - previousDiagonal;

    while (x > previousX && y > previousY) {
      reversed.push({ type: 'equal', value: before[x - 1] });
      x -= 1;
      y -= 1;
    }
    if (distance === 0) break;
    if (x === previousX) {
      reversed.push({ type: 'insert', value: after[y - 1] });
      y -= 1;
    } else {
      reversed.push({ type: 'delete', value: before[x - 1] });
      x -= 1;
    }
  }
  return reversed.reverse();
}

function applyEditScript(before, script) {
  const output = [];
  let cursor = 0;
  for (const operation of script) {
    if (!operation || !['equal', 'insert', 'delete'].includes(operation.type)) {
      throw new TypeError('invalid edit operation');
    }
    if (operation.type === 'insert') {
      output.push(operation.value);
    } else {
      if (cursor >= before.length || !Object.is(before[cursor], operation.value)) {
        throw new Error(`edit script does not match source at index ${cursor}`);
      }
      if (operation.type === 'equal') output.push(before[cursor]);
      cursor += 1;
    }
  }
  if (cursor !== before.length) throw new Error('edit script did not consume the full source');
  return output;
}

// ------------------------------- Tests ----------------------------------
if (require.main === module) {
  const assert = require('node:assert/strict');
  const cases = [
    [[], []],
    [[], ['a', 'b']],
    [['a', 'b'], []],
    [['a', 'b', 'c'], ['a', 'x', 'c', 'd']],
    [['x', 'a', 'x', 'b'], ['x', 'b', 'x', 'a']],
    [['🙂', 'é'], ['é', '🙂', '🚀']]
  ];
  for (const [source, target] of cases) {
    const script = myersDiff(source, target);
    assert.deepEqual(applyEditScript(source, script), target);
    assert.equal(script.filter(op => op.type !== 'equal').length,
      script.filter(op => op.type === 'insert' || op.type === 'delete').length);
  }
  const script = myersDiff(['a', 'b', 'c'], ['a', 'c']);
  assert.deepEqual(script.filter(op => op.type === 'delete').map(op => op.value), ['b']);
  assert.throws(() => applyEditScript(['wrong'], script), /does not match/);
  console.log('Myers diff tests passed');
}

module.exports = { myersDiff, applyEditScript };
