"use strict";

/*
 * Exercise: compute unrestricted Damerau-Levenshtein edit distance.
 *
 * Unlike the Optimal String Alignment variant, this algorithm permits a
 * character to participate in more than one transposition. It supports
 * insertion, deletion, substitution and adjacent transposition.
 *
 * Strings are compared by Unicode code point (not UTF-16 code unit).
 * Time and space complexity: O(n * m).
 */

function damerauLevenshtein(left, right) {
  if (typeof left !== "string" || typeof right !== "string") {
    throw new TypeError("Both arguments must be strings");
  }

  const a = Array.from(left);
  const b = Array.from(right);
  const n = a.length;
  const m = b.length;
  const infinity = n + m;

  // The extra sentinel row and column simplify unrestricted transpositions.
  const distance = Array.from(
    { length: n + 2 },
    () => new Array(m + 2).fill(0)
  );

  distance[0][0] = infinity;
  for (let i = 0; i <= n; i += 1) {
    distance[i + 1][0] = infinity;
    distance[i + 1][1] = i;
  }
  for (let j = 0; j <= m; j += 1) {
    distance[0][j + 1] = infinity;
    distance[1][j + 1] = j;
  }

  const lastRowForCharacter = new Map();

  for (let i = 1; i <= n; i += 1) {
    let lastMatchingColumn = 0;

    for (let j = 1; j <= m; j += 1) {
      const previousRow = lastRowForCharacter.get(b[j - 1]) ?? 0;
      const previousColumn = lastMatchingColumn;
      let substitutionCost = 1;

      if (a[i - 1] === b[j - 1]) {
        substitutionCost = 0;
        lastMatchingColumn = j;
      }

      const substitution = distance[i][j] + substitutionCost;
      const insertion = distance[i + 1][j] + 1;
      const deletion = distance[i][j + 1] + 1;
      const transposition =
        distance[previousRow][previousColumn] +
        (i - previousRow - 1) +
        1 +
        (j - previousColumn - 1);

      distance[i + 1][j + 1] = Math.min(
        substitution,
        insertion,
        deletion,
        transposition
      );
    }

    lastRowForCharacter.set(a[i - 1], i);
  }

  return distance[n + 1][m + 1];
}

if (require.main === module) {
  const assert = require("node:assert/strict");

  assert.equal(damerauLevenshtein("", ""), 0);
  assert.equal(damerauLevenshtein("kitten", "sitting"), 3);
  assert.equal(damerauLevenshtein("ab", "ba"), 1);
  assert.equal(damerauLevenshtein("CA", "ABC"), 2);
  assert.equal(damerauLevenshtein("a cat", "an act"), 2);
  assert.equal(damerauLevenshtein("café", "cafe"), 1);
  assert.equal(damerauLevenshtein("😀a", "a😀"), 1);
  assert.equal(damerauLevenshtein("same", "same"), 0);

  // This is the unrestricted result; Optimal String Alignment returns 3 here.
  assert.equal(damerauLevenshtein("CA", "ABC"), 2);
  assert.throws(() => damerauLevenshtein(null, "text"), TypeError);

  console.log("Unrestricted Damerau-Levenshtein: all tests passed.");
}

module.exports = { damerauLevenshtein };
