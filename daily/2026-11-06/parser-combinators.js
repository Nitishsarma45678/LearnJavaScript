/**
 * Exercise: Recursive Parser Combinators
 *
 * Build parsers from small functions: literal, regex, map, sequence, choice,
 * many and lazy. Failures retain the furthest input position and merge
 * expectations at that position. The arithmetic example demonstrates
 * precedence, left associativity, recursion and complete-input validation.
 */

function parserSuccess(value, index) {
  return { ok: true, value, index };
}
function parserFailure(index, expected) {
  return { ok: false, index, expected: new Set([expected]) };
}
function mergeFailures(left, right) {
  if (!left) return right;
  if (!right) return left;
  if (left.index > right.index) return left;
  if (right.index > left.index) return right;
  return {
    ok: false,
    index: left.index,
    expected: new Set([...left.expected, ...right.expected])
  };
}

function literal(expectedText) {
  if (typeof expectedText !== "string" || expectedText.length === 0) {
    throw new TypeError("literal expects a non-empty string");
  }
  return (input, index) => input.startsWith(expectedText, index)
    ? parserSuccess(expectedText, index + expectedText.length)
    : parserFailure(index, JSON.stringify(expectedText));
}

function regex(pattern) {
  if (!(pattern instanceof RegExp)) throw new TypeError("regex expects a RegExp");
  const flags = pattern.flags.replace(/[gy]/g, "");
  const anchored = new RegExp("^(?:" + pattern.source + ")", flags);
  return (input, index) => {
    const match = anchored.exec(input.slice(index));
    return match
      ? parserSuccess(match[0], index + match[0].length)
      : parserFailure(index, "/" + pattern.source + "/");
  };
}

function map(parser, transform) {
  return (input, index) => {
    const result = parser(input, index);
    return result.ok
      ? parserSuccess(transform(result.value), result.index)
      : result;
  };
}

function sequence(...parsers) {
  return (input, index) => {
    const values = [];
    let cursor = index;
    for (const parser of parsers) {
      const result = parser(input, cursor);
      if (!result.ok) return result;
      values.push(result.value);
      cursor = result.index;
    }
    return parserSuccess(values, cursor);
  };
}

function choice(...parsers) {
  if (parsers.length === 0) throw new TypeError("choice requires at least one parser");
  return (input, index) => {
    let bestFailure = null;
    for (const parser of parsers) {
      const result = parser(input, index); // every alternative backtracks to index
      if (result.ok) return result;
      bestFailure = mergeFailures(bestFailure, result);
    }
    return bestFailure;
  };
}

function many(parser, minimum = 0, maximum = Infinity) {
  if (!Number.isInteger(minimum) || minimum < 0 ||
      !(maximum === Infinity || (Number.isInteger(maximum) && maximum >= minimum))) {
    throw new RangeError("invalid repetition bounds");
  }
  return (input, index) => {
    const values = [];
    let cursor = index;
    while (values.length < maximum) {
      const result = parser(input, cursor);
      if (!result.ok) {
        if (values.length < minimum) return result;
        return parserSuccess(values, cursor);
      }
      if (result.index === cursor) {
        throw new Error("many() parser succeeded without consuming input");
      }
      values.push(result.value);
      cursor = result.index;
    }
    return parserSuccess(values, cursor);
  };
}

function lazy(factory) {
  let parser;
  return (input, index) => {
    if (!parser) {
      parser = factory();
      if (typeof parser !== "function") throw new TypeError("lazy factory must return a parser");
    }
    return parser(input, index);
  };
}

function parseAll(parser, input) {
  if (typeof input !== "string") throw new TypeError("input must be a string");
  const result = parser(input, 0);
  if (!result.ok) {
    return {
      ok: false,
      index: result.index,
      expected: [...result.expected].sort()
    };
  }
  if (result.index !== input.length) {
    return { ok: false, index: result.index, expected: ["end of input"] };
  }
  return { ok: true, value: result.value, index: result.index };
}

function parseOrThrow(parser, input) {
  const result = parseAll(parser, input);
  if (!result.ok) {
    throw new SyntaxError(
      "Parse error at offset " + result.index +
      "; expected " + result.expected.join(" or ")
    );
  }
  return result.value;
}

function buildArithmeticParser() {
  const token = parser => map(sequence(parser, regex(/\s*/)), values => values[0]);
  const number = token(map(regex(/(?:\d+(?:\.\d*)?|\.\d+)/), Number));

  let expression;
  let term;
  let factor;

  factor = lazy(() => choice(
    number,
    map(sequence(
      token(literal("(")),
      expression,
      token(literal(")"))
    ), values => values[1]),
    map(sequence(token(literal("-")), factor), values => -values[1])
  ));

  term = lazy(() => map(sequence(
    factor,
    many(map(sequence(
      choice(token(literal("*")), token(literal("/"))),
      factor
    ), values => ({ operator: values[0], right: values[1] })))
  ), ([first, rest]) => rest.reduce((value, item) =>
    item.operator === "*" ? value * item.right : value / item.right, first)));

  expression = lazy(() => map(sequence(
    term,
    many(map(sequence(
      choice(token(literal("+")), token(literal("-"))),
      term
    ), values => ({ operator: values[0], right: values[1] })))
  ), ([first, rest]) => rest.reduce((value, item) =>
    item.operator === "+" ? value + item.right : value - item.right, first)));

  return map(sequence(regex(/\s*/), expression), values => values[1]);
}

// ------------------------------ Tests -------------------------------------

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(label + ": expected " + expected + ", got " + actual);
  }
}
function assertThrows(fn, pattern) {
  let error;
  try { fn(); } catch (caught) { error = caught; }
  if (!error || (pattern && !pattern.test(error.message))) throw new Error("expected throw " + pattern);
}

const arithmetic = buildArithmeticParser();
assertEqual(parseOrThrow(arithmetic, "2 + 3 * (4 - 1)"), 11, "operator precedence");
assertEqual(parseOrThrow(arithmetic, " -2 * 3 + 8 / 4 "), -4, "unary minus and whitespace");
assertEqual(parseOrThrow(arithmetic, "10 - 3 - 2"), 5, "left associativity");
assertEqual(parseOrThrow(arithmetic, "7 / 2"), 3.5, "division");

const backtracking = choice(literal("ab"), literal("a"));
assertEqual(parseOrThrow(backtracking, "a"), "a", "choice backtracks");
const bad = parseAll(arithmetic, "1 +");
assertEqual(bad.ok, false, "incomplete expression rejected");
assertEqual(parseAll(arithmetic, "1 2").index, 2, "trailing input position");
assertThrows(() => parseOrThrow(arithmetic, "(2 + 3"), /Parse error/);
assertThrows(() => parseAll(many(regex(/a*/)), "aaa"), /without consuming/);

if (typeof module !== "undefined") module.exports = {
  literal, regex, map, sequence, choice, many, lazy, parseAll, parseOrThrow,
  buildArithmeticParser
};
