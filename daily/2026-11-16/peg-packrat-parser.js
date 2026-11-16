/**
 * Exercise: build a PEG/packrat parser combinator engine. Named rules are
 * memoized by rule and input offset, ordered choice is deterministic, repeat
 * rejects zero-width parsers, and failures report the farthest expectations.
 * Left recursion is detected explicitly rather than overflowing the stack.
 * Run: node peg-packrat-parser.js
 */
'use strict';
const assert = require('node:assert/strict');

const lit = text => ({ kind: 'lit', text });
const rx = pattern => {
  if (!(pattern instanceof RegExp) || pattern.global || pattern.sticky) throw new TypeError('regex must be non-global and non-sticky');
  return { kind: 'rx', pattern };
};
const seq = (...parts) => ({ kind: 'seq', parts });
const choice = (...parts) => ({ kind: 'choice', parts });
const ref = name => ({ kind: 'ref', name });
const eof = () => ({ kind: 'eof' });
const map = (parser, fn) => ({ kind: 'map', parser, fn });
const many = (parser, min = 0, max = Infinity) => {
  if (!Number.isSafeInteger(min) || min < 0 || !(max === Infinity || (Number.isSafeInteger(max) && max >= min))) throw new RangeError('invalid repeat bounds');
  return { kind: 'many', parser, min, max };
};

function parsePEG(grammar, start, input) {
  if (!grammar || typeof grammar !== 'object' || typeof input !== 'string') throw new TypeError('grammar and string input required');
  if (!Object.hasOwn(grammar, start)) throw new Error(`Unknown start rule: ${start}`);
  const memo = new Map(), active = new Set(), expected = new Set();
  const stats = { calls: 0, hits: 0, entries: 0 };
  let farthest = -1;
  const fail = (at, why) => {
    if (at > farthest) { farthest = at; expected.clear(); }
    if (at === farthest) expected.add(why);
    return { ok: false, pos: at };
  };
  function run(p, at) {
    if (!p || typeof p.kind !== 'string') throw new TypeError('invalid parser node');
    switch (p.kind) {
      case 'lit': return input.startsWith(p.text, at) ? { ok: true, value: p.text, pos: at + p.text.length } : fail(at, JSON.stringify(p.text));
      case 'rx': {
        const m = p.pattern.exec(input.slice(at));
        return m && m.index === 0 ? { ok: true, value: m[0], pos: at + m[0].length } : fail(at, String(p.pattern));
      }
      case 'seq': {
        const values = []; let pos = at;
        for (const part of p.parts) { const r = run(part, pos); if (!r.ok) return r; values.push(r.value); pos = r.pos; }
        return { ok: true, value: values, pos };
      }
      case 'choice':
        for (const part of p.parts) { const r = run(part, at); if (r.ok) return r; }
        return { ok: false, pos: at };
      case 'many': {
        const values = []; let pos = at;
        while (values.length < p.max) {
          const r = run(p.parser, pos);
          if (!r.ok) break;
          if (r.pos === pos) throw new Error('repeat parser succeeded without consuming input');
          values.push(r.value); pos = r.pos;
        }
        return values.length >= p.min ? { ok: true, value: values, pos } : { ok: false, pos };
      }
      case 'map': {
        const r = run(p.parser, at);
        return r.ok ? { ...r, value: p.fn(r.value) } : r;
      }
      case 'ref': {
        if (!Object.hasOwn(grammar, p.name)) throw new Error(`Undefined rule: ${p.name}`);
        const key = `${p.name}@${at}`;
        if (memo.has(key)) { stats.hits++; return memo.get(key); }
        if (active.has(key)) throw new Error(`Left recursion in ${p.name} at ${at}`);
        active.add(key); stats.calls++;
        try { const r = run(grammar[p.name], at); memo.set(key, r); stats.entries++; return r; }
        finally { active.delete(key); }
      }
      case 'eof': return at === input.length ? { ok: true, value: null, pos: at } : fail(at, 'end of input');
      default: throw new Error(`unknown parser kind: ${p.kind}`);
    }
  }
  const result = run(ref(start), 0);
  if (result.ok && result.pos === input.length) return { ok: true, value: result.value, stats };
  if (result.ok) fail(result.pos, 'end of input');
  return { ok: false, error: { offset: farthest < 0 ? result.pos : farthest, expected: [...expected].sort(), found: farthest < 0 || farthest >= input.length ? null : input[farthest] }, stats };
}

function runTests() {
  const nested = {
    start: seq(ref('value'), eof()),
    value: choice(ref('group'), rx(/[a-z]+/)),
    group: map(seq(lit('('), many(ref('value')), lit(')')), parts => parts[1]),
  };
  const parsed = parsePEG(nested, 'start', '(a(bc)d)');
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value, [['a', ['bc'], 'd'], null]);
  assert.ok(parsed.stats.entries > 0);

  const memoGrammar = {
    start: choice(seq(ref('word'), lit('!'), eof()), seq(ref('word'), lit('?'), eof())),
    word: rx(/[a-z]+/),
  };
  const memoized = parsePEG(memoGrammar, 'start', 'hello?');
  assert.equal(memoized.ok, true);
  assert.ok(memoized.stats.hits > 0);

  const ordered = parsePEG({ start: choice(lit('a'), lit('ab')) }, 'start', 'ab');
  assert.equal(ordered.ok, false, 'PEG choice commits to the first successful alternative');
  assert.equal(ordered.error.offset, 1);
  const bad = parsePEG({ start: seq(lit('id:'), rx(/[0-9]+/), eof()) }, 'start', 'id:abc');
  assert.equal(bad.error.offset, 3);
  assert.equal(bad.error.found, 'a');
  assert.deepEqual(bad.error.expected, ['/\\d+/'].map(() => '/[0-9]+/'));
  assert.throws(() => parsePEG({ start: ref('start') }, 'start', ''), /Left recursion/);
  assert.throws(() => parsePEG({ start: many(lit(''), 1) }, 'start', ''), /without consuming/);
  assert.throws(() => rx(/x/g), /non-global/);
  assert.throws(() => parsePEG({ start: ref('missing') }, 'start', ''), /Undefined rule/);
  console.log('PEG packrat parser: all tests passed');
}

if (require.main === module) runTests();
module.exports = { lit, rx, seq, choice, ref, eof, map, many, parsePEG };
