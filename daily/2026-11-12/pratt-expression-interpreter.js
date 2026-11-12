/**
 * A small expression interpreter built with Pratt parsing.
 *
 * Supported syntax: numeric and double-quoted string literals, true/false/null,
 * identifiers, whitelisted function calls, unary operators, arithmetic,
 * comparisons, equality, logical/nullish operators, and ternary expressions.
 * There is deliberately no property access, assignment, or eval().
 *
 * The environment is the only source of identifiers and callable functions.
 * Logical operators and the conditional operator short-circuit.
 *
 * Run: node pratt-expression-interpreter.js
 */

const BINDING_POWER = {
  "||": [10, 11],
  "??": [12, 13],
  "&&": [15, 16],
  "==": [20, 21],
  "!=": [20, 21],
  "===": [20, 21],
  "!==": [20, 21],
  "<": [25, 26],
  "<=": [25, 26],
  ">": [25, 26],
  ">=": [25, 26],
  "+": [30, 31],
  "-": [30, 31],
  "*": [40, 41],
  "/": [40, 41],
  "%": [40, 41],
  "**": [50, 50]
};

function tokenize(input) {
  if (typeof input !== "string") throw new TypeError("expression must be a string");
  const tokens = [];
  const operators = ["===", "!==", "**", "&&", "||", "??", "<=", ">=", "==", "!="];
  const punctuation = new Set(["+", "-", "*", "/", "%", "<", ">", "!", "?", ":", "(", ")", ","]);
  let index = 0;

  while (index < input.length) {
    const char = input[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    const number = input.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    if (number) {
      const value = Number(number[0]);
      if (!Number.isFinite(value)) throw new SyntaxError("numeric literal is not finite");
      tokens.push({ type: "literal", value });
      index += number[0].length;
      continue;
    }

    if (char === '"') {
      const start = index;
      index += 1;
      let closed = false;
      while (index < input.length) {
        if (input[index] === "\\") {
          index += 2;
          continue;
        }
        if (input[index] === '"') {
          index += 1;
          closed = true;
          break;
        }
        if (input[index] === "\n" || input[index] === "\r") {
          throw new SyntaxError("newline inside string literal");
        }
        index += 1;
      }
      if (!closed) throw new SyntaxError("unterminated string literal");
      let value;
      try {
        value = JSON.parse(input.slice(start, index));
      } catch {
        throw new SyntaxError("invalid string escape");
      }
      tokens.push({ type: "literal", value });
      continue;
    }

    const identifier = input.slice(index).match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
    if (identifier) {
      const name = identifier[0];
      if (name === "true") tokens.push({ type: "literal", value: true });
      else if (name === "false") tokens.push({ type: "literal", value: false });
      else if (name === "null") tokens.push({ type: "literal", value: null });
      else tokens.push({ type: "identifier", value: name });
      index += name.length;
      continue;
    }

    const operator = operators.find((candidate) => input.startsWith(candidate, index));
    if (operator) {
      tokens.push({ type: "operator", value: operator });
      index += operator.length;
      continue;
    }

    if (punctuation.has(char)) {
      tokens.push({ type: "operator", value: char });
      index += 1;
      continue;
    }

    throw new SyntaxError("unexpected character at position " + index + ": " + char);
  }

  tokens.push({ type: "eof", value: "" });
  return tokens;
}

class PrattParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.position = 0;
  }

  peek() {
    return this.tokens[this.position];
  }

  consume(value) {
    const token = this.peek();
    if (value !== undefined && token.value !== value) {
      throw new SyntaxError("expected " + value + " but found " + (token.value || "end of input"));
    }
    this.position += 1;
    return token;
  }

  parse() {
    const expression = this.parseExpression(0);
    if (this.peek().type !== "eof") {
      throw new SyntaxError("unexpected token: " + this.peek().value);
    }
    return expression;
  }

  parseExpression(minimumPower) {
    const token = this.consume();
    let left;

    if (token.type === "literal") {
      left = { type: "literal", value: token.value };
    } else if (token.type === "identifier") {
      left = { type: "identifier", name: token.value };
    } else if (token.value === "!" || token.value === "+" || token.value === "-") {
      left = {
        type: "unary",
        operator: token.value,
        argument: this.parseExpression(60)
      };
    } else if (token.value === "(") {
      left = this.parseExpression(0);
      this.consume(")");
    } else {
      throw new SyntaxError("expected an expression, found: " + (token.value || "end of input"));
    }

    while (true) {
      const next = this.peek();

      if (next.value === "(" && 70 >= minimumPower) {
        this.consume("(");
        const args = [];
        if (this.peek().value !== ")") {
          do {
            args.push(this.parseExpression(0));
            if (this.peek().value !== ",") break;
            this.consume(",");
          } while (true);
        }
        this.consume(")");
        left = { type: "call", callee: left, arguments: args };
        continue;
      }

      if (next.value === "?" && 5 >= minimumPower) {
        this.consume("?");
        const consequent = this.parseExpression(0);
        this.consume(":");
        const alternate = this.parseExpression(5);
        left = { type: "conditional", test: left, consequent, alternate };
        continue;
      }

      const powers = BINDING_POWER[next.value];
      if (!powers || powers[0] < minimumPower) break;
      const operator = this.consume().value;
      const right = this.parseExpression(powers[1]);
      left = { type: "binary", operator, left, right };
    }

    return left;
  }
}

function parseExpression(source) {
  return new PrattParser(tokenize(source)).parse();
}

function evaluateAst(node, environment = Object.create(null)) {
  switch (node.type) {
    case "literal":
      return node.value;

    case "identifier":
      if (!Object.prototype.hasOwnProperty.call(environment, node.name)) {
        throw new ReferenceError("unknown identifier: " + node.name);
      }
      return environment[node.name];

    case "unary": {
      const value = evaluateAst(node.argument, environment);
      if (node.operator === "!") return !value;
      if (node.operator === "+") return +value;
      if (node.operator === "-") return -value;
      throw new Error("unsupported unary operator");
    }

    case "conditional":
      return evaluateAst(node.test, environment)
        ? evaluateAst(node.consequent, environment)
        : evaluateAst(node.alternate, environment);

    case "call": {
      const callable = evaluateAst(node.callee, environment);
      if (typeof callable !== "function") {
        throw new TypeError("expression target is not callable");
      }
      const args = node.arguments.map((argument) => evaluateAst(argument, environment));
      return callable(...args);
    }

    case "binary": {
      const left = evaluateAst(node.left, environment);
      if (node.operator === "&&") {
        return left ? evaluateAst(node.right, environment) : left;
      }
      if (node.operator === "||") {
        return left ? left : evaluateAst(node.right, environment);
      }
      if (node.operator === "??") {
        return left === null || left === undefined
          ? evaluateAst(node.right, environment)
          : left;
      }

      const right = evaluateAst(node.right, environment);
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
        case "==": return left == right;
        case "!=": return left != right;
        case "===": return left === right;
        case "!==": return left !== right;
        default: throw new Error("unsupported binary operator: " + node.operator);
      }
    }

    default:
      throw new TypeError("unknown AST node type: " + node.type);
  }
}

function evaluateExpression(source, environment = Object.create(null)) {
  return evaluateAst(parseExpression(source), environment);
}

function compileExpression(source) {
  const ast = parseExpression(source);
  return (environment = Object.create(null)) => evaluateAst(ast, environment);
}

function runTests() {
  const assert = require("node:assert/strict");
  const environment = {
    price: 12,
    quantity: 3,
    max: Math.max,
    sum: (...values) => values.reduce((a, b) => a + b, 0),
    enabled: false,
    fallback: 9
  };

  assert.equal(evaluateExpression("price + quantity * 4", environment), 24);
  assert.equal(evaluateExpression("2 ** 3 ** 2"), 512);
  assert.equal(evaluateExpression('max(2, sum(3, 4), 5)'), 7);
  assert.equal(evaluateExpression('enabled && missing()', environment), false);
  assert.equal(evaluateExpression('enabled ? missing : fallback', environment), 9);
  assert.equal(evaluateExpression('null ?? fallback', environment), 9);
  assert.equal(evaluateExpression('("hello" + " world") === "hello world"'), true);
  assert.equal(compileExpression("price * quantity")(environment), 36);

  assert.throws(() => evaluateExpression("missing + 1"), ReferenceError);
  assert.throws(() => evaluateExpression("max(1, 2) + 3", { max: 4 }), TypeError);
  assert.throws(() => parseExpression("1 + (2 * 3"), SyntaxError);
  assert.throws(() => parseExpression("1 = 2"), SyntaxError);
  assert.throws(() => parseExpression("globalThis.process"), SyntaxError);
  console.log("Pratt expression interpreter tests passed");
}

module.exports = {
  tokenize,
  parseExpression,
  evaluateAst,
  evaluateExpression,
  compileExpression
};

if (require.main === module) runTests();
