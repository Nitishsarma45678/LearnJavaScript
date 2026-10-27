/**
 * Exercise: Build a recursive-descent parser for arithmetic expressions.
 * Supports +, -, *, /, ^, unary signs, parentheses, decimals, and whitespace.
 * Exponentiation is right-associative; exponentiation binds more tightly than
 * a leading unary sign, so -2^2 evaluates to -4.
 */

function tokenize(source) {
  const tokens = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      const start = i;
      let dots = 0;
      while (i < source.length && /[0-9.]/.test(source[i])) {
        if (source[i] === ".") dots += 1;
        i += 1;
      }
      const raw = source.slice(start, i);
      if (dots > 1 || raw === ".") {
        throw new SyntaxError("Invalid number: " + raw);
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        throw new SyntaxError("Invalid number: " + raw);
      }
      tokens.push({ type: "number", value });
      continue;
    }

    if ("+-*/^()".includes(ch)) {
      tokens.push({ type: ch, value: ch });
      i += 1;
      continue;
    }

    throw new SyntaxError("Unexpected character at position " + i + ": " + ch);
  }

  tokens.push({ type: "eof" });
  return tokens;
}

function evaluateExpression(source) {
  const tokens = tokenize(source);
  let cursor = 0;

  const peek = () => tokens[cursor];
  const consume = (type) => {
    if (peek().type !== type) {
      throw new SyntaxError("Expected " + type + ", received " + peek().type);
    }
    return tokens[cursor++];
  };

  function parsePrimary() {
    if (peek().type === "number") return consume("number").value;
    if (peek().type === "(") {
      consume("(");
      const value = parseExpression();
      consume(")");
      return value;
    }
    throw new SyntaxError("Expected a number or parenthesized expression");
  }

  // power := primary ['^' unary] gives exponentiation right associativity
  // and permits negative exponents such as 2^-3.
  function parsePower() {
    const base = parsePrimary();
    if (peek().type === "^") {
      consume("^");
      return Math.pow(base, parseUnary());
    }
    return base;
  }

  function parseUnary() {
    if (peek().type === "+") {
      consume("+");
      return parseUnary();
    }
    if (peek().type === "-") {
      consume("-");
      return -parseUnary();
    }
    return parsePower();
  }

  function parseTerm() {
    let value = parseUnary();
    while (peek().type === "*" || peek().type === "/") {
      const operator = tokens[cursor++].type;
      const right = parseUnary();
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  }

  function parseExpression() {
    let value = parseTerm();
    while (peek().type === "+" || peek().type === "-") {
      const operator = tokens[cursor++].type;
      const right = parseTerm();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  const result = parseExpression();
  if (peek().type !== "eof") {
    throw new SyntaxError("Unexpected token: " + peek().type);
  }
  return result;
}

function assertEqual(actual, expected, label) {
  if (!Object.is(actual, expected)) {
    throw new Error(label + ": expected " + expected + ", received " + actual);
  }
}

function assertThrows(fn, label) {
  let threw = false;
  try { fn(); } catch (error) { threw = error instanceof SyntaxError; }
  if (!threw) throw new Error(label + ": expected SyntaxError");
}

assertEqual(evaluateExpression("2 + 3 * 4"), 14, "operator precedence");
assertEqual(evaluateExpression("(2 + 3) * 4"), 20, "parentheses");
assertEqual(evaluateExpression("2^3^2"), 512, "right associative exponent");
assertEqual(evaluateExpression("-2^2"), -4, "unary precedence");
assertEqual(evaluateExpression("2^-3"), 0.125, "negative exponent");
assertEqual(evaluateExpression("10 / 2 - 3"), 2, "left-to-right division");
assertEqual(evaluateExpression(" .5 + 1.25 "), 1.75, "decimal and whitespace");
assertThrows(() => evaluateExpression("2 + * 3"), "invalid operator sequence");
assertThrows(() => evaluateExpression("(4 + 2"), "missing closing parenthesis");
assertThrows(() => evaluateExpression("2 @ 3"), "unknown character");
assertThrows(() => evaluateExpression("1..2"), "malformed decimal");

console.log("Expression parser: all tests passed.");
