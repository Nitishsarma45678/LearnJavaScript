'use strict';

/**
 * Incremental JSON lexical tokenizer.
 *
 * Feed arbitrary string chunks with push(). Tokens are emitted as soon as
 * they are complete; partial strings, numbers, and literals remain buffered.
 * This is a tokenizer, not a full JSON grammar validator.
 *
 * Token shape: { type, value, raw, offset }.
 * Offsets count UTF-16 code units from the beginning of the input.
 */

const PUNCTUATION = new Set(['{', '}', '[', ']', ':', ',']);
const NUMBER_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const LITERALS = {
  t: { raw: 'true', type: 'boolean', value: true },
  f: { raw: 'false', type: 'boolean', value: false },
  n: { raw: 'null', type: 'null', value: null }
};

function isWhitespace(character) {
  return character === ' ' || character === '\n' ||
    character === '\r' || character === '\t';
}

function isBoundary(character) {
  return character === undefined || isWhitespace(character) ||
    PUNCTUATION.has(character);
}

class JsonTokenizer {
  constructor() {
    this.buffer = '';
    this.baseOffset = 0;
    this.ended = false;
  }

  push(chunk) {
    if (this.ended) throw new Error('Cannot push after end()');
    if (typeof chunk !== 'string') throw new TypeError('Chunk must be a string');
    this.buffer += chunk;
    return this._drain(false);
  }

  end(chunk = '') {
    if (this.ended) throw new Error('end() has already been called');
    if (typeof chunk !== 'string') throw new TypeError('Chunk must be a string');
    this.buffer += chunk;
    const tokens = this._drain(true);
    this.ended = true;
    return tokens;
  }

  _token(type, value, raw, localOffset) {
    return {
      type,
      value,
      raw,
      offset: this.baseOffset + localOffset
    };
  }

  _drain(final) {
    const tokens = [];
    let index = 0;

    while (index < this.buffer.length) {
      const character = this.buffer[index];

      if (isWhitespace(character)) {
        index += 1;
        continue;
      }

      if (PUNCTUATION.has(character)) {
        tokens.push(this._token('punctuation', character, character, index));
        index += 1;
        continue;
      }

      if (character === '"') {
        const start = index;
        let cursor = index + 1;
        let closed = false;

        while (cursor < this.buffer.length) {
          const current = this.buffer[cursor];
          if (current === '"') {
            closed = true;
            break;
          }
          if (current === '\\') {
            cursor += 2;
          } else {
            cursor += 1;
          }
        }

        if (!closed) {
          if (final) throw new SyntaxError('Unterminated JSON string at offset ' +
            (this.baseOffset + start));
          break;
        }

        const raw = this.buffer.slice(start, cursor + 1);
        let value;
        try {
          value = JSON.parse(raw);
        } catch (error) {
          throw new SyntaxError('Invalid JSON string at offset ' +
            (this.baseOffset + start) + ': ' + error.message);
        }
        tokens.push(this._token('string', value, raw, start));
        index = cursor + 1;
        continue;
      }

      if (character === '-' || (character >= '0' && character <= '9')) {
        const start = index;
        let cursor = index;
        while (cursor < this.buffer.length &&
          /[0-9eE+.-]/.test(this.buffer[cursor])) {
          cursor += 1;
        }

        if (cursor === this.buffer.length && !final) break;
        const raw = this.buffer.slice(start, cursor);
        if (!NUMBER_PATTERN.test(raw)) {
          throw new SyntaxError('Invalid JSON number at offset ' +
            (this.baseOffset + start) + ': ' + raw);
        }
        if (!isBoundary(this.buffer[cursor])) {
          throw new SyntaxError('Invalid character after JSON number at offset ' +
            (this.baseOffset + cursor));
        }
        tokens.push(this._token('number', Number(raw), raw, start));
        index = cursor;
        continue;
      }

      if (Object.hasOwn(LITERALS, character)) {
        const start = index;
        const literal = LITERALS[character];
        const remaining = this.buffer.slice(start);

        if (remaining.length < literal.raw.length) {
          if (literal.raw.startsWith(remaining) && !final) break;
          throw new SyntaxError('Incomplete or invalid JSON literal at offset ' +
            (this.baseOffset + start));
        }

        const raw = this.buffer.slice(start, start + literal.raw.length);
        if (raw !== literal.raw) {
          throw new SyntaxError('Invalid JSON literal at offset ' +
            (this.baseOffset + start));
        }

        const end = start + literal.raw.length;
        if (end === this.buffer.length && !final) break;
        if (!isBoundary(this.buffer[end])) {
          throw new SyntaxError('Invalid character after JSON literal at offset ' +
            (this.baseOffset + end));
        }

        tokens.push(this._token(literal.type, literal.value, raw, start));
        index = end;
        continue;
      }

      throw new SyntaxError('Unexpected character ' + JSON.stringify(character) +
        ' at offset ' + (this.baseOffset + index));
    }

    this.buffer = this.buffer.slice(index);
    this.baseOffset += index;

    if (final && this.buffer.length !== 0) {
      throw new SyntaxError('Incomplete JSON token at offset ' + this.baseOffset);
    }
    return tokens;
  }
}

function tokenizeChunks(chunks) {
  const tokenizer = new JsonTokenizer();
  const tokens = [];
  for (const chunk of chunks) tokens.push(...tokenizer.push(chunk));
  tokens.push(...tokenizer.end());
  return tokens;
}

function runTests() {
  const assert = require('node:assert/strict');
  const source = '{"name":"Ada\\nLovelace","active":true,"score":-1.25e+2,' +
    '"items":[0,false,null,"🙂"]}';
  const expected = tokenizeChunks([source]);

  for (let width = 1; width <= 9; width += 1) {
    const chunks = [];
    for (let index = 0; index < source.length; index += width) {
      chunks.push(source.slice(index, index + width));
    }
    assert.deepEqual(tokenizeChunks(chunks), expected);
  }

  assert.equal(expected.find((token) => token.type === 'number').value, -125);
  assert.equal(expected.filter((token) => token.type === 'boolean').length, 2);
  assert.equal(expected.find((token) => token.value === 'Ada\nLovelace').value,
    'Ada\nLovelace');

  const tokenizer = new JsonTokenizer();
  assert.deepEqual(tokenizer.push('{"n":1'), [
    { type: 'punctuation', value: '{', raw: '{', offset: 0 },
    { type: 'string', value: 'n', raw: '"n"', offset: 1 },
    { type: 'punctuation', value: ':', raw: ':', offset: 4 }
  ]);
  assert.deepEqual(tokenizer.push('2,'), [
    { type: 'number', value: 12, raw: '12', offset: 5 },
    { type: 'punctuation', value: ',', raw: ',', offset: 7 }
  ]);
  assert.deepEqual(tokenizer.end('true}'), [
    { type: 'boolean', value: true, raw: 'true', offset: 8 },
    { type: 'punctuation', value: '}', raw: '}', offset: 12 }
  ]);
  assert.throws(() => tokenizer.push(' '), /after end/);

  assert.throws(() => tokenizeChunks(['"unfinished']), /Unterminated/);
  assert.throws(() => tokenizeChunks(['01 ']), /Invalid JSON number/);
  assert.throws(() => tokenizeChunks(['truex']), /after JSON literal/);
  assert.throws(() => tokenizeChunks(['"bad\nstring"']), /Invalid JSON string/);
  assert.throws(() => tokenizeChunks(['1e+']), /Invalid JSON number/);

  console.log('Streaming JSON tokenizer: all tests passed');
}

module.exports = { JsonTokenizer, tokenizeChunks };

if (require.main === module) runTests();
