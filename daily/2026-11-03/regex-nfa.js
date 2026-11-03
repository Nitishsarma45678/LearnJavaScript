const assert = require('node:assert/strict');

class Parser {
  constructor(pattern) { this.tokens = Array.from(pattern); this.index = 0; }
  peek() { return this.tokens[this.index]; }
  take() { return this.tokens[this.index++]; }
  parse() {
    const ast = this.expression();
    if (this.index !== this.tokens.length) throw new SyntaxError('Unexpected token: ' + this.peek());
    return ast;
  }
  expression() {
    const branches = [this.concatenation()];
    while (this.peek() === '|') { this.take(); branches.push(this.concatenation()); }
    return branches.length === 1 ? branches[0] : { type: 'alt', children: branches };
  }
  concatenation() {
    const parts = [];
    while (this.index < this.tokens.length && this.peek() !== ')' && this.peek() !== '|') {
      parts.push(this.repetition());
    }
    if (!parts.length) return { type: 'empty' };
    return parts.length === 1 ? parts[0] : { type: 'concat', children: parts };
  }
  repetition() {
    const atom = this.atom();
    const q = this.peek();
    if (q === '*' || q === '+' || q === '?') {
      this.take();
      if (this.peek() === '*' || this.peek() === '+' || this.peek() === '?') {
        throw new SyntaxError('Repeated quantifiers are not supported');
      }
      return { type: q, child: atom };
    }
    return atom;
  }
  atom() {
    const token = this.take();
    if (token === undefined) throw new SyntaxError('Expected an expression');
    if (token === '(') {
      const inside = this.expression();
      if (this.take() !== ')') throw new SyntaxError('Unclosed group');
      return inside;
    }
    if (token === '.') return { type: 'char', value: null };
    if (token === '\\') {
      const escaped = this.take();
      if (escaped === undefined) throw new SyntaxError('Trailing escape');
      return { type: 'char', value: escaped };
    }
    if ('*+?)|'.includes(token)) throw new SyntaxError('Unexpected metacharacter: ' + token);
    return { type: 'char', value: token };
  }
}

function compile(ast) {
  const states = [];
  const state = () => { states.push({ eps: [], edges: [] }); return states.length - 1; };
  const edge = (from, to, value) => states[from].edges.push({ to, value });
  const epsilon = (from, to) => states[from].eps.push(to);
  function build(node) {
    if (node.type === 'empty') {
      const start = state(), end = state(); epsilon(start, end); return { start, end };
    }
    if (node.type === 'char') {
      const start = state(), end = state(); edge(start, end, node.value); return { start, end };
    }
    if (node.type === 'concat') {
      const fragments = node.children.map(build);
      for (let i = 1; i < fragments.length; i++) epsilon(fragments[i - 1].end, fragments[i].start);
      return { start: fragments[0].start, end: fragments[fragments.length - 1].end };
    }
    if (node.type === 'alt') {
      const start = state(), end = state();
      for (const child of node.children) {
        const part = build(child); epsilon(start, part.start); epsilon(part.end, end);
      }
      return { start, end };
    }
    const start = state(), end = state(), part = build(node.child);
    if (node.type === '*') { epsilon(start, end); epsilon(start, part.start); epsilon(part.end, part.start); epsilon(part.end, end); }
    else if (node.type === '+') { epsilon(start, part.start); epsilon(part.end, part.start); epsilon(part.end, end); }
    else if (node.type === '?') { epsilon(start, end); epsilon(start, part.start); epsilon(part.end, end); }
    return { start, end };
  }
  const fragment = build(ast);
  return { states, start: fragment.start, accept: fragment.end };
}
function closure(nfa, seeds) {
  const result = new Set(seeds), stack = [...seeds];
  while (stack.length) {
    const current = stack.pop();
    for (const next of nfa.states[current].eps) {
      if (!result.has(next)) { result.add(next); stack.push(next); }
    }
  }
  return result;
}
function compileRegex(pattern) {
  const nfa = compile(new Parser(pattern).parse());
  return {
    test(input) {
      let active = closure(nfa, [nfa.start]);
      for (const character of Array.from(String(input))) {
        const next = new Set();
        for (const id of active) {
          for (const transition of nfa.states[id].edges) {
            if (transition.value === null || transition.value === character) next.add(transition.to);
          }
        }
        active = closure(nfa, next);
        if (!active.size) return false;
      }
      return active.has(nfa.accept);
    }
  };
}

// Full-string matching; supports literals, ., *, +, ?, |, groups and backslash escapes.
const grouped = compileRegex('a(b|c)*d');
assert.equal(grouped.test('ad'), true);
assert.equal(grouped.test('abcbcd'), true);
assert.equal(grouped.test('abexd'), false);
const optional = compileRegex('colou?r');
assert.equal(optional.test('color'), true);
assert.equal(optional.test('colour'), true);
assert.equal(optional.test('colouur'), false);
const repeated = compileRegex('ab+c');
assert.equal(repeated.test('abbc'), true);
assert.equal(repeated.test('ac'), false);
const escaped = compileRegex(String.raw`a\.b`);
assert.equal(escaped.test('a.b'), true);
assert.equal(escaped.test('axb'), false);
const empty = compileRegex('');
assert.equal(empty.test(''), true);
assert.equal(empty.test('x'), false);
assert.throws(() => compileRegex('('), SyntaxError);
assert.throws(() => compileRegex('a**'), SyntaxError);
console.log('Regex NFA tests passed');
