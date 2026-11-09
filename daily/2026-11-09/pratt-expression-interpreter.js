/**
 * Pratt Expression Interpreter
 * ----------------------------
 * Build a small expression language without eval() or Function().
 *
 * Supported values: numbers, strings, booleans, null, and environment variables.
 * Supported syntax: function calls, unary operators, arithmetic, comparisons,
 * strict equality, short-circuit logic, nullish coalescing, and ternaries.
 *
 * Run: node pratt-expression-interpreter.js
 */

"use strict";

function tokenize(source) {
  if (typeof source !== "string") throw new TypeError("Expression must be a string");
  const tokens = [];
  let i = 0;
  const operators = ["===", "!==", "<=", ">=", "&&", "||", "??", "**"];
  const single = "+-*/%!<>()?,:";

  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) { i++; continue; }

    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(source[i + 1] || ""))) {
      const match = source.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
      if (!match) throw new SyntaxError("Invalid number at position " + i);
      const value = Number(match[0]);
      if (!Number.isFinite(value)) throw new SyntaxError("Numeric literal is not finite");
      tokens.push({ type: "number", value, position: i });
      i += match[0].length;
      continue;
    }

    if (/[A-Za-z_$]/.test(ch)) {
      const match = source.slice(i).match(/^[A-Za-z_$][\w$]*/)[0];
      tokens.push({ type: "identifier", value: match, position: i });
      i += match.length;
      continue;
    }

    if (ch === "'" || ch === '"') {
      const quote = ch;
      const start = i++;
      let value = "";
      let closed = false;
      while (i < source.length) {
        const current = source[i++];
        if (current === quote) { closed = true; break; }
        if (current === "\n" || current === "\r") {
          throw new SyntaxError("Unescaped newline in string at position " + start);
        }
        if (current !== "\\") { value += current; continue; }
        if (i >= source.length) throw new SyntaxError("Unterminated escape at position " + start);
        const escaped = source[i++];
        const simple = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", "0": "\0" };
        if (Object.prototype.hasOwnProperty.call(simple, escaped)) value += simple[escaped];
        else if (escaped === "u") {
          const hex = source.slice(i, i + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new SyntaxError("Invalid Unicode escape at position " + (i - 2));
          value += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        } else value += escaped;
      }
      if (!closed) throw new SyntaxError("Unterminated string at position " + start);
      tokens.push({ type: "string", value, position: start });
      continue;
    }

    const operator = operators.find(candidate => source.startsWith(candidate, i));
    if (operator) {
      tokens.push({ type: "operator", value: operator, position: i });
      i += operator.length;
      continue;
    }
    if (single.includes(ch)) {
      tokens.push({ type: "operator", value: ch, position: i });
      i++;
      continue;
    }
    throw new SyntaxError("Unexpected character " + JSON.stringify(ch) + " at position " + i);
  }

  tokens.push({ type: "eof", value: "<eof>", position: source.length });
  return tokens;
}

const INFIX_BINDING_POWER = {
  "||": [10, 11],
  "??": [12, 13],
  "&&": [20, 21],
  "===": [30, 31],
  "!==": [30, 31],
  "<": [40, 41],
  "<=": [40, 41],
  ">": [40, 41],
  ">=": [40, 41],
  "+": [50, 51],
  "-": [50, 51],
  "*": [60, 61],
  "/": [60, 61],
  "%": [60, 61],
  "**": [80, 80]
};

class Parser {
  constructor(tokens, maxDepth = 512) {
    this.tokens = tokens;
    this.index = 0;
    this.maxDepth = maxDepth;
  }

  peek() { return this.tokens[this.index]; }

  take(value) {
    const token = this.peek();
    if (value !== undefined && token.value !== value) {
      throw new SyntaxError("Expected " + value + " at position " + token.position);
    }
    this.index++;
    return token;
  }

  parse() {
    const expression = this.parseExpression(0, 0);
    if (this.peek().type !== "eof") {
      throw new SyntaxError("Unexpected token " + this.peek().value + " at position " + this.peek().position);
    }
    return expression;
  }

  parseExpression(minBP, depth) {
    if (depth > this.maxDepth) throw new RangeError("Maximum parser depth exceeded");
    const token = this.take();
    let left;

    if (token.type === "number" || token.type === "string") {
      left = { type: "literal", value: token.value };
    } else if (token.type === "identifier") {
      if (token.value === "true") left = { type: "literal", value: true };
      else if (token.value === "false") left = { type: "literal", value: false };
      else if (token.value === "null") left = { type: "literal", value: null };
      else left = { type: "identifier", name: token.value };
    } else if (token.value === "(") {
      left = this.parseExpression(0, depth + 1);
      this.take(")");
    } else if (["!", "+", "-"].includes(token.value)) {
      left = { type: "unary", operator: token.value, argument: this.parseExpression(75, depth + 1) };
    } else {
      throw new SyntaxError("Expected an expression at position " + token.position);
    }

    while (true) {
      const next = this.peek();

      if (next.value === "(" && 90 >= minBP) {
        this.take("(");
        const args = [];
        if (this.peek().value !== ")") {
          do {
            args.push(this.parseExpression(0, depth + 1));
            if (this.peek().value !== ",") break;
            this.take(",");
          } while (true);
        }
        this.take(")");
        left = { type: "call", callee: left, arguments: args };
        continue;
      }

      if (next.value === "?" && 5 >= minBP) {
        this.take("?");
        const consequent = this.parseExpression(0, depth + 1);
        this.take(":");
        const alternate = this.parseExpression(5, depth + 1);
        left = { type: "conditional", test: left, consequent, alternate };
        continue;
      }

      const binding = INFIX_BINDING_POWER[next.value];
      if (!binding || binding[0] < minBP) break;
      this.take();
      const right = this.parseExpression(binding[1], depth + 1);
      left = { type: "binary", operator: next.value, left, right };
    }

    return left;
  }
}

function parse(source, options = {}) {
  return new Parser(tokenize(source), options.maxDepth || 512).parse();
}

function evaluate(astOrSource, environment = {}) {
  if (environment === null || (typeof environment !== "object" && typeof environment !== "function")) {
    throw new TypeError("Environment must be an object");
  }
  const ast = typeof astOrSource === "string" ? parse(astOrSource) : astOrSource;

  function visit(node, depth) {
    if (depth > 1024) throw new RangeError("Maximum evaluation depth exceeded");
    switch (node.type) {
      case "literal": return node.value;
      case "identifier":
        if (!Object.prototype.hasOwnProperty.call(environment, node.name)) {
          throw new ReferenceError("Unknown identifier: " + node.name);
        }
        return environment[node.name];
      case "unary": {
        const value = visit(node.argument, depth + 1);
        if (node.operator === "!") return !value;
        if (node.operator === "+") return +value;
        return -value;
      }
      case "conditional":
        return visit(node.test, depth + 1)
          ? visit(node.consequent, depth + 1)
          : visit(node.alternate, depth + 1);
      case "call": {
        const fn = visit(node.callee, depth + 1);
        if (typeof fn !== "function") throw new TypeError("Expression target is not callable");
        const args = node.arguments.map(argument => visit(argument, depth + 1));
        return Reflect.apply(fn, undefined, args);
      }
      case "binary": {
        const left = visit(node.left, depth + 1);
        if (node.operator === "&&") return left ? visit(node.right, depth + 1) : left;
        if (node.operator === "||") return left ? left : visit(node.right, depth + 1);
        if (node.operator === "??") return left === null || left === undefined ? visit(node.right, depth + 1) : left;
        const right = visit(node.right, depth + 1);
        switch (node.operator) {
          case "+": return left + right;
          case "-": return left - right;
          case "*": return left * right;
          case "/": return left / right;
          case "%": return left % right;
          case "**": return left ** right;
          case "<": return left < right;
          case "<=": return left <= right;
          case ">": return left > right;
          case ">=": return left >= right;
          case "===": return left === right;
          case "!==": return left !== right;
          default: throw new Error("Unsupported operator: " + node.operator);
        }
      }
      default: throw new TypeError("Unknown AST node type: " + node.type);
    }
  }

  return visit(ast, 0);
}

function run(source, environment) {
  return evaluate(parse(source), environment);
}

function runTests() {
  let checks = 0;
  function equal(actual, expected, label) {
    checks++;
    if (!Object.is(actual, expected)) {
      throw new Error(label + ": expected " + String(expected) + ", received " + String(actual));
    }
  }
  function throws(fn, ErrorType, label) {
    checks++;
    let error;
    try { fn(); } catch (caught) { error = caught; }
    if (!(error instanceof ErrorType)) throw new Error(label + ": expected " + ErrorType.name);
  }

  equal(run("2 + 3 * 4"), 14, "multiplication precedence");
  equal(run("2 ** 3 ** 2"), 512, "right-associative exponentiation");
  equal(run("-2 ** 2"), -4, "unary precedence");
  equal(run("false ? 1 : true ? 7 : 9"), 7, "nested conditional");
  equal(run("null ?? 8"), 8, "nullish coalescing");
  equal(run("0 || 5"), 5, "logical OR");
  equal(run("'hello' + ' ' + \"world\""), "hello world", "string literals");
  equal(run("max(3, 9, 4) + offset", { max: Math.max, offset: 1 }), 10, "environment calls");
  equal(run("score >= 50 && score < 90", { score: 72 }), true, "comparison and logic");

  let calls = 0;
  equal(run("false && tick()", { tick: () => { calls++; return true; } }), false, "short circuit result");
  equal(calls, 0, "short circuit side effects");
  equal(run("true || tick()", { tick: () => { calls++; return false; } }), true, "OR short circuit");
  equal(calls, 0, "OR side effects");
  equal(run("0 ? 1 : 2"), 2, "truthy conditional semantics");
  equal(evaluate(parse("x + 1"), { x: 4 }), 5, "pre-parsed AST");

  throws(() => run("missing + 1"), ReferenceError, "unknown identifier");
  throws(() => run("1 + * 2"), SyntaxError, "malformed expression");
  throws(() => run("sum(1, 2)", { sum: 3 }), TypeError, "non-callable target");
  throws(() => run("1; 2"), SyntaxError, "trailing token");
  throws(() => tokenize("@"), SyntaxError, "invalid character");

  return { passed: checks };
}

if (typeof require !== "undefined" && require.main === module) {
  const result = runTests();
  console.log("Pratt expression interpreter: " + result.passed + " checks passed");
}

module.exports = { tokenize, parse, evaluate, run, runTests };
