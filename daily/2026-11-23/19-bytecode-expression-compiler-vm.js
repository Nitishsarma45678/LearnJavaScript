// Exercise: Compile arithmetic expressions into stack bytecode and execute them.
// Grammar supports numbers, identifiers, parentheses, unary minus, + - * / and
// right-associative exponentiation (^). The compiler must report source positions.
//
// Run: node 19-bytecode-expression-compiler-vm.js
const assert = require("node:assert/strict");

function tokenize(source) {
  const tokens = [];
  let i = 0;
  while (i < source.length) {
    if (/\s/.test(source[i])) { i += 1; continue; }
    const start = i;
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(i));
    if (number) {
      tokens.push({ type: "number", value: Number(number[0]), position: start });
      i += number[0].length;
      continue;
    }
    const identifier = /^[A-Za-z_$][\w$]*/.exec(source.slice(i));
    if (identifier) {
      tokens.push({ type: "identifier", value: identifier[0], position: start });
      i += identifier[0].length;
      continue;
    }
    if ("+-*/^()".includes(source[i])) {
      tokens.push({ type: source[i], value: source[i], position: start });
      i += 1;
      continue;
    }
    throw new SyntaxError("unexpected character at position " + i);
  }
  tokens.push({ type: "eof", position: source.length });
  return tokens;
}

function compileExpression(source) {
  const tokens = tokenize(source);
  let cursor = 0;
  const code = [];
  const current = () => tokens[cursor];
  const consume = (type) => {
    if (current().type !== type) {
      throw new SyntaxError("expected " + type + " at position " + current().position);
    }
    return tokens[cursor++];
  };

  function expression() {
    additive();
  }

  function additive() {
    multiplicative();
    while (current().type === "+" || current().type === "-") {
      const operator = tokens[cursor++].type;
      multiplicative();
      code.push({ op: operator === "+" ? "ADD" : "SUB" });
    }
  }

  function multiplicative() {
    unary();
    while (current().type === "*" || current().type === "/") {
      const operator = tokens[cursor++].type;
      unary();
      code.push({ op: operator === "*" ? "MUL" : "DIV" });
    }
  }

  function unary() {
    if (current().type === "-") {
      consume("-");
      unary();
      code.push({ op: "NEG" });
    } else if (current().type === "+") {
      consume("+");
      unary();
    } else {
      power();
    }
  }

  function power() {
    primary();
    if (current().type === "^") {
      consume("^");
      unary(); // recursive unary parsing makes exponentiation right-associative
      code.push({ op: "POW" });
    }
  }

  function primary() {
    if (current().type === "number") {
      code.push({ op: "PUSH", value: consume("number").value });
    } else if (current().type === "identifier") {
      code.push({ op: "LOAD", name: consume("identifier").value });
    } else if (current().type === "(") {
      consume("(");
      expression();
      consume(")");
    } else {
      throw new SyntaxError("expected expression at position " + current().position);
    }
  }

  expression();
  consume("eof");
  return code;
}

function executeBytecode(code, variables = {}) {
  const stack = [];
  const pop = () => {
    if (!stack.length) throw new Error("bytecode stack underflow");
    return stack.pop();
  };

  for (const instruction of code) {
    switch (instruction.op) {
      case "PUSH":
        stack.push(instruction.value);
        break;
      case "LOAD":
        if (!Object.prototype.hasOwnProperty.call(variables, instruction.name)) {
          throw new ReferenceError("unknown variable: " + instruction.name);
        }
        stack.push(variables[instruction.name]);
        break;
      case "NEG":
        stack.push(-pop());
        break;
      case "ADD": {
        const right = pop(); const left = pop(); stack.push(left + right); break;
      }
      case "SUB": {
        const right = pop(); const left = pop(); stack.push(left - right); break;
      }
      case "MUL": {
        const right = pop(); const left = pop(); stack.push(left * right); break;
      }
      case "DIV": {
        const right = pop(); const left = pop(); stack.push(left / right); break;
      }
      case "POW": {
        const right = pop(); const left = pop(); stack.push(left ** right); break;
      }
      default:
        throw new Error("unknown opcode: " + instruction.op);
    }
  }

  if (stack.length !== 1) throw new Error("bytecode did not leave exactly one result");
  return stack[0];
}

function evaluate(source, variables) {
  return executeBytecode(compileExpression(source), variables);
}

// Example tests
{
  assert.equal(evaluate("2 + 3 * (x - 4)^2", { x: 6 }), 14);
  assert.equal(evaluate("2^3^2"), 512);
  assert.equal(evaluate("-2^2"), -4);
  assert.equal(evaluate("(-2)^2"), 4);
  assert.equal(evaluate("3 + 4 * 2 / (1 - 5)"), 1);
  assert.throws(() => evaluate("missing + 1"), /unknown variable/);
  assert.throws(() => compileExpression("2 + )"), /expected expression/);
  assert.throws(() => compileExpression("1 @ 2"), /unexpected character/);
}
console.log("bytecode compiler and VM tests passed");
