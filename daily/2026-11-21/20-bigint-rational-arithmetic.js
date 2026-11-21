// Exercise: Implement exact rational arithmetic with BigInt.
// Normalize signs and greatest common divisors, reject division by zero, and support
// arithmetic, comparison, integer powers, and stable string formatting.

function gcd(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

class Rational {
  constructor(numerator, denominator = 1n) {
    let n = BigInt(numerator);
    let d = BigInt(denominator);
    if (d === 0n) throw new RangeError("denominator cannot be zero");
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const divisor = gcd(n, d);
    this.numerator = n / divisor;
    this.denominator = d / divisor;
    Object.freeze(this);
  }

  add(other) {
    other = Rational.from(other);
    return new Rational(
      this.numerator * other.denominator + other.numerator * this.denominator,
      this.denominator * other.denominator
    );
  }

  subtract(other) {
    other = Rational.from(other);
    return new Rational(
      this.numerator * other.denominator - other.numerator * this.denominator,
      this.denominator * other.denominator
    );
  }

  multiply(other) {
    other = Rational.from(other);
    return new Rational(
      this.numerator * other.numerator,
      this.denominator * other.denominator
    );
  }

  divide(other) {
    other = Rational.from(other);
    if (other.numerator === 0n) throw new RangeError("division by zero");
    return new Rational(
      this.numerator * other.denominator,
      this.denominator * other.numerator
    );
  }

  compare(other) {
    other = Rational.from(other);
    const left = this.numerator * other.denominator;
    const right = other.numerator * this.denominator;
    return left < right ? -1 : left > right ? 1 : 0;
  }

  equals(other) {
    return this.compare(other) === 0;
  }

  pow(exponent) {
    if (!Number.isSafeInteger(exponent)) throw new TypeError("exponent must be a safe integer");
    if (exponent === 0) return new Rational(1n);
    if (exponent < 0 && this.numerator === 0n) {
      throw new RangeError("zero cannot have a negative exponent");
    }
    const power = BigInt(Math.abs(exponent));
    return exponent > 0
      ? new Rational(this.numerator ** power, this.denominator ** power)
      : new Rational(this.denominator ** power, this.numerator ** power);
  }

  toNumber() {
    return Number(this.numerator) / Number(this.denominator);
  }

  toString() {
    return this.denominator === 1n
      ? this.numerator.toString()
      : this.numerator.toString() + "/" + this.denominator.toString();
  }

  static from(value) {
    return value instanceof Rational ? value : new Rational(value);
  }
}

// Tests
const assert = require("node:assert/strict");
const half = new Rational(2n, 4n);
assert.equal(half.toString(), "1/2");
assert.equal(new Rational(1n, -3n).toString(), "-1/3");
assert.equal(half.add(new Rational(1n, 3n)).toString(), "5/6");
assert.equal(half.subtract(new Rational(1n, 6n)).toString(), "1/3");
assert.equal(half.multiply(new Rational(8n, 3n)).toString(), "4/3");
assert.equal(half.divide(new Rational(3n, 4n)).toString(), "2/3");
assert.equal(new Rational(2n, 3n).compare(new Rational(3n, 4n)), -1);
assert.equal(new Rational(2n, 3n).pow(3).toString(), "8/27");
assert.equal(new Rational(2n, 3n).pow(-2).toString(), "9/4");
assert.throws(() => new Rational(1n, 0n), RangeError);
assert.throws(() => half.divide(0n), RangeError);
console.log("BigInt rational arithmetic tests passed");
