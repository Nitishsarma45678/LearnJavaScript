/**
 * Thompson NFA Regular-Expression Engine
 *
 * Supported syntax: literals, ., character classes/ranges, \d/\w/\s and
 * uppercase complements, grouping, alternation, *, +, ?, ^ and $.
 * Matching is over Unicode code points. Captures, lookaround, backreferences,
 * lazy quantifiers, and counted repetitions are intentionally out of scope.
 *
 * The simulator returns the earliest start and longest end at that start.
 * This keeps the engine deterministic without implementing capture priority.
 */

'use strict';

class RegexParser {
  constructor(pattern) {
    if (typeof pattern !== 'string') throw new TypeError('pattern must be a string');
    this.chars = Array.from(pattern);
    this.index = 0;
  }

  peek() { return this.chars[this.index]; }
  take() { return this.chars[this.index++]; }
  fail(message) { throw new SyntaxError(message + ' at pattern offset ' + this.index); }

  parse() {
    const ast = this.parseAlternation();
    if (this.index !== this.chars.length) this.fail('Unexpected token ' + this.peek());
    return ast;
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
    while (this.peek() !== undefined && this.peek() !== ')' && this.peek() !== '|') {
      parts.push(this.parseRepetition());
    }
    if (parts.length === 0) return { type: 'empty' };
    return parts.length === 1 ? parts[0] : { type: 'concat', parts };
  }

  parseRepetition() {
    const atom = this.parseAtom();
    const kind = this.peek();
    if (!['*', '+', '?'].includes(kind)) return atom;
    this.take();
    if (['*', '+', '?'].includes(this.peek())) this.fail('Nested quantifiers are not supported');
    return { type: 'repeat', kind, child: atom };
  }

  parseAtom() {
    const ch = this.take();
    if (ch === undefined) this.fail('Expected an atom');
    if (ch === '(') {
      const child = this.parseAlternation();
      if (this.take() !== ')') this.fail('Unclosed group');
      return child;
    }
    if (ch === '.') return { type: 'any' };
    if (ch === '^') return { type: 'start' };
    if (ch === '$') return { type: 'end' };
    if (ch === '[') return this.parseCharacterClass();
    if (ch === '\\') return this.parseEscape();
    if (ch === ')' || ch === '*' || ch === '+' || ch === '?') {
      this.fail('Unexpected metacharacter ' + ch);
    }
    return { type: 'literal', value: ch };
  }

  parseEscape() {
    const ch = this.take();
    if (ch === undefined) this.fail('Trailing escape');
    const lower = ch.toLowerCase();
    if (['d', 'w', 's'].includes(lower)) {
      return { type: 'class', ranges: [], sets: [lower], negate: ch !== lower };
    }
    const escaped = ({ n: '\\n', r: '\\r', t: '\\t' })[ch];
    return { type: 'literal', value: escaped || ch };
  }

  parseClassAtom() {
    if (this.peek() === '\\') {
      this.take();
      const ch = this.take();
      if (ch === undefined) this.fail('Trailing escape in character class');
      const lower = ch.toLowerCase();
      if (['d', 'w', 's'].includes(lower)) {
        if (ch !== lower) this.fail('Uppercase character-class escapes are not supported inside []');
        return { kind: 'set', value: lower };
      }
      const value = ({ n: '\\n', r: '\\r', t: '\\t' })[ch] || ch;
      return { kind: 'literal', value };
    }
    return { kind: 'literal', value: this.take() };
  }

  parseCharacterClass() {
    const negate = this.peek() === '^';
    if (negate) this.take();
    const ranges = [];
    const sets = [];
    let closed = false;

    while (this.peek() !== undefined) {
      if (this.peek() === ']' && (ranges.length || sets.length)) {
        this.take();
        closed = true;
        break;
      }
      const first = this.parseClassAtom();
      if (first.kind === 'literal' && this.peek() === '-' &&
          this.chars[this.index + 1] !== ']') {
        this.take();
        const last = this.parseClassAtom();
        if (last.kind !== 'literal') this.fail('Range endpoint must be a literal');
        const from = first.value.codePointAt(0);
        const to = last.value.codePointAt(0);
        if (from > to) this.fail('Character range is reversed');
        ranges.push([from, to]);
      } else if (first.kind === 'literal') {
        const point = first.value.codePointAt(0);
        ranges.push([point, point]);
      } else {
        sets.push(first.value);
      }
    }

    if (!closed) this.fail('Unclosed character class');
    return { type: 'class', ranges, sets, negate };
  }
}

function compileRegex(pattern) {
  const ast = new RegexParser(pattern).parse();
  const instructions = [];

  function emit(op, fields = {}) {
    const instruction = Object.assign({ id: instructions.length, op, out: null }, fields);
    instructions.push(instruction);
    return instruction;
  }

  function patch(outs, target) {
    for (const item of outs) item.inst[item.field || 'out'] = target;
  }

  function build(node) {
    if (node.type === 'empty') {
      const instruction = emit('jmp');
      return { start: instruction, outs: [{ inst: instruction }] };
    }
    if (node.type === 'literal') {
      const instruction = emit('char', { value: node.value });
      return { start: instruction, outs: [{ inst: instruction }] };
    }
    if (node.type === 'any' || node.type === 'class' || node.type === 'start' || node.type === 'end') {
      const instruction = emit(node.type, node.type === 'class'
        ? { ranges: node.ranges, sets: node.sets, negate: node.negate } : {});
      return { start: instruction, outs: [{ inst: instruction }] };
    }
    if (node.type === 'concat') {
      let fragment = build(node.parts[0]);
      for (let i = 1; i < node.parts.length; i += 1) {
        const next = build(node.parts[i]);
        patch(fragment.outs, next.start);
        fragment = { start: fragment.start, outs: next.outs };
      }
      return fragment;
    }
    if (node.type === 'alt') {
      let fragment = build(node.branches[0]);
      for (let i = 1; i < node.branches.length; i += 1) {
        const next = build(node.branches[i]);
        const split = emit('split', { out1: fragment.start, out2: next.start });
        fragment = { start: split, outs: [...fragment.outs, ...next.outs] };
      }
      return fragment;
    }
    if (node.type === 'repeat') {
      const child = build(node.child);
      if (node.kind === '*') {
        const split = emit('split', { out1: child.start, out2: null });
        patch(child.outs, split);
        return { start: split, outs: [{ inst: split, field: 'out2' }] };
      }
      if (node.kind === '+') {
        const split = emit('split', { out1: child.start, out2: null });
        patch(child.outs, split);
        return { start: child.start, outs: [{ inst: split, field: 'out2' }] };
      }
      const split = emit('split', { out1: child.start, out2: null });
      return { start: split, outs: [...child.outs, { inst: split, field: 'out2' }] };
    }
    throw new Error('Unknown AST node: ' + node.type);
  }

  const fragment = build(ast);
  const match = emit('match');
  patch(fragment.outs, match);

  function addState(list, instruction, position, inputLength, seen) {
    if (!instruction || seen.has(instruction.id)) return;
    seen.add(instruction.id);
    if (instruction.op === 'split') {
      addState(list, instruction.out1, position, inputLength, seen);
      addState(list, instruction.out2, position, inputLength, seen);
    } else if (instruction.op === 'jmp') {
      addState(list, instruction.out, position, inputLength, seen);
    } else if (instruction.op === 'start') {
      if (position === 0) addState(list, instruction.out, position, inputLength, seen);
    } else if (instruction.op === 'end') {
      if (position === inputLength) addState(list, instruction.out, position, inputLength, seen);
    } else {
      list.push(instruction);
    }
  }

  function classMatches(instruction, character) {
    const point = character.codePointAt(0);
    let matched = instruction.ranges.some(([from, to]) => point >= from && point <= to);
    if (!matched && instruction.sets.includes('d')) matched = point >= 48 && point <= 57;
    if (!matched && instruction.sets.includes('w')) {
      matched = (point >= 48 && point <= 57) || (point >= 65 && point <= 90) ||
        (point >= 97 && point <= 122) || point === 95;
    }
    if (!matched && instruction.sets.includes('s')) matched = /\\s/u.test(character);
    return instruction.negate ? !matched : matched;
  }

  function accepts(instruction, character) {
    if (instruction.op === 'char') return instruction.value === character;
    if (instruction.op === 'any') return !/[\\n\\r\\u2028\\u2029]/u.test(character);
    if (instruction.op === 'class') return classMatches(instruction, character);
    return false;
  }

  function matchAt(input, start) {
    let current = [];
    addState(current, fragment.start, start, input.length, new Set());
    let bestEnd = null;

    for (let position = start; ; position += 1) {
      if (current.some(instruction => instruction.op === 'match')) bestEnd = position;
      if (position >= input.length || current.length === 0) break;

      const next = [];
      const seen = new Set();
      for (const instruction of current) {
        if (accepts(instruction, input[position])) {
          addState(next, instruction.out, position + 1, input.length, seen);
        }
      }
      current = next;
    }
    return bestEnd === null ? null : bestEnd;
  }

  function exec(input, fromIndex = 0) {
    if (typeof input !== 'string') throw new TypeError('input must be a string');
    const chars = Array.from(input);
    if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex > chars.length) {
      throw new RangeError('fromIndex is outside the input');
    }
    for (let start = fromIndex; start <= chars.length; start += 1) {
      const end = matchAt(chars, start);
      if (end !== null) {
        return { match: chars.slice(start, end).join(''), index: start, end, input };
      }
    }
    return null;
  }

  function findAll(input) {
    const chars = Array.from(input);
    const matches = [];
    let cursor = 0;
    while (cursor <= chars.length) {
      const found = exec(input, cursor);
      if (!found) break;
      matches.push(found);
      cursor = found.end > found.index ? found.end : found.index + 1;
    }
    return matches;
  }

  return Object.freeze({
    pattern,
    instructionCount: instructions.length,
    exec,
    test: input => exec(input) !== null,
    findAll
  });
}

function runTests() {
  const assert = require('node:assert/strict');
  const grouped = compileRegex('a(b|c)*d');
  assert.equal(grouped.exec('xxabcbcdyy').match, 'abcbcd');
  assert.equal(grouped.exec('xxadyy').match, 'ad');

  const anchored = compileRegex('^hello$');
  assert.equal(anchored.test('hello'), true);
  assert.equal(anchored.test('say hello'), false);

  assert.equal(compileRegex('[a-z]+').exec('123abc!').match, 'abc');
  assert.equal(compileRegex('colou?r').test('color'), true);
  assert.equal(compileRegex('colou?r').test('colour'), true);
  assert.equal(compileRegex('\\d+').exec('id=482;').match, '482');
  assert.equal(compileRegex('\\D+').exec('123abc').match, 'abc');
  assert.equal(compileRegex('🙂+').exec('x🙂🙂y').match, '🙂🙂');
  assert.equal(compileRegex('a*').findAll('bbb').length, 4);
  assert.throws(() => compileRegex('('), SyntaxError);
  assert.throws(() => compileRegex('[abc'), SyntaxError);
  assert.throws(() => compileRegex('a**'), SyntaxError);
  console.log('Thompson NFA regex tests passed');
}

if (require.main === module) runTests();

module.exports = { compileRegex };
