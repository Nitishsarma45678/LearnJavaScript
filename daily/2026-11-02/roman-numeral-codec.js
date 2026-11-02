const assert = require('node:assert/strict');

const TOKENS = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
  [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
];

function toRoman(number) {
  if (!Number.isInteger(number) || number < 1 || number > 3999) {
    throw new RangeError('Roman numerals support integers from 1 to 3999');
  }
  let remaining = number;
  let result = '';
  for (const [value, symbol] of TOKENS) {
    while (remaining >= value) {
      result += symbol;
      remaining -= value;
    }
  }
  return result;
}

function fromRoman(input) {
  if (typeof input !== 'string' || input.length === 0) {
    throw new TypeError('Expected a non-empty uppercase Roman numeral');
  }
  const canonicalPattern = /^(?=.)M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
  if (!canonicalPattern.test(input)) throw new SyntaxError('Invalid Roman numeral');

  const values = new Map(TOKENS.map(([value, symbol]) => [symbol, value]));
  let total = 0;
  for (let i = 0; i < input.length; i++) {
    const current = values.get(input[i]);
    const next = values.get(input[i + 1]) || 0;
    total += current < next ? -current : current;
  }
  if (toRoman(total) !== input) throw new SyntaxError('Non-canonical Roman numeral');
  return total;
}

assert.equal(toRoman(1994), 'MCMXCIV');
assert.equal(toRoman(3999), 'MMMCMXCIX');
assert.equal(fromRoman('MCMXCIV'), 1994);
assert.equal(fromRoman('XLII'), 42);
for (const invalid of ['IIII', 'IC', 'VX', 'MMMM', 'xiv', '']) {
  assert.throws(() => fromRoman(invalid));
}
assert.throws(() => toRoman(0), RangeError);
assert.throws(() => toRoman(4.5), RangeError);
console.log('Roman numeral codec tests passed');