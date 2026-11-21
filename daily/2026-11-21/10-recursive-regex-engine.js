// Exercise: Build a small full-string regular-expression engine using recursive descent.
// Supported syntax: literals, escaping, ., concatenation, |, grouping, and postfix *, +, ?.
// Matching is memoized by AST node and input position.

function compilePattern(pattern) {
  const source = Array.from(pattern);
  let cursor = 0;
  let nextId = 1;
  const node = (type, properties = {}) => ({ id: nextId++, type, ...properties });

  function parseAlternation() {
    const branches = [parseConcatenation()];
    while (source[cursor] === "|") {
      cursor++;
      branches.push(parseConcatenation());
    }
    return branches.length === 1 ? branches[0] : node("alt", { branches });
  }

  function parseConcatenation() {
    const parts = [];
    while (cursor < source.length && source[cursor] !== ")" && source[cursor] !== "|") {
      parts.push(parseRepetition());
    }
    if (parts.length === 0) return node("empty");
    return parts.length === 1 ? parts[0] : node("concat", { parts });
  }

  function parseRepetition() {
    let child = parseAtom();
    const quantifier = source[cursor];
    if (quantifier === "*" || quantifier === "+" || quantifier === "?") {
      cursor++;
      child = node("repeat", {
        child,
        minimum: quantifier === "+" ? 1 : 0,
        maximum: quantifier === "?" ? 1 : Infinity
      });
      if (["*", "+", "?"].includes(source[cursor])) {
        throw new SyntaxError("stacked quantifiers are not supported");
      }
    }
    return child;
  }

  function parseAtom() {
    const char = source[cursor++];
    if (char === undefined) throw new SyntaxError("expected an expression");
    if (char === "(") {
      const inside = parseAlternation();
      if (source[cursor] !== ")") throw new SyntaxError("unclosed group");
      cursor++;
      return inside;
    }
    if (char === ")") throw new SyntaxError("unexpected closing parenthesis");
    if (char === "\\") {
      if (cursor >= source.length) throw new SyntaxError("trailing escape");
      return node("literal", { value: source[cursor++] });
    }
    if (char === "*" || char === "+" || char === "?") {
      throw new SyntaxError("quantifier has no preceding atom");
    }
    return char === "." ? node("any") : node("literal", { value: char });
  }

  if (typeof pattern !== "string") throw new TypeError("pattern must be a string");
  const ast = parseAlternation();
  if (cursor !== source.length) throw new SyntaxError("unexpected token");
  return ast;
}

function regexMatches(pattern, text) {
  const ast = compilePattern(pattern);
  const input = Array.from(text);
  const memo = new Map();

  function match(current, position) {
    const key = current.id + ":" + position;
    if (memo.has(key)) return memo.get(key);
    let result = new Set();

    if (current.type === "empty") {
      result.add(position);
    } else if (current.type === "literal") {
      if (input[position] === current.value) result.add(position + 1);
    } else if (current.type === "any") {
      if (position < input.length) result.add(position + 1);
    } else if (current.type === "alt") {
      for (const branch of current.branches) {
        for (const end of match(branch, position)) result.add(end);
      }
    } else if (current.type === "concat") {
      let positions = new Set([position]);
      for (const part of current.parts) {
        const next = new Set();
        for (const start of positions) {
          for (const end of match(part, start)) next.add(end);
        }
        positions = next;
        if (positions.size === 0) break;
      }
      result = positions;
    } else if (current.type === "repeat") {
      const first = match(current.child, position);
      if (current.minimum === 0) result.add(position);
      for (const end of first) result.add(end);
      if (current.maximum === Infinity) {
        const queue = [...result];
        const visited = new Set(result);
        for (let head = 0; head < queue.length; head++) {
          for (const end of match(current.child, queue[head])) {
            if (!visited.has(end)) {
              visited.add(end);
              queue.push(end);
            }
          }
        }
        result = visited;
      }
    }

    memo.set(key, result);
    return result;
  }

  return match(ast, 0).has(input.length);
}

// Tests
const assert = require("node:assert/strict");
assert.equal(regexMatches("a(b|c)*d", "abcbcd"), true);
assert.equal(regexMatches("a(b|c)*d", "abce"), false);
assert.equal(regexMatches("ab+", "abbb"), true);
assert.equal(regexMatches("colou?r", "color"), true);
assert.equal(regexMatches("colou?r", "colour"), true);
assert.equal(regexMatches("a\\\\*b", "a*b"), true);
assert.equal(regexMatches("(ab|)", ""), true);
assert.equal(regexMatches(".", ""), false);
assert.throws(() => compilePattern("("), SyntaxError);
assert.throws(() => compilePattern("a**"), SyntaxError);
console.log("recursive regex engine tests passed");
