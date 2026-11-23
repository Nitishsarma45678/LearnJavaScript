// Exercise: Write a memoized recursive glob matcher.
// Supported syntax:
//   ?       one non-slash character
//   *       zero or more non-slash characters
//   **      zero or more characters, including slashes
//   [a-z]   character range; [!abc] and [^abc] negate a class
//   \x      escape the next character
//
// Run: node 03-recursive-glob-matcher.js
const assert = require("node:assert/strict");

function tokenize(pattern) {
  const chars = Array.from(pattern);
  const tokens = [];

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    if (ch === "\\") {
      tokens.push({ type: "literal", value: chars[++i] ?? "\\" });
    } else if (ch === "?") {
      tokens.push({ type: "any" });
    } else if (ch === "*") {
      const recursive = chars[i + 1] === "*";
      if (recursive) {
        i += 1;
        while (chars[i + 1] === "*") i += 1;
        // A globstar followed by slash also consumes that slash, allowing **/ to
        // match zero directory segments (for example, a/**/b matches a/b).
        if (chars[i + 1] === "/") i += 1;
      }
      tokens.push({ type: "star", recursive });
    } else if (ch === "[") {
      let end = i + 1;
      while (end < chars.length && chars[end] !== "]") end += 1;
      if (end === chars.length) {
        tokens.push({ type: "literal", value: "[" });
        continue;
      }

      let members = chars.slice(i + 1, end);
      let negate = false;
      if (members[0] === "!" || members[0] === "^") {
        negate = true;
        members = members.slice(1);
      }
      const ranges = [];
      for (let j = 0; j < members.length; j += 1) {
        if (j + 2 < members.length && members[j + 1] === "-") {
          ranges.push([members[j].codePointAt(0), members[j + 2].codePointAt(0)]);
          j += 2;
        } else {
          const point = members[j].codePointAt(0);
          ranges.push([point, point]);
        }
      }
      tokens.push({ type: "class", negate, ranges });
      i = end;
    } else {
      tokens.push({ type: "literal", value: ch });
    }
  }
  return tokens;
}

function globMatch(pattern, input, options = {}) {
  if (typeof pattern !== "string" || typeof input !== "string") {
    throw new TypeError("pattern and input must be strings");
  }
  const tokens = tokenize(options.caseInsensitive ? pattern.toLocaleLowerCase() : pattern);
  const chars = Array.from(options.caseInsensitive ? input.toLocaleLowerCase() : input);
  const memo = new Map();

  function matchesClass(token, ch) {
    if (ch === "/") return false;
    const point = ch.codePointAt(0);
    const found = token.ranges.some(([low, high]) => low <= point && point <= high);
    return token.negate ? !found : found;
  }

  function visit(tokenIndex, charIndex) {
    const key = tokenIndex + ":" + charIndex;
    if (memo.has(key)) return memo.get(key);

    let answer;
    if (tokenIndex === tokens.length) {
      answer = charIndex === chars.length;
    } else {
      const token = tokens[tokenIndex];
      const ch = chars[charIndex];

      if (token.type === "star") {
        answer = visit(tokenIndex + 1, charIndex);
        if (!answer && ch !== undefined && (token.recursive || ch !== "/")) {
          answer = visit(tokenIndex, charIndex + 1);
        }
      } else if (ch === undefined) {
        answer = false;
      } else if (token.type === "literal") {
        answer = token.value === ch && visit(tokenIndex + 1, charIndex + 1);
      } else if (token.type === "any") {
        answer = ch !== "/" && visit(tokenIndex + 1, charIndex + 1);
      } else {
        answer = matchesClass(token, ch) && visit(tokenIndex + 1, charIndex + 1);
      }
    }

    memo.set(key, answer);
    return answer;
  }

  return visit(0, 0);
}

// Example tests
assert.equal(globMatch("src/*.js", "src/index.js"), true);
assert.equal(globMatch("src/*.js", "src/lib/index.js"), false);
assert.equal(globMatch("src/**/*.js", "src/lib/index.js"), true);
assert.equal(globMatch("file?.[jt]s", "file1.js"), true);
assert.equal(globMatch("file[!0-9].txt", "filea.txt"), true);
assert.equal(globMatch("file[!0-9].txt", "file7.txt"), false);
assert.equal(globMatch("literal\\*.txt", "literal*.txt"), true);
assert.equal(globMatch("README", "readme", { caseInsensitive: true }), true);
assert.equal(globMatch("a/**/b", "a/b"), true);
console.log("recursive glob matcher tests passed");
