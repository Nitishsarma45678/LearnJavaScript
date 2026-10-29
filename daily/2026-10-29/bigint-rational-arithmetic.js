// Exact rational arithmetic using BigInt. Every result is reduced to lowest
// terms and its denominator is always positive.

function asBigInt(value, label) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  throw new TypeError(label + ' must be a BigInt or safe integer');
}

function abs(value) {
  return value < 0n ? -value : value;
}

function gcd(a, b) {
  a = abs(a);
  b = abs(b);
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function rational(numerator, denominator = 1n) {
  let n = asBigInt(numerator, 'numerator');
  let d = asBigInt(denominator, 'denominator');
  if (d === 0n) throw new RangeError('denominator cannot be zero');
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const divisor = gcd(n, d) || 1n;
  n /= divisor;
  d /= divisor;
  return Object.freeze({
    numerator: n,
    denominator: d,
    toString() {
      return d === 1n ? n.toString() : n.toString() + '/' + d.toString();
    },
    toNumber() {
      return Number(n) / Number(d);
    }
  });
}

function assertRational(value) {
  if (!value || typeof value.numerator !== 'bigint' || typeof value.denominator !== 'bigint') {
    throw new TypeError('expected a rational value');
  }
}

function add(a, b) {
  assertRational(a); assertRational(b);
  return rational(a.numerator * b.denominator + b.numerator * a.denominator,
    a.denominator * b.denominator);
}
function subtract(a, b) {
  assertRational(a); assertRational(b);
  return rational(a.numerator * b.denominator - b.numerator * a.denominator,
    a.denominator * b.denominator);
}
function multiply(a, b) {
  assertRational(a); assertRational(b);
  // Cross-cancel before multiplication to keep intermediate BigInts smaller.
  const g1 = gcd(a.numerator, b.denominator) || 1n;
  const g2 = gcd(b.numerator, a.denominator) || 1n;
  return rational((a.numerator / g1) * (b.numerator / g2),
    (a.denominator / g2) * (b.denominator / g1));
}
function divide(a, b) {
  assertRational(a); assertRational(b);
  if (b.numerator === 0n) throw new RangeError('cannot divide by zero');
  return rational(a.numerator * b.denominator, a.denominator * b.numerator);
}
function compare(a, b) {
  assertRational(a); assertRational(b);
  const left = a.numerator * b.denominator;
  const right = b.numerator * a.denominator;
  return left < right ? -1 : left > right ? 1 : 0;
}

const assert = require('node:assert/strict');
const r = (n, d = 1n) => rational(n, d);

assert.equal(r(6n, -8n).toString(), '-3/4');
assert.equal(add(r(1n, 3n), r(1n, 6n)).toString(), '1/2');
assert.equal(subtract(r(5n, 6n), r(1n, 4n)).toString(), '7/12');
assert.equal(multiply(r(123456789n, 10n), r(10n, 123456789n)).toString(), '1');
assert.equal(divide(r(-3n, 5n), r(9n, 10n)).toString(), '-2/3');
assert.equal(compare(r(2n, 3n), r(4n, 6n)), 0);
assert.equal(r(0n, 900n).toString(), '0');
assert.throws(() => rational(1n, 0n), RangeError);
assert.throws(() => divide(r(1n), r(0n)), RangeError);
assert.throws(() => rational(1.5), TypeError);

console.log('BigInt rational arithmetic tests passed');
