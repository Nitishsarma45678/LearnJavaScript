'use strict';

// Thompson-NFA regex compiler. Supports literals, dot, character classes,
// escapes (\d/\w/\s and negations), groups, alternation, concatenation and
// *, +, ?. Full-string matching is O(states * input length), with no
// backtracking explosion. Captures/lookarounds/backreferences are omitted.
class RegexSyntaxError extends SyntaxError {
  constructor(message, position) { super(message + ' at ' + position); this.name = 'RegexSyntaxError'; this.position = position; }
}
const shorthand = {
  d: c => c >= '0' && c <= '9',
  w: c => /[A-Za-z0-9_]/.test(c),
  s: c => /\s/u.test(c)
};
function escaped(chars, pos, inClass = false) {
  if (pos >= chars.length) throw new RegexSyntaxError('dangling escape', pos);
  const c = chars[pos], control = { n: '\n', r: '\r', t: '\t', f: '\f', v: '\v' };
  if (Object.prototype.hasOwnProperty.call(control, c)) return { next: pos + 1, literal: control[c] };
  if (shorthand[c]) return { next: pos + 1, test: shorthand[c] };
  if (c !== c.toLowerCase() && shorthand[c.toLowerCase()]) {
    const base = shorthand[c.toLowerCase()]; return { next: pos + 1, test: x => !base(x) };
  }
  if (/[A-Za-z]/.test(c) && !inClass) throw new RegexSyntaxError('unknown escape: ' + c, pos - 1);
  return { next: pos + 1, literal: c };
}
class Parser {
  constructor(pattern) { if (typeof pattern !== 'string') throw new TypeError('pattern must be a string'); this.a = Array.from(pattern); this.i = 0; }
  peek() { return this.a[this.i]; }
  take() { return this.a[this.i++]; }
  fail(message) { throw new RegexSyntaxError(message, this.i); }
  parse() { const node = this.alt(); if (this.i !== this.a.length) this.fail('unexpected token ' + this.peek()); return node; }
  alt() {
    const list = [this.concat()];
    while (this.peek() === '|') { this.take(); list.push(this.concat()); }
    return list.length === 1 ? list[0] : { type: 'alt', list };
  }
  concat() {
    const list = [];
    while (this.i < this.a.length && this.peek() !== ')' && this.peek() !== '|') list.push(this.repeat());
    return list.length === 0 ? { type: 'empty' } : list.length === 1 ? list[0] : { type: 'concat', list };
  }
  repeat() {
    const node = this.atom(), q = this.peek();
    if (q === '*' || q === '+' || q === '?') {
      this.take();
      if (this.peek() === '*' || this.peek() === '+' || this.peek() === '?') this.fail('stacked quantifiers');
      return { type: 'repeat', q, node };
    }
    return node;
  }
  atom() {
    const c = this.take();
    if (c === undefined) this.fail('expected atom');
    if (c === '(') { const n = this.alt(); if (this.take() !== ')') this.fail('unclosed group'); return n; }
    if (c === ')') this.fail('unmatched )');
    if (c === '*' || c === '+' || c === '?') this.fail('quantifier without atom');
    if (c === '.') return { type: 'test', fn: x => x !== '\n' && x !== '\r' };
    if (c === '[') return this.charClass();
    if (c === '\\') {
      const e = escaped(this.a, this.i); this.i = e.next;
      return e.test ? { type: 'test', fn: e.test } : { type: 'literal', value: e.literal };
    }
    return { type: 'literal', value: c };
  }
  classUnit() {
    const c = this.take();
    if (c === '\\') { const e = escaped(this.a, this.i, true); this.i = e.next; return e; }
    return { literal: c };
  }
  charClass() {
    const negate = this.peek() === '^'; if (negate) this.take();
    const tests = []; let first = true, closed = false;
    while (this.i < this.a.length) {
      if (this.peek() === ']' && !first) { this.take(); closed = true; break; }
      first = false;
      const left = this.classUnit();
      if (left.literal !== undefined && this.peek() === '-' && this.a[this.i + 1] !== ']' && this.i + 1 < this.a.length) {
        this.take(); const right = this.classUnit();
        if (right.literal === undefined) this.fail('range endpoint must be literal');
        const lo = left.literal.codePointAt(0), hi = right.literal.codePointAt(0);
        if (lo > hi) this.fail('reversed character range');
        tests.push(x => x.codePointAt(0) >= lo && x.codePointAt(0) <= hi);
      } else if (left.test) tests.push(left.test);
      else tests.push(x => x === left.literal);
    }
    if (!closed) this.fail('unclosed character class');
    if (!tests.length) this.fail('empty character class');
    return { type: 'test', fn: x => negate ? !tests.some(f => f(x)) : tests.some(f => f(x)) };
  }
}
function compileRegex(pattern, { maxStates = 20000 } = {}) {
  if (!Number.isInteger(maxStates) || maxStates < 2) throw new RangeError('maxStates must be >= 2');
  const ast = new Parser(pattern).parse(), states = [];
  const state = () => { if (states.length >= maxStates) throw RangeError('NFA state limit exceeded'); const id = states.length; states.push({ eps: [], edges: [], accept: false }); return id; };
  const eps = (a, b) => states[a].eps.push(b);
  const edge = (a, b, test) => states[a].edges.push({ to: b, test });
  function build(n) {
    if (n.type === 'empty') { const a = state(), b = state(); eps(a, b); return { start: a, end: b }; }
    if (n.type === 'literal' || n.type === 'test') {
      const a = state(), b = state(); edge(a, b, n.type === 'literal' ? x => x === n.value : n.fn); return { start: a, end: b };
    }
    if (n.type === 'concat') {
      const parts = n.list.map(build);
      for (let i = 1; i < parts.length; i++) eps(parts[i - 1].end, parts[i].start);
      return { start: parts[0].start, end: parts[parts.length - 1].end };
    }
    if (n.type === 'alt') {
      const a = state(), b = state();
      for (const item of n.list) { const p = build(item); eps(a, p.start); eps(p.end, b); }
      return { start: a, end: b };
    }
    if (n.type === 'repeat') {
      const a = state(), b = state(), p = build(n.node);
      eps(a, p.start); if (n.q === '*' || n.q === '?') eps(a, b);
      eps(p.end, b); if (n.q === '*' || n.q === '+') eps(p.end, p.start);
      return { start: a, end: b };
    }
    throw Error('unknown AST node');
  }
  const fragment = build(ast); states[fragment.end].accept = true;
  function closure(seed) {
    const found = new Set(seed), stack = [...seed];
    while (stack.length) for (const next of states[stack.pop()].eps) if (!found.has(next)) { found.add(next); stack.push(next); }
    return found;
  }
  function test(input) {
    if (typeof input !== 'string') throw new TypeError('input must be a string');
    let active = closure([fragment.start]);
    for (const ch of Array.from(input)) {
      const next = new Set();
      for (const id of active) for (const e of states[id].edges) if (e.test(ch)) next.add(e.to);
      if (!next.size) return false;
      active = closure(next);
    }
    for (const id of active) if (states[id].accept) return true;
    return false;
  }
  return Object.freeze({ pattern, stateCount: states.length, test, match: test });
}
if (require.main === module) {
  const assert = require('node:assert/strict');
  const check = (p, yes, no) => { const r = compileRegex(p); for (const s of yes) assert.equal(r.test(s), true, p + ' accepts ' + s); for (const s of no) assert.equal(r.test(s), false, p + ' rejects ' + s); };
  check('a(b|c)*d', ['ad', 'abd', 'acbd', 'abcbcd'], ['a', 'ab', 'xabd']);
  check('colou?r', ['color', 'colour'], ['colouur', 'colr']);
  check('[A-Z][a-z]+', ['Ada', 'Grace', 'Zx'], ['ada', 'A', 'AZ']);
  check('\\d+', ['0', '12345'], ['', '12x']);
  check('\\w+@\\w+\\.com', ['dev_1@example.com'], ['@example.com', 'dev@example.org']);
  check('(ab|cd)+', ['ab', 'cd', 'abcd', 'cdab'], ['', 'a', 'abc']);
  check('a*', ['', 'a', 'aaaa'], ['b', 'aaab']);
  check('a.b', ['acb', 'a-b'], ['ab', 'a\nb']);
  check('é+', ['é', 'éé'], ['e', 'É']);
  check('[^0-9]+', ['abc', 'a-b'], ['123', 'a1']);
  assert.throws(() => compileRegex('('), RegexSyntaxError);
  assert.throws(() => compileRegex('a**'), RegexSyntaxError);
  assert.throws(() => compileRegex('[z-a]'), RegexSyntaxError);
  assert.throws(() => compileRegex('\\q'), RegexSyntaxError);
  console.log('Thompson NFA Regex Engine: all tests passed');
}
module.exports = { compileRegex, RegexSyntaxError };
