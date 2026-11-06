'use strict';

const assert = require('node:assert/strict');

/**
 * Incremental RFC-4180-style CSV parser. Quoted fields may contain commas,
 * CR/LF and escaped quotes. Parser state survives arbitrary chunk boundaries.
 * It returns completed records from each write() call to avoid buffering the
 * entire input stream.
 */
class CSVStreamParser {
  constructor() {
    this.field = '';
    this.row = [];
    this.inQuotes = false;
    this.quotePending = false;
    this.closedQuote = false;
    this.skipLF = false;
    this.recordTouched = false;
    this.finished = false;
  }

  write(chunk) {
    if (this.finished) throw new Error('cannot write after finish()');
    if (typeof chunk !== 'string') throw new TypeError('CSV chunks must be strings');
    const completed = [];

    for (const character of chunk) {
      let ch = character;
      if (this.skipLF) {
        this.skipLF = false;
        if (ch === '\n') continue;
      }

      if (this.inQuotes) {
        if (this.quotePending) {
          this.quotePending = false;
          if (ch === '"') {
            this.field += '"'; // doubled quote inside a quoted field
            continue;
          }
          this.inQuotes = false;
          this.closedQuote = true;
          // The current character belongs to the record syntax after the quote.
        } else if (ch === '"') {
          this.quotePending = true;
          continue;
        } else {
          this.field += ch;
          continue;
        }
      }

      if (this.closedQuote) {
        if (ch === ',') {
          this._pushField();
          this.closedQuote = false;
          this.recordTouched = true;
          continue;
        }
        if (ch === '\r' || ch === '\n') {
          this._emitRow(completed);
          this.closedQuote = false;
          if (ch === '\r') this.skipLF = true;
          continue;
        }
        throw this._syntaxError('unexpected character after closing quote');
      }

      if (ch === ',') {
        this._pushField();
        this.recordTouched = true;
      } else if (ch === '\r' || ch === '\n') {
        this._emitRow(completed);
        if (ch === '\r') this.skipLF = true;
      } else if (ch === '"') {
        if (this.field.length !== 0) {
          throw this._syntaxError('quote is only allowed at the beginning of a field');
        }
        this.inQuotes = true;
        this.recordTouched = true;
      } else {
        this.field += ch;
        this.recordTouched = true;
      }
    }
    return completed;
  }

  finish() {
    if (this.finished) throw new Error('finish() may only be called once');
    this.finished = true;
    if (this.quotePending) {
      // A quote at the end of the stream is the closing quote, not an escape.
      this.quotePending = false;
      this.inQuotes = false;
      this.closedQuote = true;
    }
    if (this.inQuotes) throw this._syntaxError('unterminated quoted field');
    const completed = [];
    if (this.recordTouched || this.field.length > 0 || this.row.length > 0 || this.closedQuote) {
      this._emitRow(completed);
    }
    return completed;
  }

  _pushField() {
    this.row.push(this.field);
    this.field = '';
  }

  _emitRow(output) {
    this._pushField();
    output.push(this.row);
    this.row = [];
    this.recordTouched = false;
    this.closedQuote = false;
  }

  _syntaxError(message) {
    return new SyntaxError(`CSV parse error: ${message}`);
  }
}

function parseCSVChunks(chunks) {
  const parser = new CSVStreamParser();
  const rows = [];
  for (const chunk of chunks) rows.push(...parser.write(chunk));
  rows.push(...parser.finish());
  return rows;
}

function runTests() {
  const source = 'name,notes\r\n"Ada","line 1\r\nline 2, ""quoted"""\r\nBob,plain';
  const expected = [
    ['name', 'notes'],
    ['Ada', 'line 1\r\nline 2, "quoted"'],
    ['Bob', 'plain']
  ];
  // Every possible single split must produce the same records.
  for (let split = 0; split <= source.length; split++) {
    assert.deepEqual(parseCSVChunks([source.slice(0, split), source.slice(split)]), expected);
  }
  // One-character chunks exercise quote, CRLF and escaped-quote boundaries.
  assert.deepEqual(parseCSVChunks([...source]), expected);
  assert.deepEqual(parseCSVChunks(['a,,c\n,"",\n']), [
    ['a', '', 'c'], ['', '', '']
  ]);
  assert.deepEqual(parseCSVChunks(['']), []);
  assert.deepEqual(parseCSVChunks(['\n']), [['']]);
  assert.deepEqual(parseCSVChunks(['a,b\r', '\nc,d\r', '\n']), [['a', 'b'], ['c', 'd']]);

  const parser = new CSVStreamParser();
  assert.deepEqual(parser.write('x,"y"'), []);
  assert.deepEqual(parser.finish(), [['x', 'y']]);
  assert.throws(() => parser.write('z'), /after finish/);
  assert.throws(() => parseCSVChunks(['a,"unfinished']), /unterminated quoted field/);
  assert.throws(() => parseCSVChunks(['ab"cd']), /beginning of a field/);
  assert.throws(() => parseCSVChunks(['"ok"x']), /after closing quote/);
  console.log('CSV streaming parser: all tests passed');
}

if (require.main === module) runTests();
module.exports = { CSVStreamParser, parseCSVChunks };
