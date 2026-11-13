'use strict';

/*
 * Exercise: Build a memoizing parser-combinator library (packrat parsing).
 *
 * Each parser is memoized by parser identity and input offset. Combinators
 * support sequencing, ordered choice, repetition, optional values, lazy
 * recursion, separated lists, regular expressions and left-associative
 * operator chains. Re-entering the same parser at the same offset detects
 * unsupported left recursion instead of recursing forever.
 *
 * Offsets and columns use JavaScript UTF-16 code units.
 */

const assert = require('node:assert/strict');

let nextParserId = 1;

class LeftRecursionError extends Error {
  constructor(parserName, position) {
    super('Left recursion detected in ' + parserName + ' at offset ' + position);
    this.name = 'LeftRecursionError';
    this.parserName = parserName;
    this.position = position;
  }
}

function success(value, next) {
  return { ok: true, value, next };
}

function failure(position, expected) {
  return { ok: false, position, expected: new Set([expected]) };
}

function mergeFailures(left, right) {
  if (!left) return right;
  if (!right) return left;
  if (left.position > right.position) return left;
  if (right.position > left.position) return right;
  return {
    ok: false,
    position: left.position,
    expected: new Set([...left.expected, ...right.expected])
  };
}

function makeParser(run, name = 'anonymous parser') {
  if (typeof run !== 'function') throw new TypeError('parser implementation must be a function');
  const id = nextParserId++;

  const parser = (context, position) => {
    const key = id + ':' + position;
    if (context.memo.has(key)) {
      context.stats.memoHits += 1;
      return context.memo.get(key);
    }
    if (context.active.has(key)) {
      throw new LeftRecursionError(name, position);
    }

    context.active.add(key);
    try {
      const result = run(context, position);
      if (!result || typeof result.ok !== 'boolean') {
        throw new TypeError('parser returned an invalid result');
      }
      context.memo.set(key, result);
      return result;
    } finally {
      context.active.delete(key);
    }
  };

  Object.defineProperties(parser, {
    parserId: { value: id },
    parserName: { value: name }
  });
  return parser;
}

function literal(text) {
  if (typeof text !== 'string') throw new TypeError('literal expects a string');
  return makeParser((context, position) =>
    context.input.startsWith(text, position)
      ? success(text, position + text.length)
      : failure(position, JSON.stringify(text)),
  'literal(' + JSON.stringify(text) + ')');
}

function regex(pattern) {
  if (!(pattern instanceof RegExp)) throw new TypeError('regex expects a RegExp');
  const flags = pattern.flags.replace(/[gy]/g, '') + 'y';
  const sticky = new RegExp(pattern.source, flags);
  return makeParser((context, position) => {
    sticky.lastIndex = position;
    const match = sticky.exec(context.input);
    return match
      ? success(match[0], position + match[0].length)
      : failure(position, pattern.toString());
  }, 'regex(' + pattern.toString() + ')');
}

function satisfy(predicate, label = 'matching character') {
  if (typeof predicate !== 'function') throw new TypeError('predicate must be a function');
  return makeParser((context, position) => {
    if (position >= context.input.length) return failure(position, label);
    const character = context.input[position];
    return predicate(character)
      ? success(character, position + 1)
      : failure(position, label);
  }, label);
}

function map(parser, mapper) {
  return makeParser((context, position) => {
    const result = parser(context, position);
    return result.ok
      ? success(mapper(result.value), result.next)
      : result;
  }, 'map(' + parser.parserName + ')');
}

function seq(...parsers) {
  return makeParser((context, position) => {
    const values = [];
    let cursor = position;
    for (const parser of parsers) {
      const result = parser(context, cursor);
      if (!result.ok) return result;
      values.push(result.value);
      cursor = result.next;
    }
    return success(values, cursor);
  }, 'sequence');
}

function choice(...parsers) {
  return makeParser((context, position) => {
    let bestFailure = null;
    for (const parser of parsers) {
      const result = parser(context, position);
      if (result.ok) return result;
      bestFailure = mergeFailures(bestFailure, result);
    }
    return bestFailure || failure(position, 'an alternative');
  }, 'ordered choice');
}

function many(parser, options = {}) {
  const min = options.min === undefined ? 0 : options.min;
  const max = options.max === undefined ? Infinity : options.max;
  if (!Number.isInteger(min) || min < 0 ||
      !(max === Infinity || (Number.isInteger(max) && max >= min))) {
    throw new RangeError('invalid repetition bounds');
  }

  return makeParser((context, position) => {
    const values = [];
    let cursor = position;
    while (values.length < max) {
      const result = parser(context, cursor);
      if (!result.ok) {
        return values.length >= min ? success(values, cursor) : result;
      }
      if (result.next === cursor) {
        throw new Error('many() received a parser that succeeds without consuming input');
      }
      values.push(result.value);
      cursor = result.next;
    }
    return success(values, cursor);
  }, 'many(' + parser.parserName + ')');
}

function optional(parser) {
  return makeParser((context, position) => {
    const result = parser(context, position);
    return result.ok ? result : success(null, position);
  }, 'optional(' + parser.parserName + ')');
}

function lazy(thunk, name = 'lazy parser') {
  if (typeof thunk !== 'function') throw new TypeError('lazy expects a parser factory');
  let actual = null;
  return makeParser((context, position) => {
    if (actual === null) {
      actual = thunk();
      if (typeof actual !== 'function') throw new TypeError('lazy factory did not return a parser');
    }
    return actual(context, position);
  }, name);
}

function between(open, parser, close) {
  return map(seq(open, parser, close), values => values[1]);
}

function sepBy(parser, separator, options = {}) {
  const min = options.min === undefined ? 0 : options.min;
  if (!Number.isInteger(min) || min < 0) throw new RangeError('min must be non-negative');

  return makeParser((context, position) => {
    const first = parser(context, position);
    if (!first.ok) return min === 0 ? success([], position) : first;

    const values = [first.value];
    let cursor = first.next;
    while (true) {
      const separatorResult = separator(context, cursor);
      if (!separatorResult.ok) return success(values, cursor);

      const item = parser(context, separatorResult.next);
      if (!item.ok) return item;
      if (item.next === separatorResult.next) {
        throw new Error('sepBy() item parser succeeded without consuming input');
      }
      values.push(item.value);
      cursor = item.next;
    }
  }, 'separated list');
}

function chainLeft1(valueParser, operatorParser) {
  return makeParser((context, position) => {
    const first = valueParser(context, position);
    if (!first.ok) return first;

    let value = first.value;
    let cursor = first.next;
    while (true) {
      const operator = operatorParser(context, cursor);
      if (!operator.ok) return success(value, cursor);

      const right = valueParser(context, operator.next);
      // Once an operator has been consumed, a missing right operand is a
      // committed syntax error, not the end of the repetition.
      if (!right.ok) return right;
      if (right.next === operator.next) {
        throw new Error('chainLeft1 value parser succeeded without consuming input');
      }
      value = operator.value(value, right.value);
      cursor = right.next;
    }
  }, 'left-associative chain');
}

function endOfInput() {
  return makeParser((context, position) =>
    position === context.input.length
      ? success(null, position)
      : failure(position, 'end of input'),
  'end of input');
}

function parse(parser, input, options = {}) {
  if (typeof parser !== 'function') throw new TypeError('parse expects a parser');
  const context = {
    input: String(input),
    memo: new Map(),
    active: new Set(),
    stats: { memoHits: 0 }
  };

  let result = parser(context, 0);
  const requireEnd = options.requireEnd !== false;
  if (result.ok && requireEnd && result.next !== context.input.length) {
    result = failure(result.next, 'end of input');
  }

  const stats = {
    memoEntries: context.memo.size,
    memoHits: context.stats.memoHits
  };
  if (result.ok) {
    return { ok: true, value: result.value, next: result.next, stats };
  }

  const prefix = context.input.slice(0, result.position);
  const lines = prefix.split('\n');
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;
  const expected = Array.from(result.expected).sort();
  return {
    ok: false,
    error: {
      position: result.position,
      line,
      column,
      expected,
      message: 'Expected ' + expected.join(' or ') +
        ' at line ' + line + ', column ' + column
    },
    stats
  };
}

// Example: arithmetic grammar with precedence and left associativity.
function createArithmeticParser() {
  const whitespace = regex(/\s+/);
  const lexeme = parser => map(seq(many(whitespace), parser), values => values[1]);
  const number = lexeme(map(regex(/\d+(?:\.\d+)?/), Number));

  let expression;
  const factor = lazy(() => choice(
    number,
    map(
      seq(
        lexeme(literal('(')),
        expression,
        lexeme(literal(')'))
      ),
      values => values[1]
    )
  ), 'factor');

  const multiplyOrDivide = choice(
    map(lexeme(literal('*')), () => (left, right) => left * right),
    map(lexeme(literal('/')), () => (left, right) => left / right)
  );
  const addOrSubtract = choice(
    map(lexeme(literal('+')), () => (left, right) => left + right),
    map(lexeme(literal('-')), () => (left, right) => left - right)
  );

  const term = chainLeft1(factor, multiplyOrDivide);
  expression = chainLeft1(term, addOrSubtract);

  return map(
    seq(expression, many(whitespace)),
    values => values[0]
  );
}

// Example usage and tests.
function runTests() {
  const arithmetic = createArithmeticParser();
  assert.equal(parse(arithmetic, '2 + 3 * (4 - 1)').value, 11);
  assert.equal(parse(arithmetic, '10 - 2 - 3').value, 5);
  assert.equal(parse(arithmetic, '8 / 4 / 2').value, 1);
  assert.equal(parse(arithmetic, ' 12.5 + 0.5 ').value, 13);

  const malformed = parse(arithmetic, '1 + * 2');
  assert.equal(malformed.ok, false);
  assert.ok(malformed.error.position >= 4);
  assert.ok(malformed.error.expected.length > 0);
  assert.equal(parse(arithmetic, '1 2').ok, false);

  const digits = regex(/\d+/);
  const csvNumbers = sepBy(digits, literal(','));
  assert.deepEqual(parse(csvNumbers, '12,7,305').value, ['12', '7', '305']);
  assert.deepEqual(parse(sepBy(digits, literal(',')), '').value, []);
  assert.equal(parse(sepBy(digits, literal(','), { min: 1 }), '').ok, false);
  assert.equal(parse(between(literal('['), digits, literal(']')), '[42]').value, '42');

  const memoized = literal('x');
  const repeatedChoice = choice(memoized, memoized);
  const memoResult = parse(repeatedChoice, 'y');
  assert.equal(memoResult.ok, false);
  assert.ok(memoResult.stats.memoHits >= 1);

  assert.throws(
    () => parse(many(literal('')), ''),
    /without consuming input/
  );

  let recursive;
  recursive = lazy(() => choice(
    map(seq(recursive, literal('x')), values => values[0] + 'x'),
    literal('x')
  ), 'deliberately left-recursive grammar');
  assert.throws(
    () => parse(recursive, 'x'),
    LeftRecursionError
  );

  // A recursive, non-left-recursive grammar: balanced parentheses.
  let balanced;
  balanced = lazy(() => choice(
    map(seq(literal('('), balanced, literal(')')), values => '(' + values[1] + ')'),
    literal('')
  ), 'balanced parentheses');
  assert.equal(parse(balanced, '((()))').ok, true);
  assert.equal(parse(balanced, '(()').ok, false);

  const lineAware = parse(seq(literal('a'), literal('b')), 'a\nc');
  assert.equal(lineAware.ok, false);
  assert.equal(lineAware.error.line, 2);
  assert.equal(lineAware.error.column, 1);

  console.log('PackratParser: all tests passed');
}

if (require.main === module) runTests();

module.exports = {
  LeftRecursionError,
  makeParser,
  literal,
  regex,
  satisfy,
  map,
  seq,
  choice,
  many,
  optional,
  lazy,
  between,
  sepBy,
  chainLeft1,
  endOfInput,
  parse,
  createArithmeticParser
};
