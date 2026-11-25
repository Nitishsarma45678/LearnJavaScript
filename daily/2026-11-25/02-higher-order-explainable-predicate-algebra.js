'use strict';

// Exercise: build reusable validation rules that return both a decision and
// a trace. Combinators must short-circuit while preserving useful diagnostics.

const pass = () => ({ ok: true, issues: [] });
const fail = (path, message, actual) => ({ ok: false, issues: [{ path, message, actual }] });

function atPath(value, path) {
  if (path === '') return value;
  return path.split('.').reduce((current, key) =>
    current == null ? undefined : current[key], value);
}

function field(path, predicate, message) {
  return value => {
    const actual = atPath(value, path);
    return predicate(actual) ? pass() : fail(path, message, actual);
  };
}

function allOf(...rules) {
  return value => {
    const issues = [];
    for (const rule of rules) {
      const result = rule(value);
      if (!result.ok) issues.push(...result.issues);
    }
    return { ok: issues.length === 0, issues };
  };
}

function anyOf(...rules) {
  return value => {
    const failures = [];
    for (const rule of rules) {
      const result = rule(value);
      if (result.ok) return pass();
      failures.push(...result.issues);
    }
    return { ok: false, issues: [{ path: '', message: 'no alternative matched', causes: failures }] };
  };
}

function negate(rule, message = 'negated rule matched') {
  return value => rule(value).ok ? fail('', message, value) : pass();
}

function optional(rule) {
  return value => value === undefined || value === null ? pass() : rule(value);
}

const isString = value => typeof value === 'string';
const isFiniteNumber = value => typeof value === 'number' && Number.isFinite(value);
const minLength = size => value => isString(value) && value.length >= size;
const oneOf = (...allowed) => value => allowed.includes(value);
const greaterThan = minimum => value => isFiniteNumber(value) && value > minimum;

if (require.main === module) {
  const assert = require('node:assert/strict');
  const userRule = allOf(
    field('profile.name', isString, 'must be a string'),
    field('profile.name', minLength(3), 'must contain at least 3 characters'),
    field('age', greaterThan(17), 'must be an adult'),
    field('role', oneOf('admin', 'editor', 'viewer'), 'unknown role'),
    field('nickname', optional(field('', isString, 'nickname must be text')), 'invalid nickname')
  );

  assert.equal(userRule({ profile: { name: 'Ada' }, age: 31, role: 'admin' }).ok, true);
  assert.equal(userRule({ profile: { name: 'Ada' }, age: 31, role: 'admin', nickname: 'Ace' }).ok, true);
  assert.equal(userRule({ profile: { name: 'Ada' }, age: 31, role: 'admin', nickname: 42 }).ok, false);
  const invalid = userRule({ profile: { name: 'Al' }, age: 12, role: 'root' });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.issues.length, 3);

  let calls = 0;
  const first = () => { calls++; return pass(); };
  const second = () => { calls++; return fail('x', 'no'); };
  assert.equal(anyOf(first, second)({}).ok, true);
  assert.equal(calls, 1);
  assert.equal(negate(field('enabled', Boolean, 'enabled'))({ enabled: false }).ok, true);
  console.log('predicate algebra: all tests passed');
}

module.exports = { allOf, anyOf, negate, optional, field, pass, fail };
