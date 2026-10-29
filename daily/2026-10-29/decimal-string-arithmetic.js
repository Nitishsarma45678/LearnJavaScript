"use strict";

const assert = require("node:assert/strict");

/*
 * Exact fixed-point decimal arithmetic using decimal strings only.
 * No conversion of the full operand to Number or BigInt is performed.
 * Accepted syntax: 12, -12.34, +.5, 5. and leading zeroes.
 */

function parseDecimal(value) {
  if (typeof value !== "string" ||
      !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) {
    throw new TypeError("expected a decimal string");
  }

  let text = value;
  let sign = 1;
  if (text[0] === "-" || text[0] === "+") {
    if (text[0] === "-") sign = -1;
    text = text.slice(1);
  }

  const parts = text.split(".");
  const integerPart = (parts[0] || "0").replace(/^0+(?=\d)/, "");
  const fractionPart = (parts[1] || "").replace(/0+$/, "");
  const digits = (integerPart + fractionPart).replace(/^0+/, "") || "0";
  const scale = fractionPart.length;

  return { sign: digits === "0" ? 1 : sign, digits, scale };
}

function normalizeDigits(value) {
  return value.replace(/^0+/, "") || "0";
}

function compareUnsigned(a, b) {
  a = normalizeDigits(a);
  b = normalizeDigits(b);
  if (a.length !== b.length) return a.length < b.length ? -1 : 1;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function addUnsigned(a, b) {
  let i = a.length - 1;
  let j = b.length - 1;
  let carry = 0;
  let output = "";
  while (i >= 0 || j >= 0 || carry) {
    const x = i >= 0 ? a.charCodeAt(i--) - 48 : 0;
    const y = j >= 0 ? b.charCodeAt(j--) - 48 : 0;
    const sum = x + y + carry;
    output = String(sum % 10) + output;
    carry = Math.floor(sum / 10);
  }
  return normalizeDigits(output);
}

// Requires a >= b.
function subtractUnsigned(a, b) {
  let i = a.length - 1;
  let j = b.length - 1;
  let borrow = 0;
  let output = "";
  while (i >= 0) {
    let digit = a.charCodeAt(i--) - 48 - borrow;
    const other = j >= 0 ? b.charCodeAt(j--) - 48 : 0;
    if (digit < other) {
      digit += 10;
      borrow = 1;
    } else {
      borrow = 0;
    }
    output = String(digit - other) + output;
  }
  return normalizeDigits(output);
}

function multiplyUnsigned(a, b) {
  if (a === "0" || b === "0") return "0";
  const accum = Array(a.length + b.length).fill(0);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      accum[i + j + 1] += (a.charCodeAt(i) - 48) * (b.charCodeAt(j) - 48);
    }
  }
  for (let i = accum.length - 1; i > 0; i--) {
    accum[i - 1] += Math.floor(accum[i] / 10);
    accum[i] %= 10;
  }
  return normalizeDigits(accum.join(""));
}

function formatDecimal(sign, digits, scale) {
  digits = normalizeDigits(digits);
  if (digits === "0") return "0";

  let padded = digits.padStart(scale + 1, "0");
  let output;
  if (scale === 0) {
    output = padded;
  } else {
    const splitAt = padded.length - scale;
    const integerPart = padded.slice(0, splitAt);
    const fractionPart = padded.slice(splitAt).replace(/0+$/, "");
    output = fractionPart ? integerPart + "." + fractionPart : integerPart;
  }
  return (sign < 0 ? "-" : "") + output;
}

function addParsed(left, right) {
  const scale = Math.max(left.scale, right.scale);
  const a = left.digits + "0".repeat(scale - left.scale);
  const b = right.digits + "0".repeat(scale - right.scale);

  if (left.sign === right.sign) {
    return formatDecimal(left.sign, addUnsigned(a, b), scale);
  }

  const comparison = compareUnsigned(a, b);
  if (comparison === 0) return "0";
  if (comparison > 0) {
    return formatDecimal(left.sign, subtractUnsigned(a, b), scale);
  }
  return formatDecimal(right.sign, subtractUnsigned(b, a), scale);
}

function addDecimal(a, b) {
  return addParsed(parseDecimal(a), parseDecimal(b));
}

function subtractDecimal(a, b) {
  const left = parseDecimal(a);
  const right = parseDecimal(b);
  right.sign *= -1;
  return addParsed(left, right);
}

function multiplyDecimal(a, b) {
  const left = parseDecimal(a);
  const right = parseDecimal(b);
  return formatDecimal(
    left.sign * right.sign,
    multiplyUnsigned(left.digits, right.digits),
    left.scale + right.scale
  );
}

// Addition and subtraction across signs and different scales.
assert.equal(addDecimal("999999999999999999999", "1"), "1000000000000000000000");
assert.equal(addDecimal("-1.25", ".5"), "-0.75");
assert.equal(addDecimal("00012.3400", "0.66"), "13");
assert.equal(addDecimal("-7.5", "-2.25"), "-9.75");
assert.equal(subtractDecimal("1000.001", "0.002"), "999.999");
assert.equal(subtractDecimal("3", "8.125"), "-5.125");
assert.equal(subtractDecimal("-4.5", "-4.5"), "0");

// Grade-school multiplication with exact decimal placement.
assert.equal(multiplyDecimal("0.1", "0.2"), "0.02");
assert.equal(multiplyDecimal("-12.5", "2.4"), "-30");
assert.equal(multiplyDecimal("999999999999", "999999999999"), "999999999998000000000001");
assert.equal(multiplyDecimal(".005", ".2"), "0.001");
assert.equal(multiplyDecimal("-0.00", "123456"), "0");

assert.throws(() => addDecimal("1e3", "2"), TypeError);
assert.throws(() => multiplyDecimal("NaN", "2"), TypeError);

console.log("decimal-string-arithmetic: all assertions passed");
