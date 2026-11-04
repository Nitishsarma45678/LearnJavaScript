'use strict';

const assert = require('node:assert/strict');

function toBigInt(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  throw new TypeError('Polynomial coefficients must be BigInts or safe integers');
}

function normalize(coefficients) {
  if (!Array.isArray(coefficients)) throw new TypeError('coefficients must be an array');
  const result = coefficients.map(toBigInt);
  while (result.length > 1 && result[result.length - 1] === 0n) result.pop();
  return result.length ? result : [0n];
}

function add(left, right) {
  const a = normalize(left), b = normalize(right);
  const result = Array.from({ length: Math.max(a.length, b.length) }, (_, i) =>
    (a[i] ?? 0n) + (b[i] ?? 0n));
  return normalize(result);
}

function multiply(left, right) {
  const a = normalize(left), b = normalize(right);
  if ((a.length === 1 && a[0] === 0n) || (b.length === 1 && b[0] === 0n)) return [0n];
  const result = Array(a.length + b.length - 1).fill(0n);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) result[i + j] += a[i] * b[j];
  }
  return normalize(result);
}

function derivative(polynomial) {
  const p = normalize(polynomial);
  if (p.length === 1) return [0n];
  return normalize(p.slice(1).map((coefficient, index) => coefficient * BigInt(index + 1)));
}

function evaluate(polynomial, x) {
  const p = normalize(polynomial);
  const value = toBigInt(x);
  let result = 0n;
  for (let i = p.length - 1; i >= 0; i--) result = result * value + p[i];
  return result;
}

function compose(outer, inner) {
  const p = normalize(outer);
  const q = normalize(inner);
  let result = [0n];
  for (let i = p.length - 1; i >= 0; i--) {
    result = add(multiply(result, q), [p[i]]);
  }
  return result;
}

function divmod(dividend, divisor) {
  let remainder = normalize(dividend);
  const denominator = normalize(divisor);
  if (denominator.length === 1 && denominator[0] === 0n) {
    throw new RangeError('Polynomial division by zero');
  }
  if (remainder.length < denominator.length) {
    return { quotient: [0n], remainder };
  }

  const quotient = Array(remainder.length - denominator.length + 1).fill(0n);
  const divisorLead = denominator[denominator.length - 1];

  while (!(remainder.length === 1 && remainder[0] === 0n) &&
         remainder.length >= denominator.length) {
    const shift = remainder.length - denominator.length;
    const remainderLead = remainder[remainder.length - 1];
    if (remainderLead % divisorLead !== 0n) {
      throw new RangeError('Division would require non-integer coefficients');
    }
    const factor = remainderLead / divisorLead;
    quotient[shift] += factor;
    for (let i = 0; i < denominator.length; i++) {
      remainder[shift + i] -= factor * denominator[i];
    }
    remainder = normalize(remainder);
  }

  return { quotient: normalize(quotient), remainder };
}

if (require.main === module) {
  const polynomial = [-1n, 0n, 1n];
  const factor = [-1n, 1n];
  assert.deepEqual(add([1, 2], [3, -2]), [4n]);
  assert.deepEqual(multiply(factor, [1n, 1n]), [-1n, 0n, 1n]);
  assert.deepEqual(derivative(polynomial), [0n, 2n]);
  assert.equal(evaluate(polynomial, 3n), 8n);
  assert.deepEqual(compose(polynomial, factor), [0n, -2n, 1n]);
  assert.deepEqual(divmod(polynomial, factor), {
    quotient: [1n, 1n],
    remainder: [0n]
  });
  assert.throws(() => divmod([1n, 1n], [0n, 2n]), /non-integer/);
  assert.throws(() => divmod([1n], [0n]), /zero/);
  console.log('BigInt polynomial tests passed');
}

module.exports = { add, multiply, derivative, evaluate, compose, divmod, normalize };
