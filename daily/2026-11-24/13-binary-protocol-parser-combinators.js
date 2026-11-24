'use strict';

const assert = require('node:assert/strict');

class ParseError extends Error {
  constructor(offset, message) {
    super(message + ' at byte ' + offset);
    this.name = 'ParseError';
    this.offset = offset;
  }
}

class Parser {
  constructor(run) { this.run = run; }

  parse(input, offset = 0) {
    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
    return this.run(buffer, offset);
  }

  map(transform) {
    return new Parser((buffer, offset) => {
      const result = this.run(buffer, offset);
      return { value: transform(result.value), offset: result.offset };
    });
  }

  chain(nextParser) {
    return new Parser((buffer, offset) => {
      const first = this.run(buffer, offset);
      return nextParser(first.value).run(buffer, first.offset);
    });
  }

  or(other) {
    return new Parser((buffer, offset) => {
      try { return this.run(buffer, offset); }
      catch (firstError) {
        try { return other.run(buffer, offset); }
        catch (secondError) {
          const farthest = secondError.offset > firstError.offset ? secondError : firstError;
          throw farthest;
        }
      }
    });
  }

  many() {
    return new Parser((buffer, offset) => {
      const values = [];
      let cursor = offset;
      while (cursor < buffer.length) {
        let result;
        try { result = this.run(buffer, cursor); }
        catch (error) {
          if (error instanceof ParseError && error.offset === buffer.length && cursor === buffer.length) break;
          throw error;
        }
        if (result.offset <= cursor) throw new Error('many() parser must consume input');
        values.push(result.value);
        cursor = result.offset;
      }
      return { value: values, offset: cursor };
    });
  }
}

const byte = new Parser((buffer, offset) => {
  if (offset + 1 > buffer.length) throw new ParseError(buffer.length, 'Expected one byte');
  return { value: buffer.readUInt8(offset), offset: offset + 1 };
});

const uint16be = new Parser((buffer, offset) => {
  if (offset + 2 > buffer.length) throw new ParseError(buffer.length, 'Expected two bytes');
  return { value: buffer.readUInt16BE(offset), offset: offset + 2 };
});

function take(length) {
  if (!Number.isInteger(length) || length < 0) throw new RangeError('Length must be non-negative');
  return new Parser((buffer, offset) => {
    if (offset + length > buffer.length) throw new ParseError(buffer.length, 'Payload is truncated');
    return { value: buffer.subarray(offset, offset + length), offset: offset + length };
  });
}

function literal(text) {
  const expected = Buffer.from(text, 'utf8');
  return new Parser((buffer, offset) => {
    if (!buffer.subarray(offset, offset + expected.length).equals(expected)) {
      throw new ParseError(offset, 'Expected literal ' + JSON.stringify(text));
    }
    return { value: text, offset: offset + expected.length };
  });
}

function parseAll(parser, input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const result = parser.parse(buffer);
  if (result.offset !== buffer.length) throw new ParseError(result.offset, 'Unexpected trailing bytes');
  return result.value;
}

// A TLV record: one-byte type, two-byte big-endian length, then payload.
const tlv = byte.chain(type => uint16be.chain(length =>
  take(length).map(payload => ({ type, payload: payload.toString('utf8') }))
));
const packet = Buffer.from([1, 0, 2, 65, 66, 2, 0, 1, 67]);
assert.deepEqual(parseAll(tlv.many(), packet), [
  { type: 1, payload: 'AB' },
  { type: 2, payload: 'C' }
]);
assert.equal(parseAll(literal('OK').or(literal('NO')), Buffer.from('NO')), 'NO');
assert.throws(() => parseAll(tlv, Buffer.from([1, 0, 4, 65])), ParseError);
assert.throws(() => parseAll(literal('OK'), Buffer.from('OK!')), /trailing bytes/);
console.log('Binary-parser examples passed.');

module.exports = { ParseError, Parser, byte, uint16be, take, literal, parseAll };
