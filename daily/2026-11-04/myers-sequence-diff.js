'use strict';

/**
 * Exercise: compute a shortest edit script for two sequences with Myers' O((N+M)D)
 * algorithm. The script contains equal/insert/delete operations and can be replayed.
 */

function diffSequence(before, after, equals = Object.is) {
  if (!Array.isArray(before) || !Array.isArray(after)) throw new TypeError('Both inputs must be arrays');
  if (typeof equals !== 'function') throw new TypeError('equals must be a function');
  const n = before.length;
  const m = after.length;
  const max = n + m;
  let frontier = new Map([[1, 0]]);
  const trace = [];

  for (let d = 0; d <= max; d++) {
    trace.push(new Map(frontier));
    for (let k = -d; k <= d; k += 2) {
      const down = frontier.get(k + 1) ?? -Infinity;
      const right = frontier.get(k - 1) ?? -Infinity;
      let x = (k === -d || (k !== d && right < down)) ? down : right + 1;
      if (!Number.isFinite(x)) x = 0;
      let y = x - k;
      while (x < n && y < m && equals(before[x], after[y])) { x++; y++; }
      frontier.set(k, x);
      if (x >= n && y >= m) return backtrack(trace, before, after, d, equals);
    }
  }
  throw new Error('Diff search exhausted unexpectedly');
}

function backtrack(trace, before, after, distance, equals) {
  let x = before.length;
  let y = after.length;
  const reversed = [];

  for (let d = distance; d >= 0; d--) {
    const frontier = trace[d];
    const k = x - y;
    const down = frontier.get(k + 1) ?? -Infinity;
    const right = frontier.get(k - 1) ?? -Infinity;
    const previousK = (k === -d || (k !== d && right < down)) ? k + 1 : k - 1;
    const previousX = frontier.get(previousK) ?? 0;
    const previousY = previousX - previousK;

    while (x > previousX && y > previousY) {
      if (!equals(before[x - 1], after[y - 1])) throw new Error('Invalid diagonal in diff trace');
      reversed.push({ type: 'equal', value: before[x - 1] });
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
  if (x !== 0 || y !== 0) throw new Error('Diff backtracking did not reach the origin');
  return reversed.reverse();
}

function applyEditScript(before, script) {
  if (!Array.isArray(before) || !Array.isArray(script)) throw new TypeError('Expected arrays');
  let cursor = 0;
  const result = [];
  for (const edit of script) {
    if (!edit || !['equal', 'insert', 'delete'].includes(edit.type)) throw new TypeError('Invalid edit operation');
    if (edit.type === 'insert') {
      result.push(edit.value);
      continue;
    }
    if (cursor >= before.length) throw new RangeError('Edit script consumes beyond the source sequence');
    if (!Object.is(before[cursor], edit.value) && edit.type === 'equal') {
      throw new Error('Equal operation does not match source at current cursor');
    }
    if (edit.type === 'equal') result.push(before[cursor]);
    cursor++;
  }
  if (cursor !== before.length) throw new Error('Edit script did not consume the complete source sequence');
  return result;
}

function editDistance(script) {
  return script.reduce((count, edit) => count + (edit.type === 'equal' ? 0 : 1), 0);
}

module.exports = { diffSequence, applyEditScript, editDistance };

if (require.main === module) {
  const assert = require('node:assert/strict');
  const before = ['A', 'B', 'C', 'D'];
  const after = ['A', 'X', 'C', 'D', 'E'];
  const script = diffSequence(before, after);
  assert.deepEqual(applyEditScript(before, script), after);
  assert.equal(editDistance(script), 3); // B -> X costs delete + insert; E is inserted
  assert.deepEqual(applyEditScript([], diffSequence([], ['x', 'y'])), ['x', 'y']);
  assert.deepEqual(applyEditScript(['x', 'y'], diffSequence(['x', 'y'], [])), []);
  assert.deepEqual(applyEditScript(['a', 'a', 'b'], diffSequence(['a', 'a', 'b'], ['a', 'b', 'a'])), ['a', 'b', 'a']);
  const objectsA = [{ id: 1 }, { id: 2 }];
  const objectsB = [{ id: 1 }, { id: 3 }];
  const byId = (a, b) => a.id === b.id;
  const objectScript = diffSequence(objectsA, objectsB, byId);
  assert.deepEqual(applyEditScript(objectsA, objectScript).map(x => x.id), [1, 3]);
  assert.throws(() => applyEditScript([1], [{ type: 'delete', value: 1 }, { type: 'equal', value: 1 }]), RangeError);
  console.log('Myers sequence diff: all tests passed');
}
