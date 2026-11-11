'use strict';

/**
 * Exercise: compile a useful regular-expression subset into a Thompson NFA.
 *
 * Supported syntax: literals, escapes (\d \w \s and their uppercase
 * complements), character classes and ranges, ., groups, alternation,
 * concatenation, *, +, ?, and absolute ^ / $ assertions. Capturing groups,
 * backreferences, and look-around are intentionally excluded.
 *
 * test() performs a full-string match. search() returns the leftmost-longest
 * match; findAll() returns non-overlapping matches and safely advances after
 * zero-width results. The engine simulates state sets instead of backtracking.
 *
 * Run: node daily/2026-11-11/thompsonNfaRegex.js
 */

const assert = require('node:assert/strict');

function escapePredicate(character) {
  switch (character) {
    case 'd': return codePoint => codePoint >= 48 && codePoint <= 57;
    case 'D': return codePoint => !(codePoint >= 48 && codePoint <= 57);
    case 'w': return codePoint =>
      (codePoint >= 48 && codePoint <= 57) ||
      (codePoint >= 65 && codePoint <= 90) ||
      (codePoint >= 97 && codePoint <= 122) ||
      codePoint === 95;
    case 'W': return codePoint => !escapePredicate('w')(codePoint);
    case 's': return codePoint => /\s/u.test(String.fromCodePoint(codePoint));
    case 'S': return codePoint => !/\s/u.test(String.fromCodePoint(codePoint));
    default: return null;
  }
}

function escapedLiteral(character) {
  switch (character) {
    case 'n': return '\n';
    case 'r': return '\r';
    case 't': return '\t';
    case 'f': return '\f';
    case 'v': return '\v';
    case 'b': return '\b';
    default: return character;
  }
}

function parsePattern(pattern) {
  if (typeof pattern !== 'string') throw new TypeError('pattern must be a string');
  const characters = Array.from(pattern);
  let index = 0;

  const peek = () => characters[index];

  function parseEscape() {
    if (index >= characters.length) throw new Error('trailing escape');
    const escaped = characters[index++];
    const predicate = escapePredicate(escaped);
    return predicate
      ? { test: predicate }
      : { literal: escapedLiteral(escaped) };
  }

  function parseClassAtom() {
    if (peek() === '\\') {
      index += 1;
      return parseEscape();
    }
    if (index >= characters.length) throw new Error('unterminated character class');
    return { literal: characters[index++] };
  }

  function parseCharacterClass() {
    let negate = false;
    if (peek() === '^') {
      negate = true;
      index += 1;
    }

    const predicates = [];
    while (index < characters.length && peek() !== ']') {
      const first = parseClassAtom();
      if (first.literal !== undefined && peek() === '-' &&
          characters[index + 1] !== ']') {
        index += 1;
        const last = parseClassAtom();
        if (last.literal === undefined) throw new Error('range endpoint must be a literal');
        const startCode = first.literal.codePointAt(0);
        const endCode = last.literal.codePointAt(0);
        if (startCode > endCode) throw new Error('character range is descending');
        predicates.push(codePoint => codePoint >= startCode && codePoint <= endCode);
      } else if (first.literal !== undefined) {
        const expected = first.literal.codePointAt(0);
        predicates.push(codePoint => codePoint === expected);
      } else {
        predicates.push(first.test);
      }
    }

    if (peek() !== ']') throw new Error('unterminated character class');
    index += 1;
    if (predicates.length === 0) throw new Error('empty character classes are unsupported');

    return {
      type: 'character',
      test(codePoint) {
        const matched = predicates.some(predicate => predicate(codePoint));
        return negate ? !matched : matched;
      }
    };
  }

  function parseAtom() {
    if (index >= characters.length) throw new Error('expected an atom');
    const character = characters[index++];

    if (character === '(') {
      const inner = parseAlternation();
      if (peek() !== ')') throw new Error('unclosed group');
      index += 1;
      return inner;
    }
    if (character === '[') {
      return parseCharacterClass();
    }
    if (character === '.') {
      return { type: 'character', test: codePoint => codePoint !== 10 && codePoint !== 13 };
    }
    if (character === '^') return { type: 'assertStart' };
    if (character === '$') return { type: 'assertEnd' };
    if (character === '\\') {
      const escaped = parseEscape();
      if (escaped.literal !== undefined) {
        const expected = escaped.literal.codePointAt(0);
        return { type: 'character', test: codePoint => codePoint === expected };
      }
      return { type: 'character', test: escaped.test };
    }
    if ('*+?)|]'.includes(character)) {
      throw new Error('unexpected metacharacter: ' + character);
    }

    const expected = character.codePointAt(0);
    return { type: 'character', test: codePoint => codePoint === expected };
  }

  function parseRepetition() {
    let atom = parseAtom();
    const quantifier = peek();
    if (quantifier === '*' || quantifier === '+' || quantifier === '?') {
      if (atom.type === 'assertStart' || atom.type === 'assertEnd') {
        throw new Error('anchors cannot be quantified');
      }
      index += 1;
      atom = { type: quantifier === '*' ? 'star' : quantifier === '+' ? 'plus' : 'optional', child: atom };
      if (peek() === '*' || peek() === '+' || peek() === '?') {
        throw new Error('stacked quantifiers are unsupported');
      }
    }
    return atom;
  }

  function parseSequence() {
    const parts = [];
    while (index < characters.length && peek() !== ')' && peek() !== '|') {
      parts.push(parseRepetition());
    }
    if (parts.length === 0) return { type: 'empty' };
    return parts.length === 1 ? parts[0] : { type: 'concat', parts };
  }

  function parseAlternation() {
    const alternatives = [parseSequence()];
    while (peek() === '|') {
      index += 1;
      alternatives.push(parseSequence());
    }
    return alternatives.length === 1
      ? alternatives[0]
      : { type: 'alternate', alternatives };
  }

  const ast = parseAlternation();
  if (index !== characters.length) throw new Error('unexpected closing parenthesis or token');
  return ast;
}

class ThompsonRegex {
  constructor(pattern) {
    this.pattern = pattern;
    this.states = [];
    const fragment = this._compile(parsePattern(pattern));
    this.start = fragment.start;
    this.accept = fragment.end;
  }

  _state() {
    const state = { epsilon: [], assertions: [], edges: [] };
    this.states.push(state);
    return state;
  }

  _compile(node) {
    if (node.type === 'empty') {
      const start = this._state();
      const end = this._state();
      start.epsilon.push(end);
      return { start, end };
    }

    if (node.type === 'character') {
      const start = this._state();
      const end = this._state();
      start.edges.push({ test: node.test, to: end });
      return { start, end };
    }

    if (node.type === 'assertStart' || node.type === 'assertEnd') {
      const start = this._state();
      const end = this._state();
      start.assertions.push({ type: node.type, to: end });
      return { start, end };
    }

    if (node.type === 'concat') {
      const fragments = node.parts.map(part => this._compile(part));
      for (let index = 1; index < fragments.length; index += 1) {
        fragments[index - 1].end.epsilon.push(fragments[index].start);
      }
      return { start: fragments[0].start, end: fragments[fragments.length - 1].end };
    }

    if (node.type === 'alternate') {
      const start = this._state();
      const end = this._state();
      for (const alternative of node.alternatives) {
        const fragment = this._compile(alternative);
        start.epsilon.push(fragment.start);
        fragment.end.epsilon.push(end);
      }
      return { start, end };
    }

    const start = this._state();
    const end = this._state();
    const child = this._compile(node.child);

    if (node.type === 'star' || node.type === 'optional') {
      start.epsilon.push(end);
    }
    start.epsilon.push(child.start);
    child.end.epsilon.push(end);
    if (node.type === 'star' || node.type === 'plus') {
      child.end.epsilon.push(child.start);
    }
    return { start, end };
  }

  _closure(seedStates, position, inputLength) {
    const result = new Set();
    const stack = seedStates.slice();

    while (stack.length > 0) {
      const state = stack.pop();
      if (result.has(state)) continue;
      result.add(state);

      for (const next of state.epsilon) stack.push(next);
      for (const assertion of state.assertions) {
        if (assertion.type === 'assertStart' && position === 0) stack.push(assertion.to);
        if (assertion.type === 'assertEnd' && position === inputLength) stack.push(assertion.to);
      }
    }
    return result;
  }

  _longestMatchAt(input, start) {
    let states = this._closure([this.start], start, input.length);
    let position = start;
    let bestEnd = states.has(this.accept) ? start : null;

    while (position < input.length && states.size > 0) {
      const nextStates = [];
      const codePoint = input[position];
      for (const state of states) {
        for (const edge of state.edges) {
          if (edge.test(codePoint)) nextStates.push(edge.to);
        }
      }
      if (nextStates.length === 0) break;

      position += 1;
      states = this._closure(nextStates, position, input.length);
      if (states.has(this.accept)) bestEnd = position;
    }
    return bestEnd;
  }

  _searchFrom(input, fromIndex) {
    for (let start = fromIndex; start <= input.length; start += 1) {
      const end = this._longestMatchAt(input, start);
      if (end !== null) {
        return { start, end, text: input.slice(start, end).join('') };
      }
    }
    return null;
  }

  test(input) {
    if (typeof input !== 'string') throw new TypeError('input must be a string');
    const points = Array.from(input);
    return this._longestMatchAt(points, 0) === points.length;
  }

  search(input, fromIndex = 0) {
    if (typeof input !== 'string') throw new TypeError('input must be a string');
    const points = Array.from(input);
    if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex > points.length) {
      throw new RangeError('fromIndex is outside the input');
    }
    return this._searchFrom(points, fromIndex);
  }

  findAll(input) {
    if (typeof input !== 'string') throw new TypeError('input must be a string');
    const points = Array.from(input);
    const matches = [];
    let cursor = 0;

    while (cursor <= points.length) {
      const match = this._searchFrom(points, cursor);
      if (!match) break;
      matches.push(match);

      if (match.end === match.start) {
        if (match.start === points.length) break;
        cursor = match.start + 1;
      } else {
        cursor = match.end;
      }
    }
    return matches;
  }
}

function compileRegex(pattern) {
  return new ThompsonRegex(pattern);
}

function runTests() {
  assert.equal(compileRegex('a(b|c)+d').test('abbd'), true);
  assert.equal(compileRegex('a(b|c)+d').test('ad'), false);
  assert.equal(compileRegex('^ab$').test('ab'), true);
  assert.equal(compileRegex('^ab$').test('zab'), false);
  assert.equal(compileRegex('colou?r').test('color'), true);
  assert.equal(compileRegex('colou?r').test('colour'), true);
  assert.equal(compileRegex('a.*b').test('axxxb'), true);
  assert.equal(compileRegex('^$').test(''), true);
  assert.equal(compileRegex('\\d+').test('12345'), true);
  assert.equal(compileRegex('\\d+').test('12x'), false);
  assert.equal(compileRegex('[^0-9]+').test('abc!'), true);
  assert.equal(compileRegex('🧠+').test('🧠🧠'), true);

  assert.deepEqual(compileRegex('a+').search('xxaaay'), {
    start: 2,
    end: 5,
    text: 'aaa'
  });
  assert.deepEqual(compileRegex('[a-c]+').findAll('abxcca'), [
    { start: 0, end: 2, text: 'ab' },
    { start: 3, end: 5, text: 'cc' },
    { start: 5, end: 6, text: 'a' }
  ]);
  assert.equal(compileRegex('a*').findAll('b').length, 2);
  assert.throws(() => compileRegex('(abc'), /unclosed group/);
  assert.throws(() => compileRegex('a**'), /stacked quantifiers/);
  assert.throws(() => compileRegex('[z-a]'), /descending/);
  assert.throws(() => compileRegex('\\'), /trailing escape/);
  assert.throws(() => compileRegex('^*'), /anchors cannot be quantified/);
  assert.throws(() => compileRegex('a').search('a', 2), /fromIndex/);

  return { checks: 21, nfaStatesForSample: compileRegex('(ab|cd)*e').states.length };
}

if (require.main === module) {
  console.log('Thompson NFA regex engine:', runTests());
}

module.exports = { ThompsonRegex, compileRegex, parsePattern, runTests };
