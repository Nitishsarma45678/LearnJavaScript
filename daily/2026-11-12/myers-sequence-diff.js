/**
 * Myers shortest edit script for arrays and Unicode-aware text.
 *
 * The algorithm explores edit-graph diagonals in increasing edit distance,
 * using a furthest-reaching x-coordinate for each diagonal. Backtracking
 * reconstructs an insertion/deletion script with equal runs preserved.
 *
 * Time: O((N + M)D), where D is the shortest insert/delete edit distance.
 * Space: O(D squared) for the saved diagonal frontiers in this teaching
 * implementation.
 *
 * Run: node myers-sequence-diff.js
 */

function myersDiff(source, target, equal = Object.is) {
  if (!Array.isArray(source) || !Array.isArray(target)) {
    throw new TypeError("source and target must be arrays");
  }
  if (typeof equal !== "function") throw new TypeError("equal must be a function");

  const n = source.length;
  const m = target.length;
  const maxDistance = n + m;
  let frontier = new Map([[1, 0]]);
  const trace = [];
  let finalDistance = -1;

  for (let distance = 0; distance <= maxDistance; distance += 1) {
    trace.push(new Map(frontier));

    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      let x;
      if (diagonal === -distance ||
          (diagonal !== distance &&
           (frontier.get(diagonal - 1) ?? -Infinity) <
           (frontier.get(diagonal + 1) ?? -Infinity))) {
        x = frontier.get(diagonal + 1) ?? 0;
      } else {
        x = (frontier.get(diagonal - 1) ?? 0) + 1;
      }

      let y = x - diagonal;
      while (x < n && y < m && equal(source[x], target[y])) {
        x += 1;
        y += 1;
      }
      frontier.set(diagonal, x);

      if (x >= n && y >= m) {
        finalDistance = distance;
        break;
      }
    }

    if (finalDistance !== -1) break;
  }

  if (finalDistance === -1) throw new Error("failed to reach the edit-graph endpoint");

  const reversed = [];
  let x = n;
  let y = m;

  for (let distance = finalDistance; distance > 0; distance -= 1) {
    const previous = trace[distance];
    const diagonal = x - y;
    let previousDiagonal;

    if (diagonal === -distance ||
        (diagonal !== distance &&
         (previous.get(diagonal - 1) ?? -Infinity) <
         (previous.get(diagonal + 1) ?? -Infinity))) {
      previousDiagonal = diagonal + 1;
    } else {
      previousDiagonal = diagonal - 1;
    }

    const previousX = previous.get(previousDiagonal) ?? 0;
    const previousY = previousX - previousDiagonal;

    while (x > previousX && y > previousY) {
      reversed.push({ type: "equal", value: source[x - 1] });
      x -= 1;
      y -= 1;
    }

    if (x === previousX) {
      reversed.push({ type: "insert", value: target[y - 1] });
      y -= 1;
    } else {
      reversed.push({ type: "delete", value: source[x - 1] });
      x -= 1;
    }
  }

  while (x > 0 && y > 0) {
    reversed.push({ type: "equal", value: source[x - 1] });
    x -= 1;
    y -= 1;
  }
  while (x > 0) {
    reversed.push({ type: "delete", value: source[x - 1] });
    x -= 1;
  }
  while (y > 0) {
    reversed.push({ type: "insert", value: target[y - 1] });
    y -= 1;
  }

  return reversed.reverse();
}

function applyEditScript(source, operations, equal = Object.is) {
  if (!Array.isArray(source) || !Array.isArray(operations)) {
    throw new TypeError("source and operations must be arrays");
  }
  const output = [];
  let cursor = 0;

  for (const operation of operations) {
    if (!operation || !["equal", "insert", "delete"].includes(operation.type)) {
      throw new TypeError("unknown edit operation");
    }
    if (operation.type === "insert") {
      output.push(operation.value);
      continue;
    }

    if (cursor >= source.length || !equal(source[cursor], operation.value)) {
      throw new Error("edit script does not match the source sequence");
    }
    if (operation.type === "equal") output.push(source[cursor]);
    cursor += 1;
  }

  if (cursor !== source.length) throw new Error("edit script left source items unconsumed");
  return output;
}

function diffText(before, after) {
  if (typeof before !== "string" || typeof after !== "string") {
    throw new TypeError("diffText expects strings");
  }
  return myersDiff(Array.from(before), Array.from(after));
}

function runTests() {
  const assert = require("node:assert/strict");

  const operations = myersDiff(
    ["A", "B", "C", "D"],
    ["A", "X", "C", "E"]
  );
  assert.deepEqual(applyEditScript(["A", "B", "C", "D"], operations),
    ["A", "X", "C", "E"]);
  assert.equal(operations.filter((item) => item.type !== "equal").length, 4);

  assert.deepEqual(myersDiff([], [1, 2]).map((item) => item.type),
    ["insert", "insert"]);
  assert.deepEqual(myersDiff([1, 2], []).map((item) => item.type),
    ["delete", "delete"]);
  assert.deepEqual(diffText("café🙂", "cafe🙂!").map((item) => item.type),
    ["equal", "delete", "insert", "equal", "insert"]);

  let seed = 0x71c3;
  const random = (limit) => {
    seed = (seed * 48271) % 0x7fffffff;
    return seed % limit;
  };
  const alphabet = ["a", "b", "c"];
  for (let trial = 0; trial < 240; trial += 1) {
    const a = Array.from({ length: random(9) }, () => alphabet[random(3)]);
    const b = Array.from({ length: random(9) }, () => alphabet[random(3)]);
    const script = myersDiff(a, b);
    assert.deepEqual(applyEditScript(a, script), b);

    const dp = Array.from({ length: a.length + 1 }, () =>
      new Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
    for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
    for (let i = 1; i <= a.length; i += 1) {
      for (let j = 1; j <= b.length; j += 1) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : Math.min(dp[i - 1][j], dp[i][j - 1]) + 1;
      }
    }
    assert.equal(script.filter((item) => item.type !== "equal").length,
      dp[a.length][b.length]);
  }

  assert.throws(() => applyEditScript([1], [{ type: "equal", value: 2 }]), /does not match/);
  console.log("Myers sequence diff tests passed");
}

module.exports = { myersDiff, applyEditScript, diffText };

if (require.main === module) runTests();
