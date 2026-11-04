'use strict';

/**
 * Exercise: build a safe expression engine without eval or Function.
 * Supported syntax: numbers, identifiers, function calls, parentheses,
 * unary + - !, arithmetic, comparisons, equality, &&, || and ??.
 * Exponentiation is right-associative and binds more tightly than unary minus.
 */

function tokenize(source) {
  const tokens = [];
  let i = 0;
  const operators = ['===', '!==', '**', '<=', '>=', '==', '!=', '&&', '||', '??'];

  while (i < source.length) {
    if (/\s/.test(source[i])) { i++; continue; }
    const rest = source.slice(i);
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
    if (number) {
      const value = Number(number[0]);
      if (!Number.isFinite(value)) throw new SyntaxError(`Invalid number at ${i}`);
      tokens.push({ type: 'number', value, position: i });
      i += number[0].length;
      continue;
    }
    const identifier = /^[A-Za-z_$][\w$]*/.exec(rest);
    if (identifier) {
      tokens.push({ type: 'identifier', value: identifier[0], position: i });
      i += identifier[0].length;
      continue;
    }
    const operator = operators.find(op => rest.startsWith(op));
    if (operator) {
      tokens.push({ type: 'operator', value: operator, position: i });
      i += operator.length;
      continue;
    }
    if ('+-*/%^<>()!,'.includes(source[i])) {
      tokens.push({ type: 'operator', value: source[i], position: i++ });
      continue;
    }
    throw new SyntaxError(`Unexpected character ${JSON.stringify(source[i])} at ${i}`);
  }
  tokens.push({ type: 'eof', value: '<eof>', position: source.length });
  return tokens;
}

const INFIX = new Map([
  ['??', [10, 11]], ['||', [20, 21]], ['&&', [30, 31]],
  ['==', [35, 36]], ['!=', [35, 36]], ['===', [35, 36]], ['!==', [35, 36]],
  ['<', [40, 41]], ['<=', [40, 41]], ['>', [40, 41]], ['>=', [40, 41]],
  ['+', [50, 51]], ['-', [50, 51]],
  ['*', [60, 61]], ['/', [60, 61]], ['%', [60, 61]],
  ['**', [80, 80]] // equal binding powers make this operator right-associative
]);

function parse(source) {
  const tokens = tokenize(source);
  let cursor = 0;
  const peek = () => tokens[cursor];
  const take = () => tokens[cursor++];
  const expect = value => {
    if (peek().value !== value) throw new SyntaxError(`Expected ${value} at ${peek().position}`);
    return take();
  };

  function expression(minBindingPower = 0) {
    const token = take();
    let left;
    if (token.type === 'number') {
      left = { type: 'literal', value: token.value };
    } else if (token.type === 'identifier') {
      if (token.value === 'true' || token.value === 'false' || token.value === 'null') {
        left = { type: 'literal', value: token.value === 'null' ? null : token.value === 'true' };
      } else {
        left = { type: 'identifier', name: token.value };
      }
    } else if (token.value === '(') {
      left = expression();
      expect(')');
    } else if (['+', '-', '!'].includes(token.value)) {
      // 70 is below exponentiation (80), so -2**2 parses as -(2**2).
      left = { type: 'unary', operator: token.value, argument: expression(70) };
    } else {
      throw new SyntaxError(`Unexpected token ${token.value} at ${token.position}`);
    }

    while (true) {
      // Function-call postfix has the highest precedence.
      if (peek().value === '(' && 90 >= minBindingPower) {
        take();
        const args = [];
        if (peek().value !== ')') {
          do {
            args.push(expression());
            if (peek().value !== ',') break;
            take();
          } while (true);
        }
        expect(')');
        left = { type: 'call', callee: left, args };
        continue;
      }

      const binding = INFIX.get(peek().value);
      if (!binding || binding[0] < minBindingPower) break;
      const operator = take().value;
      const right = expression(binding[1]);
      left = { type: 'binary', operator, left, right };
    }
    return left;
  }

  const ast = expression();
  if (peek().type !== 'eof') throw new SyntaxError(`Unexpected token ${peek().value} at ${peek().position}`);
  return ast;
}

const BUILT_INS = Object.freeze({
  abs: Math.abs,
  ceil: Math.ceil,
  floor: Math.floor,
  max: Math.max,
  min: Math.min,
  round: Math.round,
  sqrt: Math.sqrt,
  pow: Math.pow,
  clamp: (value, low, high) => Math.min(high, Math.max(low, value))
});

function evaluate(ast, variables = {}, functions = BUILT_INS) {
  switch (ast.type) {
    case 'literal': return ast.value;
    case 'identifier': {
      if (Object.hasOwn(variables, ast.name)) return variables[ast.name];
      if (Object.hasOwn(functions, ast.name)) return functions[ast.name];
      throw new ReferenceError(`Unknown identifier: ${ast.name}`);
    }
    case 'call': {
      const callable = evaluate(ast.callee, variables, functions);
      if (typeof callable !== 'function') throw new TypeError('Expression target is not callable');
      return callable(...ast.args.map(arg => evaluate(arg, variables, functions)));
    }
    case 'unary': {
      const value = evaluate(ast.argument, variables, functions);
      if (ast.operator === '+') return +value;
      if (ast.operator === '-') return -value;
      return !value;
    }
    case 'binary': {
      const left = evaluate(ast.left, variables, functions);
      // Preserve JavaScript-style short-circuiting; the right side may throw.
      if (ast.operator === '&&') return left && evaluate(ast.right, variables, functions);
      if (ast.operator === '||') return left || evaluate(ast.right, variables, functions);
      if (ast.operator === '??') return left ?? evaluate(ast.right, variables, functions);
      const right = evaluate(ast.right, variables, functions);
      switch (ast.operator) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return left / right;
        case '%': return left % right;
        case '**': return left ** right;
        case '<': return left < right;
        case '<=': return left <= right;
        case '>': return left > right;
        case '>=': return left >= right;
        case '==': return left == right; // intentional coercive equality
        case '!=': return left != right;
        case '===': return left === right;
        case '!==': return left !== right;
        default: throw new Error(`Unsupported operator: ${ast.operator}`);
      }
    }
    default: throw new Error("Unknown AST node: " + ast.type);
  }
}

function evaluateExpression(source, { variables = {}, functions = {} } = {}) {
  return evaluate(parse(source), variables, { ...BUILT_INS, ...functions });
}

module.exports = { tokenize, parse, evaluate, evaluateExpression };

if (require.main === module) {
  const assert = require('node:assert/strict');
  assert.equal(evaluateExpression('2 + 3 * 4'), 14);
  assert.equal(evaluateExpression('2 ** 3 ** 2'), 512);
  assert.equal(evaluateExpression('-2 ** 2'), -4);
  assert.equal(evaluateExpression('(-2) ** 2'), 4);
  assert.equal(evaluateExpression('clamp(max(score, 8) * 2, 0, 20)', { variables: { score: 7 } }), 16);
  assert.equal(evaluateExpression('false || (3 >= 3 && true)'), true);
  assert.equal(evaluateExpression('0 && missing()'), 0); // right side is not evaluated
  assert.equal(evaluateExpression('null ?? 42'), 42);
  assert.equal(evaluateExpression('tax(price)', { variables: { price: 100 }, functions: { tax: n => n * 1.05 } }), 105);
  assert.throws(() => evaluateExpression('2 + * 3'), SyntaxError);
  assert.throws(() => evaluateExpression('unknown + 1'), ReferenceError);
  assert.throws(() => evaluateExpression('3(4)'), TypeError);
  console.log('Pratt expression engine: all tests passed');
}
