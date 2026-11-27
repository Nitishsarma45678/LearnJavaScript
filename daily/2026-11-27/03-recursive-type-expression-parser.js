'use strict';

// Exercise: parse a small type-expression language.
// union := intersection ('|' intersection)*
// intersection := postfix ('&' postfix)*
// postfix := primary ('[]')*
// primary := IDENT | IDENT '<' args '>' | '(' union ')'

function tokenize(source) {
  const tokens = [];
  const pattern = /\s*([A-Za-z_$][\w$]*|\[\]|[<>,|&()])/gy;
  let index = 0;
  while (index < source.length) {
    pattern.lastIndex = index;
    const match = pattern.exec(source);
    if (!match) {
      if (/^\s*$/.test(source.slice(index))) break;
      throw new SyntaxError('Unexpected token at offset ' + index);
    }
    tokens.push(match[1]);
    index = pattern.lastIndex;
  }
  return tokens;
}

function parseType(source) {
  const tokens = tokenize(source);
  let cursor = 0;
  const peek = () => tokens[cursor];
  const take = expected => {
    const actual = tokens[cursor];
    if (actual !== expected) throw new SyntaxError('Expected ' + expected + ', got ' + actual);
    cursor += 1;
  };

  function parseUnion() {
    const types = [parseIntersection()];
    while (peek() === '|') {
      take('|');
      types.push(parseIntersection());
    }
    return types.length === 1 ? types[0] : { kind: 'union', types };
  }

  function parseIntersection() {
    const types = [parsePostfix()];
    while (peek() === '&') {
      take('&');
      types.push(parsePostfix());
    }
    return types.length === 1 ? types[0] : { kind: 'intersection', types };
  }

  function parsePostfix() {
    let node = parsePrimary();
    while (peek() === '[]') {
      take('[]');
      node = { kind: 'array', element: node };
    }
    return node;
  }

  function parsePrimary() {
    if (peek() === '(') {
      take('(');
      const node = parseUnion();
      take(')');
      return node;
    }
    const name = peek();
    if (!name || !/^[A-Za-z_$][\w$]*$/.test(name)) {
      throw new SyntaxError('Expected type name at token ' + cursor);
    }
    cursor += 1;
    if (peek() !== '<') return { kind: 'name', name };
    take('<');
    const args = [parseUnion()];
    while (peek() === ',') {
      take(',');
      args.push(parseUnion());
    }
    take('>');
    return { kind: 'generic', name, args };
  }

  const ast = parseUnion();
  if (cursor !== tokens.length) throw new SyntaxError('Unexpected trailing token: ' + peek());
  return ast;
}

const assert = require('node:assert/strict');
assert.deepEqual(parseType('number | string[]'), {
  kind: 'union',
  types: [
    { kind: 'name', name: 'number' },
    { kind: 'array', element: { kind: 'name', name: 'string' } }
  ]
});
assert.equal(parseType('Map<string, Array<number | null>>').name, 'Map');
assert.equal(parseType('(A | B) & C').kind, 'intersection');
assert.throws(() => parseType('Map<string,'), SyntaxError);
assert.throws(() => parseType('A B'), /trailing token/);
assert.equal(parseType('  boolean  ').name, 'boolean');
console.log('Type expression parser tests passed');

module.exports = { tokenize, parseType };
