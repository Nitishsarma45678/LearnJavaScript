/**
 * Optimal String Alignment (restricted Damerau–Levenshtein) distance.
 *
 * Computes edit distance over Unicode code points and reconstructs a
 * left-to-right edit script. Operations have unit cost: insertion,
 * deletion, substitution or adjacent transposition.
 *
 * O(m*n) time and O(m*n) memory for source length m and target length n.
 * This is the restricted OSA variant: a substring cannot be edited more
 * than once through overlapping transpositions.
 *
 * Run: node damerau-levenshtein-edit-script.js
 */

"use strict";

const assert = require("node:assert/strict");

function optimalStringAlignment(source, target) {
  const a = Array.from(String(source));
  const b = Array.from(String(target));
  const rows = a.length + 1;
  const columns = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array(columns).fill(0));

  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < columns; j++) dp[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < columns; j++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + substitutionCost
      );

      if (
        i > 1 && j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        best = Math.min(best, dp[i - 2][j - 2] + 1);
      }
      dp[i][j] = best;
    }
  }

  let i = a.length;
  let j = b.length;
  const reversed = [];

  while (i > 0 || j > 0) {
    if (
      i > 0 && j > 0 &&
      a[i - 1] === b[j - 1] &&
      dp[i][j] === dp[i - 1][j - 1]
    ) {
      reversed.push({ type: "match", value: a[i - 1] });
      i--;
      j--;
      continue;
    }

    if (
      i > 1 && j > 1 &&
      a[i - 1] === b[j - 2] &&
      a[i - 2] === b[j - 1] &&
      dp[i][j] === dp[i - 2][j - 2] + 1
    ) {
      reversed.push({
        type: "transpose",
        from: [a[i - 2], a[i - 1]],
        to: [a[i - 1], a[i - 2]]
      });
      i -= 2;
      j -= 2;
      continue;
    }

    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      reversed.push({ type: "replace", from: a[i - 1], to: b[j - 1] });
      i--;
      j--;
      continue;
    }

    if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      reversed.push({ type: "delete", value: a[i - 1] });
      i--;
      continue;
    }

    if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      reversed.push({ type: "insert", value: b[j - 1] });
      j--;
      continue;
    }

    throw new Error("Unable to reconstruct an optimal edit path");
  }

  reversed.reverse();
  let cursor = 0;
  const script = reversed.map(operation => {
    if (operation.type === "match") {
      return { ...operation, index: cursor++ };
    }
    if (operation.type === "replace") {
      return { ...operation, index: cursor++ };
    }
    if (operation.type === "delete") {
      return { ...operation, index: cursor };
    }
    if (operation.type === "insert") {
      return { ...operation, index: cursor++ };
    }
    const annotated = { ...operation, index: cursor };
    cursor += 2;
    return annotated;
  });

  return { distance: dp[a.length][b.length], script };
}

function applyEditScript(source, script) {
  const symbols = Array.from(String(source));
  let cursor = 0;

  for (const operation of script) {
    if (operation.index !== cursor) {
      throw new Error("Edit script index mismatch at " + operation.type);
    }
    switch (operation.type) {
      case "match":
        if (symbols[cursor] !== operation.value) throw new Error("Match precondition failed");
        cursor++;
        break;
      case "replace":
        if (symbols[cursor] !== operation.from) throw new Error("Replace precondition failed");
        symbols[cursor] = operation.to;
        cursor++;
        break;
      case "delete":
        if (symbols[cursor] !== operation.value) throw new Error("Delete precondition failed");
        symbols.splice(cursor, 1);
        break;
      case "insert":
        symbols.splice(cursor, 0, operation.value);
        cursor++;
        break;
      case "transpose":
        if (
          symbols[cursor] !== operation.from[0] ||
          symbols[cursor + 1] !== operation.from[1]
        ) throw new Error("Transpose precondition failed");
        symbols.splice(cursor, 2, ...operation.to);
        cursor += 2;
        break;
      default:
        throw new TypeError("Unknown edit operation: " + operation.type);
    }
  }
  return symbols.join("");
}

function runTests() {
  const examples = [
    ["kitten", "sitting", 3],
    ["form", "from", 1],
    ["ab", "ba", 1],
    ["", "hello", 5],
    ["same", "same", 0],
    ["ca", "abc", 3],
    ["😀a", "a😀", 1],
    ["café", "cafe", 1]
  ];

  for (const [source, target, expected] of examples) {
    const result = optimalStringAlignment(source, target);
    assert.equal(result.distance, expected, source + " -> " + target);
    assert.equal(applyEditScript(source, result.script), target);
    assert.equal(result.script.filter(op => op.type !== "match").length, expected);
  }

  let seed = 0x0da7;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const alphabet = ["a", "b", "c", "😀"];
  for (let trial = 0; trial < 350; trial++) {
    const make = () => Array.from({ length: Math.floor(random() * 8) },
      () => alphabet[Math.floor(random() * alphabet.length)]).join("");
    const source = make();
    const target = make();
    const result = optimalStringAlignment(source, target);
    assert.equal(applyEditScript(source, result.script), target);
    assert.equal(result.script.filter(op => op.type !== "match").length, result.distance);
    assert.equal(result.distance, optimalStringAlignment(target, source).distance);
  }

  console.log("OptimalStringAlignment: all tests passed");
}

module.exports = { optimalStringAlignment, applyEditScript };

if (require.main === module) runTests();
