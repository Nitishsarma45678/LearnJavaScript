'use strict';

// Exercise: decode arbitrarily chunked UTF-8 input into newline-delimited JSON.
// A multi-byte code point may be split across chunks; CRLF and a final line
// without a trailing newline must also work.

class NdjsonDecoder {
  constructor({ maxLineLength = 1_000_000 } = {}) {
    if (!Number.isInteger(maxLineLength) || maxLineLength < 1) throw new RangeError('invalid line limit');
    this.decoder = new TextDecoder('utf-8', { fatal: true });
    this.buffer = '';
    this.lineNumber = 0;
    this.maxLineLength = maxLineLength;
    this.finished = false;
  }

  push(chunk) {
    if (this.finished) throw new Error('decoder is already finished');
    if (!(chunk instanceof Uint8Array)) throw new TypeError('chunk must be a Uint8Array');
    this.buffer += this.decoder.decode(chunk, { stream: true });
    return this.extractLines(false);
  }

  finish() {
    if (this.finished) return [];
    this.finished = true;
    this.buffer += this.decoder.decode();
    return this.extractLines(true);
  }

  extractLines(final) {
    const records = [];
    let newline;
    while ((newline = this.buffer.indexOf('\n')) !== -1) {
      let line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      records.push(this.parseLine(line));
    }
    if (this.buffer.length > this.maxLineLength) throw new RangeError('NDJSON line exceeds configured limit');
    if (final && this.buffer.length) {
      const line = this.buffer.endsWith('\r') ? this.buffer.slice(0, -1) : this.buffer;
      this.buffer = '';
      records.push(this.parseLine(line));
    }
    return records;
  }

  parseLine(line) {
    this.lineNumber++;
    if (!line.trim()) return null;
    if (line.length > this.maxLineLength) throw new RangeError('NDJSON line exceeds configured limit');
    try { return JSON.parse(line); }
    catch (error) {
      error.message = 'invalid JSON on line ' + this.lineNumber + ': ' + error.message;
      throw error;
    }
  }
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  const { TextEncoder } = require('node:util');
  const encoder = new TextEncoder();
  const bytes = encoder.encode('{"name":"A😀"}\r\n\n{"n":2}');
  const decoder = new NdjsonDecoder();
  const first = decoder.push(bytes.slice(0, 12));
  const second = decoder.push(bytes.slice(12, 17));
  const third = decoder.push(bytes.slice(17));
  const last = decoder.finish();
  assert.deepEqual([...first, ...second, ...third, ...last], [{ name: 'A😀' }, null, { n: 2 }]);
  assert.throws(() => decoder.push(encoder.encode('{}')), /finished/);

  const broken = new NdjsonDecoder();
  broken.push(encoder.encode('{"ok":true}\n{bad}\n'));
  assert.throws(() => broken.finish(), /line 2/);
  assert.throws(() => new NdjsonDecoder({ maxLineLength: 2 }).push(encoder.encode('long')), RangeError);
  console.log('incremental NDJSON decoder: all tests passed');
}

module.exports = { NdjsonDecoder };
