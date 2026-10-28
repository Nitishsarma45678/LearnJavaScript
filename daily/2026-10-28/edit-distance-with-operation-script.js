/**
 * Exercise: compute Levenshtein distance and reconstruct a usable edit script.
 * Operations are expressed left-to-right against a moving cursor, so the
 * script can be applied without recalculating indexes after every edit.
 */
function editDistanceWithScript(source, target) {
  if (typeof source !== "string" || typeof target !== "string") {
    throw new TypeError("source and target must be strings");
  }

  const a = Array.from(source);
  const b = Array.from(target);
  const dp = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j - 1], // replace
          dp[i - 1][j],     // delete
          dp[i][j - 1]      // insert
        );
      }
    }
  }

  const reversed = [];
  let i = a.length;
  let j = b.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      reversed.push({ type: "match", char: a[i - 1] });
      i -= 1;
      j -= 1;
    } else if (
      i > 0 && j > 0 &&
      dp[i][j] === dp[i - 1][j - 1] + 1
    ) {
      reversed.push({ type: "replace", from: a[i - 1], to: b[j - 1] });
      i -= 1;
      j -= 1;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      reversed.push({ type: "delete", char: a[i - 1] });
      i -= 1;
    } else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      reversed.push({ type: "insert", char: b[j - 1] });
      j -= 1;
    } else {
      throw new Error("Unable to reconstruct edit script");
    }
  }

  return { distance: dp[a.length][b.length], operations: reversed.reverse() };
}

function applyEditScript(source, operations) {
  const output = Array.from(source);
  let cursor = 0;

  for (const operation of operations) {
    if (operation.type === "match") {
      if (output[cursor] !== operation.char) throw new Error("Match precondition failed");
      cursor += 1;
    } else if (operation.type === "replace") {
      if (output[cursor] !== operation.from) throw new Error("Replace precondition failed");
      output[cursor] = operation.to;
      cursor += 1;
    } else if (operation.type === "delete") {
      if (output[cursor] !== operation.char) throw new Error("Delete precondition failed");
      output.splice(cursor, 1);
    } else if (operation.type === "insert") {
      output.splice(cursor, 0, operation.char);
      cursor += 1;
    } else {
      throw new TypeError("Unknown operation type");
    }
  }

  return output.join("");
}

if (require.main === module) {
  const assert = require("node:assert/strict");

  const result = editDistanceWithScript("kitten", "sitting");
  assert.equal(result.distance, 3);
  assert.equal(applyEditScript("kitten", result.operations), "sitting");

  const empty = editDistanceWithScript("", "abc");
  assert.equal(empty.distance, 3);
  assert.equal(applyEditScript("", empty.operations), "abc");

  const unicode = editDistanceWithScript("🙂a", "🙂b");
  assert.equal(unicode.distance, 1);
  assert.equal(applyEditScript("🙂a", unicode.operations), "🙂b");

  assert.equal(editDistanceWithScript("same", "same").distance, 0);
  assert.throws(() => editDistanceWithScript(3, "x"), TypeError);
  console.log("Edit-distance tests passed");
}

module.exports = { editDistanceWithScript, applyEditScript };
