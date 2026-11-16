/**
 * Exercise: build a Pratt parser and evaluator for a small expression language.
 * Supports numeric/string/boolean/null literals, variables, calls, unary and
 * binary operators, short-circuit logic, exponentiation and ternary expressions.
 *
 * Run: node pratt-expression-interpreter.js
 */
'use strict';
const assert = require('node:assert/strict');

class SyntaxErrorAt extends SyntaxError {
  constructor(message, position) { super(`${message} at offset ${position}`); this.name = 'SyntaxErrorAt'; this.position = position; }
}

function tokenize(source) {
  const tokens = [];
  let i = 0;
  const operators = ['===', '!==', '**', '>=', '<=', '==', '!=', '&&', '||'];
  while (i < source.length) {
    if (/\s/.test(source[i])) { i++; continue; }
    const start = i;
    const rest = source.slice(i);
    if (source[i] === '"' || source[i] === "'") {
      const quote = source[i++]; let value = '';
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') {
          i++;
          if (i >= source.length) throw new SyntaxErrorAt('Unterminated escape', start);
          const escapes = { n: '\n', r: '\r', t: '\t', '\\': '\\', '"': '"', "'": "'" };
          if (!(source[i] in escapes)) throw new SyntaxErrorAt('Unsupported escape', i);
          value += escapes[source[i++]];
        } else value += source[i++];
      }
      if (source[i] !== quote) throw new SyntaxErrorAt('Unterminated string', start);
      i++;
      tokens.push({ type: 'literal', value, position: start });
      continue;
    }
    const number = /^(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?/.exec(rest);
    if (number) {
      i += number[0].length;
      const value = Number(number[0]);
      if (!Number.isFinite(value)) throw new SyntaxErrorAt('Number is outside the finite range', start);
      tokens.push({ type: 'literal', value, position: start });
      continue;
    }
    const identifier = /^[A-Za-z_$][\w$]*/.exec(rest);
    if (identifier) {
      i += identifier[0].length;
      const word = identifier[0];
      if (word === 'true' || word === 'false' || word === 'null') {
        tokens.push({ type: 'literal', value: word === 'null' ? null : word === 'true', position: start });
      } else tokens.push({ type: 'identifier', value: word, position: start });
      continue;
    }
    const op = operators.find(candidate => rest.startsWith(candidate)) || source[i];
    if ('+-*/%><!?:(),'.includes(op) || operators.includes(op)) {
      tokens.push({ type: 'operator', value: op, position: start });
      i += op.length;
      continue;
    }
    throw new SyntaxErrorAt(`Unexpected character ${JSON.stringify(source[i])}`, i);
  }
  tokens.push({ type: 'eof', value: '<eof>', position: source.length });
  return tokens;
}

const PRECEDENCE = new Map([
  ['||', 2], ['&&', 3], ['==', 4], ['!=', 4], ['===', 4], ['!==', 4],
  ['<', 5], ['<=', 5], ['>', 5], ['>=', 5], ['+', 6], ['-', 6],
  ['*', 7], ['/', 7], ['%', 7], ['**', 9],
]);

function parse(source) {
  const tokens = tokenize(source);
  let cursor = 0;
  const peek = () => tokens[cursor];
  const take = () => tokens[cursor++];
  const expect = value => {
    if (peek().value !== value) throw new SyntaxErrorAt(`Expected ${value}, found ${peek().value}`, peek().position);
    return take();
  };

  function expression(minPrecedence = 0) {
    let left = prefix();
    while (true) {
      if (peek().value === '(' && minPrecedence <= 10) {
        take(); const args = [];
        if (peek().value !== ')') {
          do { args.push(expression(0)); if (peek().value !== ',') break; take(); } while (true);
        }
        expect(')');
        left = { type: 'Call', callee: left, args };
        continue;
      }
      if (peek().value === '?' && minPrecedence <= 1) {
        take();
        const consequent = expression(0);
        expect(':');
        const alternate = expression(1);
        left = { type: 'Conditional', test: left, consequent, alternate };
        continue;
      }
      const precedence = PRECEDENCE.get(peek().value);
      if (precedence === undefined || precedence < minPrecedence) break;
      const operator = take().value;
      const right = expression(precedence + (operator === '**' ? 0 : 1));
      left = { type: 'Binary', operator, left, right };
    }
    return left;
  }

  function prefix() {
    const token = take();
    if (token.type === 'literal') return { type: 'Literal', value: token.value };
    if (token.type === 'identifier') return { type: 'Identifier', name: token.value };
    if (token.value === '(') { const node = expression(0); expect(')'); return node; }
    if (['+', '-', '!'].includes(token.value)) return { type: 'Unary', operator: token.value, argument: expression(8) };
    throw new SyntaxErrorAt(`Expected an expression, found ${token.value}`, token.position);
  }

  const ast = expression(0);
  if (peek().type !== 'eof') throw new SyntaxErrorAt(`Unexpected token ${peek().value}`, peek().position);
  return ast;
}

function evaluate(ast, environment = Object.create(null)) {
  switch (ast.type) {
    case 'Literal': return ast.value;
    case 'Identifier':
      if (!Object.hasOwn(environment, ast.name)) throw new ReferenceError(`Unknown identifier: ${ast.name}`);
      return environment[ast.name];
    case 'Unary': {
      const value = evaluate(ast.argument, environment);
      if (ast.operator === '+') return +value;
      if (ast.operator === '-') return -value;
      return !value;
    }
    case 'Conditional':
      return evaluate(ast.test, environment) ? evaluate(ast.consequent, environment) : evaluate(ast.alternate, environment);
    case 'Call': {
      const fn = evaluate(ast.callee, environment);
      if (typeof fn !== 'function') throw new TypeError('Expression is not callable');
      return Reflect.apply(fn, undefined, ast.args.map(arg => evaluate(arg, environment)));
    }
    case 'Binary': {
      const left = evaluate(ast.left, environment);
      if (ast.operator === '&&') return left && evaluate(ast.right, environment);
      if (ast.operator === '||') return left || evaluate(ast.right, environment);
      const right = evaluate(ast.right, environment);
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
        case '==': return left == right; // Intentional loose equality exercise.
        case '!=': return left != right;
        case '===': return left === right;
        case '!==': return left !== right;
        default: throw new Error(`Unknown operator ${ast.operator}`);
      }
    }
    default: throw new TypeError(`Unknown AST node ${ast.type}`);
  }
}

function runTests() {
  const env = { x: 3, square: n => n * n, max: Math.max };
  assert.equal(evaluate(parse('1 + 2 * 3'), env), 7);
  assert.equal(evaluate(parse('-2 ** 2'), env), -4);
  assert.equal(evaluate(parse('2 ** 3 ** 2'), env), 512);
  assert.equal(evaluate(parse('square(x + 1) + max(2, 9)'), env), 25);
  assert.equal(evaluate(parse('false && missing()'), env), false);
  assert.equal(evaluate(parse('true ? 10 : missing'), env), 10);
  assert.equal(evaluate(parse('0 || 7'), env), 7);
  assert.equal(evaluate(parse('"a\\nb"'), env), 'a\nb');
  assert.equal(evaluate(parse('1 < 2 && 3 >= 3'), env), true);
  let calls = 0;
  assert.equal(evaluate(parse('true || bump()'), { bump: () => ++calls }), true);
  assert.equal(calls, 0, 'logical OR must short-circuit');
  assert.throws(() => parse('1 + * 2'), SyntaxErrorAt);
  assert.throws(() => parse('(1 + 2'), /Expected \)/);
  assert.throws(() => evaluate(parse('unknown + 1')), /Unknown identifier/);
  assert.throws(() => evaluate(parse('1()')), /not callable/);
  console.log('Pratt expression interpreter: all tests passed');
}

if (require.main === module) runTests();
module.exports = { tokenize, parse, evaluate, SyntaxErrorAt };
