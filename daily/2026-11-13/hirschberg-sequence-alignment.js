/**
 * Exercise: Reconstruct an optimal global sequence alignment in linear space.
 *
 * Hirschberg's divide-and-conquer algorithm obtains the same optimum as the
 * quadratic Needleman-Wunsch DP while retaining only two score rows at a time.
 * Inputs are arrays (or strings, interpreted as Unicode code points). Scoring
 * is symmetric: match, mismatch and gap are numeric constants.
 */
'use strict';

const GAP = null;

function scoreRow(a, b, scoring) {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j * scoring.gap);
  for (let i = 1; i <= a.length; i++) {
    const current = new Array(b.length + 1);
    current[0] = i * scoring.gap;
    for (let j = 1; j <= b.length; j++) {
      const diagonal = previous[j - 1] + (Object.is(a[i - 1], b[j - 1]) ? scoring.match : scoring.mismatch);
      current[j] = Math.max(diagonal, previous[j] + scoring.gap, current[j - 1] + scoring.gap);
    }
    previous = current;
  }
  return previous;
}

function smallAlignment(a, b, scoring) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) dp[i][0] = i * scoring.gap;
  for (let j = 1; j <= b.length; j++) dp[0][j] = j * scoring.gap;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    dp[i][j] = Math.max(
      dp[i - 1][j - 1] + (Object.is(a[i - 1], b[j - 1]) ? scoring.match : scoring.mismatch),
      dp[i - 1][j] + scoring.gap,
      dp[i][j - 1] + scoring.gap
    );
  }
  const left = [], right = []; let i = a.length, j = b.length;
  while (i || j) {
    if (i && j && dp[i][j] === dp[i - 1][j - 1] + (Object.is(a[i - 1], b[j - 1]) ? scoring.match : scoring.mismatch)) {
      left.push(a[--i]); right.push(b[--j]);
    } else if (i && dp[i][j] === dp[i - 1][j] + scoring.gap) {
      left.push(a[--i]); right.push(GAP);
    } else { left.push(GAP); right.push(b[--j]); }
  }
  return [left.reverse(), right.reverse()];
}

function hirschberg(inputA, inputB, scoring = {}) {
  const a0 = typeof inputA === 'string' ? Array.from(inputA) : Array.from(inputA);
  const b0 = typeof inputB === 'string' ? Array.from(inputB) : Array.from(inputB);
  if (a0.includes(GAP) || b0.includes(GAP)) throw new TypeError('null is reserved as the gap marker');
  const config = { match: 2, mismatch: -1, gap: -2, ...scoring };
  if (![config.match, config.mismatch, config.gap].every(Number.isFinite)) throw new TypeError('Scores must be finite numbers');
  if (config.gap > 0) throw new RangeError('gap score must not be positive');

  // Keep the row dimension on the shorter input; symmetric scoring permits a swap.
  const swapped = b0.length > a0.length;
  const a = swapped ? b0 : a0, b = swapped ? a0 : b0;
  function solve(x, y) {
    if (!x.length) return [new Array(y.length).fill(GAP), y.slice()];
    if (!y.length) return [x.slice(), new Array(x.length).fill(GAP]];
    if (x.length === 1 || y.length === 1) return smallAlignment(x, y, config);
    const mid = Math.floor(x.length / 2);
    const forward = scoreRow(x.slice(0, mid), y, config);
    const backward = scoreRow(x.slice(mid).reverse(), y.slice().reverse(), config);
    let split = 0, best = -Infinity;
    for (let j = 0; j <= y.length; j++) {
      const candidate = forward[j] + backward[y.length - j];
      if (candidate > best) { best = candidate; split = j; }
    }
    const [x1, y1] = solve(x.slice(0, mid), y.slice(0, split));
    const [x2, y2] = solve(x.slice(mid), y.slice(split));
    return [x1.concat(x2), y1.concat(y2)];
  }
  let [alignedA, alignedB] = solve(a, b);
  if (swapped) [alignedA, alignedB] = [alignedB, alignedA];
  return { alignedA, alignedB, score: alignmentScore(alignedA, alignedB, config), gap: GAP };
}

function alignmentScore(a, b, scoring = {}) {
  const config = { match: 2, mismatch: -1, gap: -2, ...scoring };
  if (a.length !== b.length) throw new RangeError('Aligned sequences must have equal lengths');
  let score = 0;
  for (let i = 0; i < a.length; i++) score += a[i] === GAP || b[i] === GAP ? config.gap : Object.is(a[i], b[i]) ? config.match : config.mismatch;
  return score;
}

// ------------------------------- Tests ------------------------------------
if (require.main === module) {
  const assert = require('node:assert/strict');
  function reference(a, b, s = { match: 2, mismatch: -1, gap: -2 }) { return scoreRow(a, b, s)[b.length] || 0; }
  function strip(gapped) { return gapped.filter(x => x !== GAP); }
  const example = hirschberg('GATTACA', 'GCATGCU');
  assert.deepEqual(strip(example.alignedA), Array.from('GATTACA'));
  assert.deepEqual(strip(example.alignedB), Array.from('GCATGCU'));
  assert.equal(example.alignedA.length, example.alignedB.length);
  assert.equal(example.score, reference(Array.from('GATTACA'), Array.from('GCATGCU')));
  assert.equal(hirschberg('', 'abc').score, -6);
  assert.equal(hirschberg('\u{1F600}a', '\u{1F600}b').score, 1);

  let seed = 1234567;
  const random = n => { seed = (seed * 48271) % 2147483647; return seed % n; };
  for (let trial = 0; trial < 250; trial++) {
    const a = Array.from({ length: random(13) }, () => 'ABC'[random(3)]);
    const b = Array.from({ length: random(13) }, () => 'ABC'[random(3)]);
    const result = hirschberg(a, b);
    assert.deepEqual(strip(result.alignedA), a);
    assert.deepEqual(strip(result.alignedB), b);
    assert.equal(result.alignedA.length, result.alignedB.length);
    assert.equal(result.score, reference(a, b));
  }
  console.log('Hirschberg alignment: all tests passed');
}

module.exports = { hirschberg, alignmentScore, GAP };
