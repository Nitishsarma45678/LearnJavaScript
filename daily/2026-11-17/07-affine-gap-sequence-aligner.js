'use strict';

/**
 * EXERCISE: Implement global sequence alignment with affine gap penalties.
 *
 * A gap of length L costs gapOpen + (L - 1) * gapExtend. Use three DP
 * states: M (match/substitution), X (gap in sequence B), and Y (gap in A).
 * Return an optimal pair of aligned strings and its score. Work on Unicode
 * code points rather than UTF-16 code units.
 *
 * Run: node 07-affine-gap-sequence-aligner.js
 */

const NEG = Number.NEGATIVE_INFINITY;

function best(candidates) {
  let winner = 0;
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i] > candidates[winner]) winner = i;
  }
  return { score: candidates[winner], state: winner };
}

function alignGlobal(a, b, options = {}) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    throw new TypeError('Both sequences must be strings');
  }
  const gapOpen = options.gapOpen ?? -3;
  const gapExtend = options.gapExtend ?? -1;
  const match = options.match ?? 2;
  const mismatch = options.mismatch ?? -1;
  const substitution = options.substitution ?? ((x, y) => x === y ? match : mismatch);
  for (const [name, value] of Object.entries({ gapOpen, gapExtend })) {
    if (!Number.isFinite(value) || value > 0) throw new RangeError(`${name} must be finite and non-positive`);
  }
  if (typeof substitution !== 'function') throw new TypeError('substitution must be a function');

  const A = Array.from(a);
  const B = Array.from(b);
  const n = A.length;
  const m = B.length;
  const matrix = () => Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(NEG));
  const trace = () => Array.from({ length: n + 1 }, () => new Int8Array(m + 1).fill(-1));
  const M = matrix(), X = matrix(), Y = matrix();
  const pM = trace(), pX = trace(), pY = trace();
  M[0][0] = 0;

  for (let i = 1; i <= n; i++) {
    X[i][0] = gapOpen + (i - 1) * gapExtend;
    pX[i][0] = i === 1 ? 0 : 1;
  }
  for (let j = 1; j <= m; j++) {
    Y[0][j] = gapOpen + (j - 1) * gapExtend;
    pY[0][j] = j === 1 ? 0 : 2;
  }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const fromM = best([M[i - 1][j - 1], X[i - 1][j - 1], Y[i - 1][j - 1]]);
      const sub = substitution(A[i - 1], B[j - 1]);
      if (!Number.isFinite(sub)) throw new TypeError('substitution scores must be finite');
      M[i][j] = fromM.score + sub;
      pM[i][j] = fromM.state;

      // Prefer extending an existing gap on ties, avoiding needless gap splits.
      const fromX = best([X[i - 1][j] + gapExtend, M[i - 1][j] + gapOpen, Y[i - 1][j] + gapOpen]);
      X[i][j] = fromX.score;
      pX[i][j] = [1, 0, 2][fromX.state];

      const fromY = best([Y[i][j - 1] + gapExtend, M[i][j - 1] + gapOpen, X[i][j - 1] + gapOpen]);
      Y[i][j] = fromY.score;
      pY[i][j] = [2, 0, 1][fromY.state];
    }
  }

  const end = best([M[n][m], X[n][m], Y[n][m]]);
  let state = end.state;
  let i = n, j = m;
  const alignedA = [], alignedB = [];
  while (i > 0 || j > 0) {
    if (state === 0) {
      if (i === 0 || j === 0) throw new Error('Invalid match-state traceback');
      alignedA.push(A[i - 1]);
      alignedB.push(B[j - 1]);
      state = pM[i][j];
      i--; j--;
    } else if (state === 1) {
      if (i === 0) throw new Error('Invalid X-state traceback');
      alignedA.push(A[i - 1]);
      alignedB.push('-');
      state = pX[i][j];
      i--;
    } else {
      if (j === 0) throw new Error('Invalid Y-state traceback');
      alignedA.push('-');
      alignedB.push(B[j - 1]);
      state = pY[i][j];
      j--;
    }
  }
  alignedA.reverse();
  alignedB.reverse();
  return { score: end.score, alignedA: alignedA.join(''), alignedB: alignedB.join('') };
}

function scoreAlignment(alignedA, alignedB, options = {}) {
  if (typeof alignedA !== 'string' || typeof alignedB !== 'string') throw new TypeError('Aligned sequences must be strings');
  const A = Array.from(alignedA), B = Array.from(alignedB);
  if (A.length !== B.length) throw new RangeError('Aligned sequences must have equal lengths');
  const gapOpen = options.gapOpen ?? -3;
  const gapExtend = options.gapExtend ?? -1;
  const match = options.match ?? 2;
  const mismatch = options.mismatch ?? -1;
  const substitution = options.substitution ?? ((x, y) => x === y ? match : mismatch);
  let score = 0;
  let gap = null;
  for (let i = 0; i < A.length; i++) {
    if (A[i] === '-' && B[i] === '-') throw new Error('A column cannot contain two gaps');
    if (A[i] === '-' || B[i] === '-') {
      const direction = A[i] === '-' ? 'A' : 'B';
      score += gap === direction ? gapExtend : gapOpen;
      gap = direction;
    } else {
      score += substitution(A[i], B[i]);
      gap = null;
    }
  }
  return score;
}

// -------------------------------- Tests -----------------------------------
if (require.main === module) {
  const assert = require('node:assert/strict');
  const cases = [
    ['', '', 0], ['AC', '', -4], ['', 'ACG', -5], ['AAAA', 'AAAA', 8],
    ['GATTACA', 'GCATGCU', null], ['ACGT', 'AGT', null], ['kitten', 'sitting', null],
    ['😀A', '😀', null]
  ];
  for (const [a, b, expected] of cases) {
    const result = alignGlobal(a, b);
    assert.equal(Array.from(result.alignedA).length, Array.from(result.alignedB).length);
    assert.equal(result.alignedA.replaceAll('-', ''), a);
    assert.equal(result.alignedB.replaceAll('-', ''), b);
    assert.equal(scoreAlignment(result.alignedA, result.alignedB), result.score);
    if (expected !== null) assert.equal(result.score, expected);
  }
  const custom = alignGlobal('ABC', 'ADC', { substitution: (x, y) => x === y ? 3 : -4, gapOpen: -5, gapExtend: -2 });
  assert.equal(custom.score, 2);
  assert.throws(() => alignGlobal('A', 'B', { gapOpen: 1 }), /non-positive/);
  assert.throws(() => scoreAlignment('A-', 'B-'), /two gaps/);

  // For short inputs, compare the returned score to an independent exhaustive recurrence.
  function brute(a, b, open, extend, matchScore, mismatchScore) {
    const memo = new Map();
    function visit(i, j, lastGap) {
      if (i === a.length && j === b.length) return 0;
      const key = `${i},${j},${lastGap}`;
      if (memo.has(key)) return memo.get(key);
      let bestScore = -Infinity;
      if (i < a.length && j < b.length) bestScore = Math.max(bestScore,
        (a[i] === b[j] ? matchScore : mismatchScore) + visit(i + 1, j + 1, 0));
      if (i < a.length) bestScore = Math.max(bestScore,
        (lastGap === 1 ? extend : open) + visit(i + 1, j, 1));
      if (j < b.length) bestScore = Math.max(bestScore,
        (lastGap === 2 ? extend : open) + visit(i, j + 1, 2));
      memo.set(key, bestScore);
      return bestScore;
    }
    return visit(0, 0, 0);
  }
  const alphabet = ['A', 'B'];
  const strings = [''];
  for (let length = 1; length <= 4; length++) {
    for (let mask = 0; mask < 2 ** length; mask++) strings.push(Array.from({ length }, (_, i) => alphabet[(mask >> i) & 1]).join(''));
  }
  for (const a of strings) for (const b of strings) {
    const actual = alignGlobal(a, b, { gapOpen: -2, gapExtend: -1, match: 2, mismatch: -2 });
    assert.equal(actual.score, brute(a, b, -2, -1, 2, -2), `${a} vs ${b}`);
  }
  console.log('Affine-gap sequence aligner: all tests passed');
}

module.exports = { alignGlobal, scoreAlignment };
