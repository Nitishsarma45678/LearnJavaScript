'use strict';

/**
 * Exercise: build a regular-expression matcher with Thompson NFA simulation.
 *
 * Supported syntax: literals, ., grouping, alternation, *, +, ?, character
 * classes/ranges, negated classes, and \d \w \s (plus uppercase negations).
 * Matching is against the complete input; no eval, Function, or native RegExp.
 *
 * Run: node 17-thompson-regex-engine.js
 */

const assert = require('node:assert/strict');

function escapeTest(ch) {
  if (ch === 'd') return c => c >= '0' && c <= '9';
  if (ch === 'w') return c => /[A-Za-z0-9_]/.test(c);
  if (ch === 's') return c => /\s/.test(c);
  if (ch === 'D') return c => !(c >= '0' && c <= '9');
  if (ch === 'W') return c => !/[A-Za-z0-9_]/.test(c);
  if (ch === 'S') return c => !/\s/.test(c);
  return null;
}

class PatternParser {
  constructor(pattern) {
    this.source = Array.from(pattern);
    this.index = 0;
  }

  peek() { return this.source[this.index]; }
  take() { return this.source[this.index++]; }
  fail(message) { throw new SyntaxError(message + ' at pattern offset ' + this.index); }

  parse() {
    const node = this.parseAlternation();
    if (this.index !== this.source.length) this.fail('unexpected token');
    return node;
  }

  parseAlternation() {
    const branches = [this.parseConcatenation()];
    while (this.peek() === '|') {
      this.take();
      branches.push(this.parseConcatenation());
    }
    return branches.length === 1 ? branches[0] : { type: 'alt', branches };
  }

  parseConcatenation() {
    const parts = [];
    while (this.index < this.source.length && this.peek() !== ')' && this.peek() !== '|') {
      parts.push(this.parseRepetition());
    }
    if (parts.length === 0) return { type: 'empty' };
    return parts.length === 1 ? parts[0] : { type: 'concat', parts };
  }

  parseRepetition() {
    const atom = this.parseAtom();
    const token = this.peek();
    if (token === '*' || token === '+' || token === '?') {
      this.take();
      if (this.peek() === '*' || this.peek() === '+' || this.peek() === '?') {
        this.fail('stacked quantifiers are not supported');
      }
      return { type: token, child: atom };
    }
    return atom;
  }

  parseAtom() {
    const token = this.take();
    if (token === undefined) this.fail('expected an atom');
    if (token === '(') {
      const child = this.parseAlternation();
      if (this.take() !== ')') this.fail('missing closing parenthesis');
      return child;
    }
    if (token === ')') this.fail('unmatched closing parenthesis');
    if (token === '*' || token === '+' || token === '?') this.fail('quantifier has no operand');
    if (token === '.') return { type: 'class', test: () => true };
    if (token === '[') return this.parseCharacterClass();
    if (token === '\\') {
      const escaped = this.take();
      if (escaped === undefined) this.fail('trailing escape');
      const predicate = escapeTest(escaped);
      return predicate
        ? { type: 'class', test: predicate }
        : { type: 'literal', value: escaped };
    }
    return { type: 'literal', value: token };
  }

  readClassToken() {
    const token = this.take();
    if (token === undefined) this.fail('unterminated character class');
    if (token !== '\\') return { value: token, test: ch => ch === token };
    const escaped = this.take();
    if (escaped === undefined) this.fail('trailing escape in character class');
    const predicate = escapeTest(escaped);
    return predicate
      ? { value: null, test: predicate }
      : { value: escaped, test: ch => ch === escaped };
  }

  parseCharacterClass() {
    const negate = this.peek() === '^';
    if (negate) this.take();
    const tests = [];
    let count = 0;

    while (this.index < this.source.length && this.peek() !== ']') {
      const left = this.readClassToken();
      if (left.value !== null && this.peek() === '-' &&
          this.source[this.index + 1] !== ']') {
        this.take();
        const right = this.readClassToken();
        if (right.value === null) this.fail('range endpoint must be a literal');
        const a = left.value.codePointAt(0);
        const b = right.value.codePointAt(0);
        if (a > b) this.fail('descending character range');
        tests.push(ch => {
          const code = ch.codePointAt(0);
          return code >= a && code <= b;
        });
      } else {
        tests.push(left.test);
      }
      count++;
    }

    if (this.take() !== ']') this.fail('unterminated character class');
    if (count === 0) this.fail('empty character class');
    return {
      type: 'class',
      test: ch => negate ? !tests.some(test => test(ch)) : tests.some(test => test(ch))
    };
  }
}

class ThompsonNFA {
  constructor(pattern) {
    const ast = new PatternParser(pattern).parse();
    this.states = [];
    const fragment = this._compile(ast);
    this.start = fragment.start;
    this.accept = fragment.end;
  }

  _state() {
    const state = { id: this.states.length, eps: [], edges: [] };
    this.states.push(state);
    return state;
  }

  _compile(node) {
    if (node.type === 'empty') {
      const start = this._state(), end = this._state();
      start.eps.push(end);
      return { start, end };
    }

    if (node.type === 'literal' || node.type === 'class') {
      const start = this._state(), end = this._state();
      const test = node.type === 'literal'
        ? ch => ch === node.value
        : node.test;
      start.edges.push({ test, to: end });
      return { start, end };
    }

    if (node.type === 'concat') {
      const fragments = node.parts.map(part => this._compile(part));
      for (let i = 1; i < fragments.length; i++) {
        fragments[i - 1].end.eps.push(fragments[i].start);
      }
      return { start: fragments[0].start, end: fragments[fragments.length - 1].end };
    }

    if (node.type === 'alt') {
      const start = this._state(), end = this._state();
      for (const branch of node.branches) {
        const fragment = this._compile(branch);
        start.eps.push(fragment.start);
        fragment.end.eps.push(end);
      }
      return { start, end };
    }

    const child = this._compile(node.child);
    const start = this._state(), end = this._state();
    if (node.type === '*') {
      start.eps.push(end, child.start);
      child.end.eps.push(child.start, end);
    } else if (node.type === '+') {
      start.eps.push(child.start);
      child.end.eps.push(child.start, end);
    } else if (node.type === '?') {
      start.eps.push(end, child.start);
      child.end.eps.push(end);
    } else {
      throw new Error('unknown AST node: ' + node.type);
    }
    return { start, end };
  }

  _closure(initial) {
    const result = new Set(initial);
    const stack = [...initial];
    while (stack.length) {
      const state = stack.pop();
      for (const next of state.eps) {
        if (!result.has(next)) {
          result.add(next);
          stack.push(next);
        }
      }
    }
    return result;
  }

  test(input) {
    const chars = Array.from(String(input));
    let active = this._closure([this.start]);
    for (const ch of chars) {
      const next = [];
      for (const state of active) {
        for (const edge of state.edges) {
          if (edge.test(ch)) next.push(edge.to);
        }
      }
      active = this._closure(next);
      if (active.size === 0) return false;
    }
    return active.has(this.accept);
  }
}

function runTests() {
  const check = (pattern, input, expected) =>
    assert.equal(new ThompsonNFA(pattern).test(input), expected, pattern + ' / ' + input);

  check('a(b|c)*d', 'abcbcd', true);
  check('a(b|c)*d', 'ad', true);
  check('a(b|c)*d', 'abx d', false);
  check('[a-z]+', 'hello', true);
  check('[a-z]+', 'Hello', false);
  check('[^0-9]?', '', true);
  check('[^0-9]?', 'x', true);
  check('[^0-9]?', '7', false);
  check('\\d{2}', '42{2}', false);
  check('\\d+', '120045', true);
  check('\\D+', 'abc!', true);
  check('colou?r', 'color', true);
  check('colou?r', 'colour', true);
  check('a.*z', 'a🙂middlez', true);
  check('a|bc', 'bc', true);
  check('a|bc', 'b', false);
  check('', '', true);
  check('', 'x', false);
  check('(ab)+c?', 'ababc', true);
  check('\\.', '.', true);
  check('[A-Cx-z]', 'y', true);
  assert.throws(() => new ThompsonNFA('a**'), SyntaxError);
  assert.throws(() => new ThompsonNFA('(abc'), SyntaxError);
  assert.throws(() => new ThompsonNFA('[z-a]'), SyntaxError);
}

runTests();
module.exports = { ThompsonNFA };
