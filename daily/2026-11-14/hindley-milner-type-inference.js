'use strict';

/**
 * Hindley-Milner type inference for a small expression language.
 *
 * Implements Algorithm W's essential machinery:
 * fresh type variables, substitution through destructive unification,
 * occurs-check, free-variable calculation, let-generalization and
 * polymorphic instantiation.
 *
 * Supported expressions: int, bool, string, variable, lambda, application,
 * let, if, homogeneous lists, and a small set of typed binary operators.
 * Recursive let-bindings and user-defined algebraic data types are omitted.
 */

function typeVariable(id) {
  return { tag: 'var', id, instance: null };
}

function typeConstructor(name, args = []) {
  return { tag: 'con', name, args };
}

function functionType(from, to) {
  return typeConstructor('->', [from, to]);
}

function listType(element) {
  return typeConstructor('List', [element]);
}

function prune(type) {
  if (type.tag === 'var' && type.instance) {
    type.instance = prune(type.instance);
    return type.instance;
  }
  return type;
}

function occurs(variable, type) {
  type = prune(type);
  if (type.tag === 'var') return type.id === variable.id;
  return type.args.some((argument) => occurs(variable, argument));
}

function unify(left, right) {
  left = prune(left);
  right = prune(right);

  if (left === right) return;
  if (left.tag === 'var') {
    if (occurs(left, right)) {
      throw new TypeError('Infinite type: occurs check failed');
    }
    left.instance = right;
    return;
  }
  if (right.tag === 'var') {
    unify(right, left);
    return;
  }
  if (left.name !== right.name || left.args.length !== right.args.length) {
    throw new TypeError('Cannot unify ' + formatType(left) + ' with ' +
      formatType(right));
  }
  for (let index = 0; index < left.args.length; index += 1) {
    unify(left.args[index], right.args[index]);
  }
}

function freeTypeVariables(type, result = new Set()) {
  type = prune(type);
  if (type.tag === 'var') {
    result.add(type.id);
  } else {
    for (const argument of type.args) freeTypeVariables(argument, result);
  }
  return result;
}

function freeEnvironmentVariables(environment) {
  const result = new Set();
  for (const scheme of environment.values()) {
    const variables = freeTypeVariables(scheme.type);
    for (const quantified of scheme.variables) variables.delete(quantified);
    for (const id of variables) result.add(id);
  }
  return result;
}

function generalize(environment, type) {
  const environmentVariables = freeEnvironmentVariables(environment);
  const variables = [...freeTypeVariables(type)]
    .filter((id) => !environmentVariables.has(id));
  return { type, variables };
}

function instantiate(scheme, fresh) {
  const replacements = new Map(scheme.variables.map((id) => [id, fresh()]));

  function copy(type) {
    type = prune(type);
    if (type.tag === 'var') return replacements.get(type.id) || type;
    return typeConstructor(type.name, type.args.map(copy));
  }

  return copy(scheme.type);
}

function formatType(type) {
  const names = new Map();
  let nextName = 0;
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';

  function variableName(id) {
    if (!names.has(id)) {
      const index = nextName++;
      const base = alphabet[index % alphabet.length];
      const suffix = Math.floor(index / alphabet.length);
      names.set(id, base + (suffix ? suffix : ''));
    }
    return names.get(id);
  }

  function render(current, parentPrecedence = 0) {
    current = prune(current);
    if (current.tag === 'var') return variableName(current.id);

    if (current.name === '->') {
      const text = render(current.args[0], 1) + ' -> ' +
        render(current.args[1], 0);
      return parentPrecedence > 0 ? '(' + text + ')' : text;
    }
    if (current.name === 'List') return '[' + render(current.args[0]) + ']';
    if (current.args.length === 0) return current.name;
    return current.name + '<' + current.args.map((arg) => render(arg)).join(', ') + '>';
  }

  return render(type);
}

function makeFreshGenerator() {
  let id = 0;
  return () => typeVariable(++id);
}

function createInitialEnvironment() {
  const environment = new Map();
  const int = typeConstructor('int');
  const bool = typeConstructor('bool');
  const string = typeConstructor('string');

  environment.set('not', { type: functionType(bool, bool), variables: [] });
  environment.set('succ', { type: functionType(int, int), variables: [] });
  environment.set('length', {
    type: functionType(listType(typeVariable(-10)), int),
    variables: [-10]
  });
  environment.set('isEmpty', {
    type: functionType(listType(typeVariable(-11)), bool),
    variables: [-11]
  });

  const a = typeVariable(-20);
  const b = typeVariable(-21);
  environment.set('map', {
    type: functionType(
      functionType(a, b),
      functionType(listType(a), listType(b))
    ),
    variables: [-20, -21]
  });

  const c = typeVariable(-22);
  environment.set('head', {
    type: functionType(listType(c), c),
    variables: [-22]
  });
  environment.set('showString', {
    type: functionType(string, string),
    variables: []
  });

  return environment;
}

function infer(expression, environment, fresh) {
  const int = () => typeConstructor('int');
  const bool = () => typeConstructor('bool');
  const string = () => typeConstructor('string');

  switch (expression.kind) {
    case 'int':
      if (!Number.isInteger(expression.value)) {
        throw new TypeError('Integer literal must be an integer');
      }
      return int();

    case 'bool':
      return bool();

    case 'string':
      return string();

    case 'var': {
      const scheme = environment.get(expression.name);
      if (!scheme) throw new ReferenceError('Unbound variable: ' + expression.name);
      return instantiate(scheme, fresh);
    }

    case 'lambda': {
      const parameterType = fresh();
      const nested = new Map(environment);
      nested.set(expression.parameter, {
        type: parameterType,
        variables: []
      });
      return functionType(
        parameterType,
        infer(expression.body, nested, fresh)
      );
    }

    case 'apply': {
      const function = infer(expression.fn, environment, fresh);
      const argument = infer(expression.argument, environment, fresh);
      const result = fresh();
      unify(function, functionType(argument, result));
      return prune(result);
    }

    case 'let': {
      const valueType = infer(expression.value, environment, fresh);
      const nested = new Map(environment);
      nested.set(expression.name, generalize(environment, valueType));
      return infer(expression.body, nested, fresh);
    }

    case 'if': {
      const condition = infer(expression.condition, environment, fresh);
      unify(condition, bool());
      const consequent = infer(expression.then, environment, fresh);
      const alternate = infer(expression.otherwise, environment, fresh);
      unify(consequent, alternate);
      return prune(consequent);
    }

    case 'list': {
      const elementType = fresh();
      for (const item of expression.items) {
        unify(elementType, infer(item, environment, fresh));
      }
      return listType(prune(elementType));
    }

    case 'binary': {
      const left = infer(expression.left, environment, fresh);
      const right = infer(expression.right, environment, fresh);
      const operator = expression.operator;

      if (operator === '+' || operator === '-' ||
          operator === '*' || operator === '/') {
        unify(left, int());
        unify(right, int());
        return int();
      }
      if (operator === '&&' || operator === '||') {
        unify(left, bool());
        unify(right, bool());
        return bool();
      }
      if (operator === '<') {
        unify(left, int());
        unify(right, int());
        return bool();
      }
      if (operator === '==') {
        unify(left, right);
        return bool();
      }
      throw new SyntaxError('Unsupported binary operator: ' + operator);
    }

    default:
      throw new SyntaxError('Unknown expression kind: ' + expression.kind);
  }
}

const expression = Object.freeze({
  int: (value) => ({ kind: 'int', value }),
  bool: (value) => ({ kind: 'bool', value }),
  string: (value) => ({ kind: 'string', value }),
  variable: (name) => ({ kind: 'var', name }),
  lambda: (parameter, body) => ({ kind: 'lambda', parameter, body }),
  apply: (fn, argument) => ({ kind: 'apply', fn, argument }),
  let: (name, value, body) => ({ kind: 'let', name, value, body }),
  if: (condition, then, otherwise) => ({
    kind: 'if', condition, then, otherwise
  }),
  list: (items) => ({ kind: 'list', items }),
  binary: (operator, left, right) => ({
    kind: 'binary', operator, left, right
  })
});

function inferType(ast, options = {}) {
  const environment = options.environment || createInitialEnvironment();
  const fresh = makeFreshGenerator();
  return formatType(infer(ast, environment, fresh));
}

function runTests() {
  const assert = require('node:assert/strict');
  const e = expression;

  const identity = e.lambda('x', e.variable('x'));
  const polymorphicUse = e.let(
    'id',
    identity,
    e.if(
      e.apply(e.variable('id'), e.bool(true)),
      e.apply(e.variable('id'), e.int(7)),
      e.int(0)
    )
  );
  assert.equal(inferType(polymorphicUse), 'int');

  const increment = e.lambda(
    'x',
    e.binary('+', e.variable('x'), e.int(1))
  );
  const mapped = e.apply(
    e.apply(e.variable('map'), increment),
    e.list([e.int(2), e.int(3), e.int(4)])
  );
  assert.equal(inferType(mapped), '[int]');

  const compose = e.lambda('f',
    e.lambda('g',
      e.lambda('x',
        e.apply(e.variable('f'), e.apply(e.variable('g'), e.variable('x')))
      )
    )
  );
  assert.match(inferType(compose), /->/);

  assert.equal(inferType(e.list([])), '[a]');
  assert.equal(inferType(e.apply(e.variable('not'), e.bool(false))), 'bool');
  assert.throws(() => inferType(e.apply(
    e.lambda('x', e.apply(e.variable('x'), e.variable('x'))),
    identity
  )), /Infinite type/);
  assert.throws(() => inferType(e.binary('+', e.int(1), e.bool(true))), /Cannot unify/);
  assert.throws(() => inferType(e.variable('missing')), /Unbound variable/);

  console.log('Hindley-Milner type inference: all tests passed');
}

module.exports = {
  expression,
  inferType,
  formatType,
  createInitialEnvironment
};

if (require.main === module) runTests();
