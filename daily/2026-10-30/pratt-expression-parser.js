'use strict';

/**
 * A small expression engine built with a Pratt parser.
 * Supports decimal/scientific numbers, variables, unary +/- and + - * / % ^,
 * parentheses, and function calls such as max(2, sqrt(9)). Exponentiation is
 * right-associative and binds more tightly than unary minus: -2^2 === -4.
 */
function evaluateExpression(source, variables = {}, customFunctions = {}) {
  if (typeof source !== 'string') throw new TypeError('source must be a string');
  if (variables === null || typeof variables !== 'object' || Array.isArray(variables)) {
    throw new TypeError('variables must be an object');
  }
  if (customFunctions === null || typeof customFunctions !== 'object' || Array.isArray(customFunctions)) {
    throw new TypeError('customFunctions must be an object');
  }

  const builtins = {
    abs: Math.abs,
    ceil: Math.ceil,
    floor: Math.floor,
    max: Math.max,
    min: Math.min,
    round: Math.round,
    sqrt: Math.sqrt,
    pow: Math.pow
  };
  const functions = { ...builtins, ...customFunctions };
  for (const [name, fn] of Object.entries(functions)) {
    if (typeof fn !== 'function') throw new TypeError(`function ${name} is not callable`);
  }

  const tokens = tokenize(source);
  let position = 0;
  const peek = () => tokens[position];
  const consume = () => tokens[position++];
  const expect = value => {
    const token = consume();
    if (token.value !== value) throw new SyntaxError(`expected '${value}' at position ${token.start}`);
    return token;
  };

  function parseExpression(minBindingPower = 0) {
    let token = consume();
    let left;
    if (token.type === 'number') {
      left = token.value;
    } else if (token.type === 'identifier') {
      if (peek().value === '(') {
        consume();
        const args = [];
        if (peek().value !== ')') {
          while (true) {
            args.push(parseExpression(0));
            if (peek().value !== ',') break;
            consume();
          }
        }
        expect(')');
        if (!Object.hasOwn(functions, token.value)) {
          throw new ReferenceError(`unknown function '${token.value}'`);
        }
        left = functions[token.value](...args);
      } else {
        if (!Object.hasOwn(variables, token.value)) {
          throw new ReferenceError(`unknown variable '${token.value}'`);
        }
        const value = variables[token.value];
        if (typeof value !== 'number') throw new TypeError(`variable '${token.value}' must be numeric`);
        left = value;
      }
    } else if (token.value === '+' || token.value === '-') {
      left = parseExpression(25);
      if (token.value === '-') left = -left;
    } else if (token.value === '(') {
      left = parseExpression(0);
      expect(')');
    } else {
      throw new SyntaxError(`unexpected token '${token.value}' at position ${token.start}`);
    }

    while (true) {
      const operator = peek();
      const binding = {
        '+': [10, 11], '-': [10, 11],
        '*': [20, 21], '/': [20, 21], '%': [20, 21],
        '^': [30, 30]
      }[operator.value];
      if (!binding || binding[0] < minBindingPower) break;
      consume();
      const right = parseExpression(binding[1]);
      switch (operator.value) {
        case '+': left += right; break;
        case '-': left -= right; break;
        case '*': left *= right; break;
        case '/': left /= right; break;
        case '%': left %= right; break;
        case '^': left **= right; break;
      }
    }
    return left;
  }

  const result = parseExpression(0);
  if (peek().type !== 'eof') {
    throw new SyntaxError(`unexpected token '${peek().value}' at position ${peek().start}`);
  }
  return result;
}

function tokenize(source) {
  const tokens = [];
  let index = 0;
  const numberPattern = /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/y;
  const identifierPattern = /[A-Za-z_][A-Za-z0-9_]*/y;
  while (index < source.length) {
    if (/\s/.test(source[index])) { index += 1; continue; }
    numberPattern.lastIndex = index;
    let match = numberPattern.exec(source);
    if (match) {
      tokens.push({ type: 'number', value: Number(match[0]), start: index });
      index = numberPattern.lastIndex;
      continue;
    }
    identifierPattern.lastIndex = index;
    match = identifierPattern.exec(source);
    if (match) {
      tokens.push({ type: 'identifier', value: match[0], start: index });
      index = identifierPattern.lastIndex;
      continue;
    }
    const char = source[index];
    if ('+-*/%^(),'.includes(char)) {
      tokens.push({ type: 'operator', value: char, start: index });
      index += 1;
      continue;
    }
    throw new SyntaxError(`invalid character '${char}' at position ${index}`);
  }
  tokens.push({ type: 'eof', value: '<eof>', start: source.length });
  return tokens;
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
  assert.equal(evaluateExpression('1 + 2 * 3'), 7);
  assert.equal(evaluateExpression('(1 + 2) * 3'), 9);
  assert.equal(evaluateExpression('2^3^2'), 512);
  assert.equal(evaluateExpression('-2^2'), -4);
  assert.equal(evaluateExpression('2^-2'), 0.25);
  assert.equal(evaluateExpression('max(4, sqrt(81), abs(-12))'), 12);
  assert.equal(evaluateExpression('rate * hours + bonus', { rate: 12.5, hours: 8, bonus: 10 }), 110);
  closeTo(evaluateExpression('1e-3 + .25'), 0.251);
  assert.equal(evaluateExpression('double(21)', {}, { double: value => value * 2 }), 42);
  assert.throws(() => evaluateExpression('missing + 1'), /unknown variable/);
  assert.throws(() => evaluateExpression('unknown(1)'), /unknown function/);
  assert.throws(() => evaluateExpression('2 + (3 * 4'), /expected '\)'/);
  assert.throws(() => evaluateExpression('2 @ 3'), /invalid character/);
  assert.throws(() => evaluateExpression('1 2'), /unexpected token/);
  console.log('Pratt expression parser tests passed');
}

module.exports = { evaluateExpression };
