// Exercise: Find a shortest transformation sequence between two words.
// Each step changes exactly one character, and every intermediate word must be in the dictionary.
// Use bidirectional BFS to reduce the explored search frontier.

function shortestWordLadder(begin, end, words, alphabet = "abcdefghijklmnopqrstuvwxyz") {
  if (typeof begin !== "string" || typeof end !== "string" || begin.length !== end.length) {
    throw new TypeError("begin and end must be strings of equal length");
  }
  if (begin === end) return [begin];

  const dictionary = new Set(words.filter(word =>
    typeof word === "string" && word.length === begin.length
  ));
  if (!dictionary.has(end)) return [];
  dictionary.add(begin);

  let forward = new Map([[begin, null]]);
  let backward = new Map([[end, null]]);

  function pathToRoot(parents, word) {
    const path = [];
    while (word !== null) {
      path.push(word);
      word = parents.get(word);
    }
    return path.reverse();
  }

  while (forward.size && backward.size) {
    if (forward.size > backward.size) {
      [forward, backward] = [backward, forward];
    }

    const next = new Map();
    for (const word of forward.keys()) {
      const chars = word.split("");
      for (let i = 0; i < chars.length; i++) {
        const original = chars[i];
        for (const replacement of alphabet) {
          if (replacement === original) continue;
          chars[i] = replacement;
          const candidate = chars.join("");
          if (backward.has(candidate)) {
            const left = pathToRoot(forward, word);
            const right = pathToRoot(backward, candidate).reverse();
            return left.concat(right);
          }
          if (dictionary.has(candidate) && !forward.has(candidate) && !next.has(candidate)) {
            next.set(candidate, word);
          }
        }
        chars[i] = original;
      }
    }
    forward = next;
  }
  return [];
}

// Tests
const assert = require("node:assert/strict");
const words = ["hot", "dot", "dog", "lot", "log", "cog"];
const path = shortestWordLadder("hit", "cog", words);
assert.equal(path[0], "hit");
assert.equal(path[path.length - 1], "cog");
assert.equal(path.length, 5);
for (let i = 1; i < path.length; i++) {
  let differences = 0;
  for (let j = 0; j < path[i].length; j++) {
    if (path[i][j] !== path[i - 1][j]) differences++;
  }
  assert.equal(differences, 1);
}
assert.deepEqual(shortestWordLadder("same", "same", []), ["same"]);
assert.deepEqual(shortestWordLadder("hit", "zzz", words), []);
console.log("word ladder tests passed");
