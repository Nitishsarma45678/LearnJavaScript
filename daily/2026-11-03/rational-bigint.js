'use strict';

const assert = require('node:assert/strict');

function absBigInt(value) {
  return value < 0n ? -value : value;
}

function gcd(a, b) {
  a = absBigInt(a);
  b = absBigInt(b);
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function asRational(value) {
  return value instanceof Rational ? value : new Rational(value);
}

/**
 * Exact fraction arithmetic. The denominator is always positive and each
 * instance is reduced to lowest terms.
 */
class Rational {
  constructor(numerator, denominator = 1n) {
    let n = BigInt(numerator);
    let d = BigInt(denominator);
    if (d === 0n) throw new RangeError('denominator cannot be zero');
    if (d < 0n) { n = -n; d = -d; }

    const divisor = gcd(n, d);
    this.n = n / divisor;
    this.d = d / divisor;
    Object.freeze(this);
  }

  static fromDecimal(input) {
    const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(String(input));
    if (!match) throw new TypeError('invalid decimal string');

    const sign = match[1] === '-' ? -1n : 1n;
    const fraction = match[3] || '';
    const exponent = Number(match[4] || 0);
    if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 10000) {
      throw new RangeError('decimal exponent is outside the supported range');
    }

    let numerator = sign * BigInt(match[2] + fraction);
    const scale = fraction.length - exponent;
    let denominator = 1n;
    if (scale >= 0) denominator = 10n ** BigInt(scale);
    else numerator *= 10n ** BigInt(-scale);
    return new Rational(numerator, denominator);
  }

  add(other) {
    const rhs = asRational(other);
    return new Rational(this.n * rhs.d + rhs.n * this.d, this.d * rhs.d);
  }

  subtract(other) {
    const rhs = asRational(other);
    return new Rational(this.n * rhs.d - rhs.n * this.d, this.d * rhs.d);
  }

  multiply(other) {
    const rhs = asRational(other);
    return new Rational(this.n * rhs.n, this.d * rhs.d);
  }

  divide(other) {
    const rhs = asRational(other);
    if (rhs.n === 0n) throw new RangeError('division by zero');
    return new Rational(this.n * rhs.d, this.d * rhs.n);
  }

  compare(other) {
    const rhs = asRational(other);
    const difference = this.n * rhs.d - rhs.n * this.d;
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
  }

  toString() {
    return this.d === 1n ? String(this.n) : `${this.n}/${this.d}`;
  }

  /** Decimal rendering rounded half away from zero. */
  toDecimal(places = 2) {
    if (!Number.isInteger(places) || places < 0 || places > 1000) {
      throw new RangeError('places must be an integer from 0 to 1000');
    }
    const factor = 10n ** BigInt(places);
    const scaled = absBigInt(this.n) * factor;
    let quotient = scaled / this.d;
    const remainder = scaled % this.d;
    if (remainder * 2n >= this.d) quotient++;

    const sign = this.n < 0n ? '-' : '';
    if (places === 0) return sign + quotient;
    const digits = String(quotient).padStart(places + 1, '0');
    return sign + digits.slice(0, -places) + '.' + digits.slice(-places);
  }
}

const third = new Rational(1n, 3n);
assert.equal(third.add(new Rational(1n, 6n)).toString(), '1/2');
assert.equal(new Rational(7n, 8n).multiply(4n).toString(), '7/2');
assert.equal(new Rational(5n, 6n).subtract(new Rational(1n, 3n)).toString(), '1/2');
assert.equal(new Rational(3n, 4n).divide(new Rational(9n, 10n)).toString(), '5/6');
assert.equal(Rational.fromDecimal('-12.50e-1').toString(), '-5/4');
assert.equal(new Rational(1n, 8n).toDecimal(2), '0.13');
assert.equal(new Rational(-247n, 200n).toDecimal(2), '-1.24');
assert.equal(new Rational(2n, 3n).compare(new Rational(3n, 4n)), -1);
assert.throws(() => new Rational(1n, 0n), RangeError);
assert.throws(() => new Rational(1n).divide(0n), RangeError);
assert.throws(() => Rational.fromDecimal('1/2'), TypeError);

console.log('BigInt rational arithmetic tests passed');
