'use strict';

/**
 * Exercise: create a small parser-combinator library with packrat memoization.
 *
 * Parsers are immutable values that can be mapped, sequenced, alternated and
 * repeated. Results are memoized by parser identity and input offset; direct
 * left recursion is detected instead of recursing until the call stack fails.
 *
 * Run: node packrat-parser-combinators.js
 */

const assert = require('node:assert/strict');

const IN_PROGRESS = Symbol('in-progress');
let nextParserId = 1;

function success(value, position) {
  return { ok: true, value, position };
}

function failure(position, expected) {
  return { ok: false, position, expected: [expected] };
}

function mergeFailures(a, b) {
  if (a.position > b.position) return a;
  if (b.position > a.position) return b;
  return {
    ok: false,
    position: a.position,
    expected: [...new Set([...a.expected, ...b.expected])].sort()
  };
}

class Parser {
  constructor(parseFunction) {
    if (typeof parseFunction !== 'function') throw new TypeError('parser requires a function');
    this.id = nextParserId++;
    this.parseFunction = parseFunction;
  }

  parse(context, position) {
    let entries = context.memo.get(this.id);
    if (!entries) {
      entries = new Map();
      context.memo.set(this.id, entries);
    }

    if (entries.has(position)) {
      const cached = entries.get(position);
      if (cached === IN_PROGRESS) {
        throw new Error('Left recursion detected at offset ' + position);
      }
      context.stats.hits += 1;
      return cached;
    }

    context.stats.misses += 1;
    entries.set(position, IN_PROGRESS);
    try {
      const result = this.parseFunction(context, position);
      entries.set(position, result);
      return result;
    } catch (error) {
      entries.delete(position);
      throw error;
    }
  }

  map(transform) {
    const source = this;
    return new Parser((context, position) => {
      const result = source.parse(context, position);
      return result.ok ? success(transform(result.value), result.position) : result;
    });
  }

  chain(transform) {
    const source = this;
    return new Parser((context, position) => {
      const first = source.parse(context, position);
      if (!first.ok) return first;
      const next = transform(first.value);
      if (!(next instanceof Parser)) throw new TypeError('chain callback must return a Parser');
      return next.parse(context, first.position);
    });
  }

  then(next) {
    return this.chain(() => next);
  }

  skipLeft(left) {
    return left.then(this);
  }

  skipRight(right) {
    return this.chain(value => right.map(() => value));
  }

  or(other) {
    const first = this;
    return new Parser((context, position) => {
      const a = first.parse(context, position);
      if (a.ok) return a;
      const b = other.parse(context, position);
      return b.ok ? b : mergeFailures(a, b);
    });
  }

  many({ min = 0, max = Infinity } = {}) {
    if (!Number.isInteger(min) || min < 0 || !(max === Infinity || (Number.isInteger(max) && max >= min))) {
      throw new RangeError('invalid repetition bounds');
    }
    const source = this;
    return new Parser((context, position) => {
      const values = [];
      let cursor = position;
      while (values.length < max) {
        const result = source.parse(context, cursor);
        if (!result.ok) {
          return values.length >= min ? success(values, cursor) : result;
        }
        if (result.position === cursor) {
          throw new Error('many() parser accepted empty input; repetition would not progress');
        }
        values.push(result.value);
        cursor = result.position;
      }
      return success(values, cursor);
    });
  }

  optional(defaultValue = undefined) {
    return this.or(pure(defaultValue));
  }

  lookAhead() {
    const source = this;
    return new Parser((context, position) => {
      const result = source.parse(context, position);
      return result.ok ? success(result.value, position) : result;
    });
  }

  notFollowedBy(expected = 'unexpected input') {
    const source = this;
    return new Parser((context, position) => {
      const result = source.parse(context, position);
      return result.ok ? failure(position, expected) : success(undefined, position);
    });
  }

  label(name) {
    const source = this;
    return new Parser((context, position) => {
      const result = source.parse(context, position);
      return result.ok ? result : failure(result.position, name);
    });
  }

  sepBy(separator, { min = 0 } = {}) {
    const item = this;
    return new Parser((context, position) => {
      const first = item.parse(context, position);
      if (!first.ok) return min === 0 ? success([], position) : first;
      const values = [first.value];
      let cursor = first.position;

      while (true) {
        const delimiter = separator.parse(context, cursor);
        if (!delimiter.ok) break;
        if (delimiter.position === cursor) throw new Error('separator accepted empty input');
        const next = item.parse(context, delimiter.position);
        if (!next.ok) return next;
        if (next.position === delimiter.position) throw new Error('item accepted empty input');
        values.push(next.value);
        cursor = next.position;
      }
      return values.length >= min ? success(values, cursor) : failure(cursor, 'at least ' + min + ' items');
    });
  }
}

function pure(value) {
  return new Parser((context, position) => success(value, position));
}

function literal(text) {
  if (typeof text !== 'string' || text.length === 0) throw new TypeError('literal must be a non-empty string');
  return new Parser((context, position) =>
    context.input.startsWith(text, position)
      ? success(text, position + text.length)
      : failure(position, JSON.stringify(text))
  );
}

function regex(expression, expected = expression.toString()) {
  if (!(expression instanceof RegExp)) throw new TypeError('regex() expects a RegExp');
  const flags = expression.flags.replace(/[gym]/g, '');
  const anchored = new RegExp('^(?:' + expression.source + ')', flags);
  return new Parser((context, position) => {
    const match = anchored.exec(context.input.slice(position));
    return match
      ? success(match[0], position + match[0].length)
      : failure(position, expected);
  });
}

function eof() {
  return new Parser((context, position) =>
    position === context.input.length ? success(undefined, position) : failure(position, 'end of input')
  );
}

function lazy(factory) {
  let resolved;
  return new Parser((context, position) => {
    if (!resolved) {
      resolved = factory();
      if (!(resolved instanceof Parser)) throw new TypeError('lazy factory must return a Parser');
    }
    return resolved.parse(context, position);
  });
}

function chainLeft1(term, operator) {
  return new Parser((context, position) => {
    const first = term.parse(context, position);
    if (!first.ok) return first;
    let value = first.value;
    let cursor = first.position;

    while (true) {
      const op = operator.parse(context, cursor);
      if (!op.ok) break;
      const right = term.parse(context, op.position);
      if (!right.ok) return right;
      if (right.position === cursor) throw new Error('chainLeft1 parser did not advance');
      value = op.value(value, right.value);
      cursor = right.position;
    }
    return success(value, cursor);
  });
}

class ParseError extends SyntaxError {
  constructor(input, result) {
    const expected = result.expected.join(' or ');
    super('Parse error at offset ' + result.position + '; expected ' + expected);
    this.name = 'ParseError';
    this.input = input;
    this.position = result.position;
    this.expected = result.expected;
  }
}

function run(parser, input, { requireEOF = true } = {}) {
  if (!(parser instanceof Parser)) throw new TypeError('run() expects a Parser');
  if (typeof input !== 'string') throw new TypeError('input must be a string');
  const context = { input, memo: new Map(), stats: { hits: 0, misses: 0 } };
  let result = parser.parse(context, 0);
  if (result.ok && requireEOF) result = eof().parse(context, result.position);
  if (!result.ok) throw new ParseError(input, result);
  return {
    value: result.value,
    position: result.position,
    stats: { ...context.stats }
  };
}

function arithmeticParser() {
  const whitespace = regex(/\s*/u, 'whitespace');
  const token = parser => parser.skipRight(whitespace);
  const number = token(regex(/\d+(?:\.\d+)?/u, 'number')).map(Number);

  let expression;
  const open = token(literal('('));
  const close = token(literal(')'));
  const atom = number.or(
    lazy(() => expression).skipLeft(open).skipRight(close)
  );

  const multiply = token(
    literal('*').map(() => (a, b) => a * b)
      .or(literal('/').map(() => (a, b) => a / b))
  );
  const add = token(
    literal('+').map(() => (a, b) => a + b)
      .or(literal('-').map(() => (a, b) => a - b))
  );

  const product = chainLeft1(atom, multiply);
  expression = chainLeft1(product, add);
  return expression.skipLeft(whitespace).skipRight(whitespace);
}

function runTests() {
  const arithmetic = arithmeticParser();
  const parsed = run(arithmetic, ' 12 + 3 * (4 - 1) / 2 ');
  assert.equal(parsed.value, 16.5);
  assert.ok(parsed.stats.misses > 0);

  const list = regex(/[a-z]+/u, 'identifier')
    .sepBy(literal(','));
  assert.deepEqual(run(list, 'alpha,beta,gamma').value, ['alpha', 'beta', 'gamma']);
  assert.deepEqual(run(list, '').value, []);
  assert.throws(() => run(list, 'alpha,'), /Parse error/);
  assert.throws(() => run(arithmetic, '1 + * 2'), /Parse error/);
  assert.throws(() => run(arithmetic, '(2 + 3'), /Parse error/);

  const oneOrMoreA = literal('a').many({ min: 1 });
  assert.deepEqual(run(oneOrMoreA, 'aaa').value, ['a', 'a', 'a']);
  assert.throws(() => run(oneOrMoreA, ''), /Parse error/);
  assert.throws(() => run(pure(1).many(), ''), /empty input/);

  let leftRecursive;
  leftRecursive = lazy(() => leftRecursive.or(literal('x')));
  assert.throws(() => run(leftRecursive, 'x'), /Left recursion detected/);

  const prefix = literal('cat').lookAhead().then(literal('cat'));
  assert.equal(run(prefix, 'cat').value, 'cat');
  assert.throws(() => run(literal('cat').notFollowedBy('cat forbidden').then(literal('x')), 'catx'), /Parse error/);
  console.log('Packrat parser combinator tests passed');
}

if (require.main === module) runTests();

module.exports = {
  Parser,
  ParseError,
  pure,
  literal,
  regex,
  eof,
  lazy,
  chainLeft1,
  run,
  arithmeticParser
};
