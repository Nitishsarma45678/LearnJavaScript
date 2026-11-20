// Exercise: Parse and evaluate arithmetic expressions with recursive descent.
// Supports decimals, unary signs, parentheses, + - * / and right-associative ^.
// Unary precedence is lower than exponentiation: -2^2 is -(2^2).
// Run: node daily/2026-11-20/10-recursive-expression-parser.js
"use strict";
const assert = require("node:assert/strict");
function tokenize(source) {
  const tokens = [];
  let i = 0;
  while (i < source.length) {
    if (/\s/.test(source[i])) { i++; continue; }
    const number = source.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (number) { tokens.push({ type: "number", value: Number(number[0]) }); i += number[0].length; continue; }
    if ("+-*/^()".includes(source[i])) { tokens.push({ type: source[i], value: source[i] }); i++; continue; }
    throw new SyntaxError("unexpected character at position " + i);
  }
  return tokens;
}
function evaluate(source) {
  const tokens = tokenize(source);
  let index = 0;
  const peek = () => tokens[index];
  const consume = type => {
    if (peek()?.type !== type) throw new SyntaxError("expected " + type);
    return tokens[index++];
  };
  function primary() {
    if (peek()?.type === "number") return consume("number").value;
    if (peek()?.type === "(") {
      consume("(");
      const value = expression();
      consume(")");
      return value;
    }
    throw new SyntaxError("expected a number or parenthesized expression");
  }
  function power() {
    const base = primary();
    if (peek()?.type === "^") { consume("^"); return base ** unary(); }
    return base;
  }
  function unary() {
    if (peek()?.type === "+") { consume("+"); return unary(); }
    if (peek()?.type === "-") { consume("-"); return -unary(); }
    return power();
  }
  function term() {
    let value = unary();
    while (peek()?.type === "*" || peek()?.type === "/") {
      const operator = tokens[index++].type, right = unary();
      if (operator === "/" && right === 0) throw new RangeError("division by zero");
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  }
  function expression() {
    let value = term();
    while (peek()?.type === "+" || peek()?.type === "-") {
      const operator = tokens[index++].type, right = term();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }
  if (tokens.length === 0) throw new SyntaxError("expression is empty");
  const result = expression();
  if (index !== tokens.length) throw new SyntaxError("unexpected token " + tokens[index].type);
  if (!Number.isFinite(result)) throw new RangeError("result is not finite");
  return result;
}
assert.equal(evaluate("2 + 3 * 4"), 14);
assert.equal(evaluate("(2 + 3) * 4"), 20);
assert.equal(evaluate("-2^2"), -4);
assert.equal(evaluate("2^-2"), 0.25);
assert.equal(evaluate("2^3^2"), 512);
assert.equal(evaluate("-.5 + 1.25"), 0.75);
assert.throws(() => evaluate("4 / (2 - 2)"), /division by zero/);
assert.throws(() => evaluate("1 + * 2"), /expected/);
assert.throws(() => evaluate("2 @ 3"), /unexpected character/);
console.log("recursive expression parser: all tests passed");
