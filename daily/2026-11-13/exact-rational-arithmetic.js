/**
 * Exact Rational Arithmetic
 * -------------------------
 * Represent fractions exactly with BigInt and normalize every value to a
 * positive denominator and coprime numerator/denominator.
 *
 * Decimal strings are parsed as exact base-10 values ("0.1" is 1/10).
 * Scientific notation is intentionally rejected to keep parsing explicit.
 */

function absBigInt(value) {
  return value < 0n ? -value : value;
}

function gcd(a, b) {
  a = absBigInt(a);
  b = absBigInt(b);
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
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
    this.n = n / divisor;
    this.d = d / divisor;
    Object.freeze(this);
  }

  static from(value) {
    if (value instanceof Rational) return value;
    if (typeof value === "bigint") return new Rational(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new TypeError("number must be finite");
      return parseRational(String(value));
    }
    if (typeof value === "string") return parseRational(value);
    throw new TypeError("value must be a Rational, BigInt, finite number, or string");
  }

  add(other) {
    const r = Rational.from(other);
    return new Rational(this.n * r.d + r.n * this.d, this.d * r.d);
  }

  subtract(other) {
    const r = Rational.from(other);
    return new Rational(this.n * r.d - r.n * this.d, this.d * r.d);
  }

  multiply(other) {
    const r = Rational.from(other);
    // Cross-cancel before multiplying to keep intermediate BigInts smaller.
    const g1 = gcd(this.n, r.d);
    const g2 = gcd(r.n, this.d);
    return new Rational(
      (this.n / g1) * (r.n / g2),
      (this.d / g2) * (r.d / g1)
    );
  }

  divide(other) {
    const r = Rational.from(other);
    if (r.n === 0n) throw new RangeError("division by zero");
    return new Rational(this.n * r.d, this.d * r.n);
  }

  negate() {
    return new Rational(-this.n, this.d);
  }

  abs() {
    return new Rational(absBigInt(this.n), this.d);
  }

  reciprocal() {
    if (this.n === 0n) throw new RangeError("zero has no reciprocal");
    return new Rational(this.d, this.n);
  }

  pow(exponent) {
    if (!Number.isSafeInteger(exponent)) {
      throw new RangeError("exponent must be a safe integer");
    }
    if (exponent === 0) return new Rational(1n);
    if (exponent < 0 && this.n === 0n) {
      throw new RangeError("zero cannot have a negative exponent");
    }
    const power = BigInt(Math.abs(exponent));
    return exponent > 0
      ? new Rational(this.n ** power, this.d ** power)
      : new Rational(this.d ** power, this.n ** power);
  }

  compare(other) {
    const r = Rational.from(other);
    const left = this.n * r.d;
    const right = r.n * this.d;
    return left < right ? -1 : left > right ? 1 : 0;
  }

  equals(other) {
    return this.compare(other) === 0;
  }

  floor() {
    const quotient = this.n / this.d; // BigInt division truncates toward zero.
    return this.n < 0n && this.n % this.d !== 0n ? quotient - 1n : quotient;
  }

  ceil() {
    const quotient = this.n / this.d;
    return this.n > 0n && this.n % this.d !== 0n ? quotient + 1n : quotient;
  }

  round(mode = "half-up") {
    const integer = this.toDecimal(0, mode);
    return new Rational(BigInt(integer));
  }

  /**
   * Convert to a fixed number of decimal places.
   * Modes: trunc, floor, ceil, half-up, half-even.
   */
  toDecimal(places = 2, mode = "half-up") {
    if (!Number.isInteger(places) || places < 0 || places > 1000) {
      throw new RangeError("places must be an integer from 0 to 1000");
    }
    const modes = new Set(["trunc", "floor", "ceil", "half-up", "half-even"]);
    if (!modes.has(mode)) throw new RangeError("unknown rounding mode");

    const scale = 10n ** BigInt(places);
    const scaledNumerator = absBigInt(this.n) * scale;
    let quotient = scaledNumerator / this.d;
    const remainder = scaledNumerator % this.d;
    let increment = false;

    if (remainder !== 0n) {
      if (mode === "floor") increment = this.n < 0n;
      else if (mode === "ceil") increment = this.n > 0n;
      else if (mode === "half-up") increment = remainder * 2n >= this.d;
      else if (mode === "half-even") {
        const twice = remainder * 2n;
        increment = twice > this.d ||
          (twice === this.d && quotient % 2n === 1n);
      }
    }
    if (increment) quotient += 1n;

    const sign = this.n < 0n && quotient !== 0n ? "-" : "";
    if (places === 0) return sign + quotient.toString();
    const whole = quotient / scale;
    const fraction = (quotient % scale).toString().padStart(places, "0");
    return `${sign}${whole}.${fraction}`;
  }

  toContinuedFraction(maxTerms = 64) {
    if (!Number.isInteger(maxTerms) || maxTerms < 1) {
      throw new RangeError("maxTerms must be a positive integer");
    }
    let numerator = absBigInt(this.n);
    let denominator = this.d;
    const terms = [];
    while (denominator !== 0n && terms.length < maxTerms) {
      const quotient = numerator / denominator;
      const remainder = numerator % denominator;
      terms.push(quotient);
      numerator = denominator;
      denominator = remainder;
    }
    if (this.n < 0n) terms[0] = -terms[0];
    return terms;
  }

  toNumber() {
    return Number(this.n) / Number(this.d);
  }

  toString() {
    return this.d === 1n ? this.n.toString() : `${this.n}/${this.d}`;
  }

  toJSON() {
    return { numerator: this.n.toString(), denominator: this.d.toString() };
  }
}

function parseRational(input) {
  if (typeof input !== "string") throw new TypeError("input must be a string");
  const value = input.trim();
  const fraction = /^([+-]?\d+)\s*\/\s*([+-]?\d+)$/.exec(value);
  if (fraction) return new Rational(BigInt(fraction[1]), BigInt(fraction[2]));

  const decimal = /^([+-]?)(\d+)(?:\.(\d*))?$/.exec(value);
  if (!decimal) {
    throw new SyntaxError(`invalid rational literal: ${input}`);
  }
  const sign = decimal[1] === "-" ? -1n : 1n;
  const whole = decimal[2];
  const fractionDigits = decimal[3] || "";
  const denominator = 10n ** BigInt(fractionDigits.length);
  const numerator = BigInt(whole) * denominator +
    BigInt(fractionDigits || "0");
  return new Rational(sign * numerator, denominator);
}

// ------------------------------ Example tests ------------------------------
if (require.main === module) {
  const assert = require("node:assert/strict");

  assert.equal(Rational.from("0.1").add("0.2").toString(), "3/10");
  assert.equal(Rational.from("1/3").add("1/6").toString(), "1/2");
  assert.equal(Rational.from("6/-8").toString(), "-3/4");
  assert.equal(new Rational(12n, 18n).toString(), "2/3");
  assert.equal(Rational.from("7/9").multiply("27/14").toString(), "3/2");
  assert.equal(Rational.from("5/6").divide("10/9").toString(), "3/4");
  assert.equal(Rational.from("-7/3").floor(), -3n);
  assert.equal(Rational.from("-7/3").ceil(), -2n);
  assert.equal(Rational.from("5/2").toDecimal(0, "half-even"), "2");
  assert.equal(Rational.from("7/2").toDecimal(0, "half-even"), "4");
  assert.equal(Rational.from("-1/8").toDecimal(2, "half-up"), "-0.13");
  assert.equal(Rational.from("-1/8").toDecimal(2, "ceil"), "-0.12");
  assert.equal(Rational.from("1/8").toDecimal(2, "floor"), "0.12");
  assert.equal(Rational.from("2/3").pow(-2).toString(), "9/4");
  assert.deepEqual(
    Rational.from("415/93").toContinuedFraction(),
    [4n, 2n, 6n, 7n]
  );
  assert.equal(Rational.from("-10/20").equals("-1/2"), true);
  assert.deepEqual(Rational.from("1.25").toJSON(), {
    numerator: "5", denominator: "4"
  });

  assert.throws(() => new Rational(1n, 0n), RangeError);
  assert.throws(() => Rational.from("1/0").toString(), RangeError);
  assert.throws(() => Rational.from("1e-3"), SyntaxError);
  assert.throws(() => Rational.from("1/2").divide(0), RangeError);
  assert.throws(() => Rational.from(0).reciprocal(), RangeError);

  // Large values remain exact beyond Number's safe integer range.
  const huge = new Rational(900719925474099312345n, 3n);
  assert.equal(huge.multiply(3n).n, 900719925474099312345n);

  console.log("exact-rational-arithmetic: all tests passed");
}

module.exports = { Rational, parseRational, gcd };
