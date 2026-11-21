// Exercise: Find the shortest substring of source that contains target as a subsequence.
// Unlike a minimum-window substring, target characters need not be adjacent.
// Return the substring and its half-open source range, or null when no window exists.

function minimumWindowSubsequence(source, target) {
  const text = Array.from(source);
  const pattern = Array.from(target);
  if (pattern.length === 0) return { substring: "", start: 0, end: 0 };
  if (text.length === 0 || pattern.length > text.length) return null;

  // starts[j] is the start index of a subsequence matching pattern[0..j]
  // that ends at or before the current source position.
  const starts = Array(pattern.length).fill(-1);
  let best = null;

  for (let i = 0; i < text.length; i++) {
    for (let j = pattern.length - 1; j >= 1; j--) {
      if (text[i] === pattern[j] && starts[j - 1] !== -1) {
        starts[j] = starts[j - 1];
      }
    }
    if (text[i] === pattern[0]) starts[0] = i;

    if (text[i] === pattern[pattern.length - 1] && starts[pattern.length - 1] !== -1) {
      const start = pattern.length === 1 ? i : starts[pattern.length - 1];
      const length = i - start + 1;
      if (!best || length < best.end - best.start ||
          (length === best.end - best.start && start < best.start)) {
        best = { start, end: i + 1 };
      }
    }
  }

  return best ? {
    ...best,
    substring: text.slice(best.start, best.end).join("")
  } : null;
}

// Tests
const assert = require("node:assert/strict");
assert.deepEqual(minimumWindowSubsequence("abcdebdde", "bde"), {
  start: 1, end: 5, substring: "bcde"
});
assert.deepEqual(minimumWindowSubsequence("fgrqsqsnodwmxzkzxwqegkndaa", "kzed"), {
  start: 13, end: 22, substring: "zkzxwqegd"
});
assert.deepEqual(minimumWindowSubsequence("aaaa", "aa"), {
  start: 0, end: 2, substring: "aa"
});
assert.equal(minimumWindowSubsequence("abc", "z"), null);
assert.deepEqual(minimumWindowSubsequence("anything", ""), {
  start: 0, end: 0, substring: ""
});
console.log("minimum window subsequence tests passed");
