'use strict';

// Strict CSV parser supporting quoted delimiters, escaped quotes, CRLF,
// and line breaks inside quoted fields. Spaces after a closing quote are
// rejected intentionally so malformed input is not silently normalized.
const assert = require('node:assert/strict');

function parseCSV(input, options = {}) {
  if (typeof input !== 'string') throw new TypeError('input must be a string');

  const delimiter = options.delimiter ?? ',';
  const quote = options.quote ?? '"';
  if (typeof delimiter !== 'string' || delimiter.length !== 1 ||
      typeof quote !== 'string' || quote.length !== 1 ||
      delimiter === quote || /[\r\n]/.test(delimiter) || /[\r\n]/.test(quote)) {
    throw new TypeError('delimiter and quote must be distinct single non-newline characters');
  }

  if (input.length === 0) return [];

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let afterQuote = false;
  let fieldStarted = false;

  const finishField = () => {
    row.push(field);
    field = '';
    fieldStarted = false;
    afterQuote = false;
  };

  const finishRow = () => {
    finishField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char === quote) {
        if (input[i + 1] === quote) {
          field += quote;
          i += 1;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (afterQuote) {
      if (char === delimiter) {
        finishField();
      } else if (char === '\n' || char === '\r') {
        finishRow();
        if (char === '\r' && input[i + 1] === '\n') i += 1;
      } else {
        throw new SyntaxError('unexpected character after closing quote at offset ' + i);
      }
      continue;
    }

    if (char === quote) {
      if (fieldStarted || field.length > 0) {
        throw new SyntaxError('quote inside an unquoted field at offset ' + i);
      }
      inQuotes = true;
      fieldStarted = true;
    } else if (char === delimiter) {
      finishField();
    } else if (char === '\n' || char === '\r') {
      finishRow();
      if (char === '\r' && input[i + 1] === '\n') i += 1;
    } else {
      field += char;
      fieldStarted = true;
    }
  }

  if (inQuotes) throw new SyntaxError('unterminated quoted field');
  if (afterQuote || fieldStarted || field.length > 0 || row.length > 0) {
    finishField();
    rows.push(row);
  }

  return rows;
}

// Example tests
assert.deepEqual(
  parseCSV('name,quote\r\nAlice,"hello, world"\r\nBob,"line 1\nline 2"\r\n'),
  [
    ['name', 'quote'],
    ['Alice', 'hello, world'],
    ['Bob', 'line 1\nline 2']
  ]
);
assert.deepEqual(parseCSV('a,"b""c",'), [['a', 'b"c', '']]);
assert.deepEqual(parseCSV(''), []);
assert.deepEqual(parseCSV('x;y\n1;2', { delimiter: ';' }), [['x', 'y'], ['1', '2']]);
assert.throws(() => parseCSV('a,"unfinished'), SyntaxError);
assert.throws(() => parseCSV('a,"quoted"x'), SyntaxError);
assert.throws(() => parseCSV('ab"cd'), SyntaxError);

console.log('parseCSV tests passed.');
