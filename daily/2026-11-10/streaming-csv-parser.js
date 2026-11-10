/*
 * Streaming CSV Parser
 * --------------------
 * Incrementally parses RFC-4180-style CSV across arbitrary string chunks.
 * It preserves parser state across chunk boundaries, including CRLF pairs,
 * quoted newlines, escaped quotes, and a quote split between chunks.
 *
 * Strictness: after a closing quote, only a delimiter or record terminator
 * is accepted. A quote inside an unquoted field is rejected.
 */

"use strict";

const assert = require("node:assert/strict");

class StreamingCSVParser {
  constructor({ delimiter = "," } = {}) {
    if (
      typeof delimiter !== "string" ||
      delimiter.length !== 1 ||
      delimiter === '"' ||
      delimiter === "\r" ||
      delimiter === "\n"
    ) {
      throw new TypeError("delimiter must be one safe character");
    }

    this.delimiter = delimiter;
    this.field = "";
    this.row = [];
    this.inQuotes = false;
    this.quotePending = false;
    this.afterQuote = false;
    this.skipLF = false;
    this.recordTouched = false;
    this.atStart = true;
    this.finished = false;
  }

  _emitRecord(output) {
    this.row.push(this.field);
    output.push(this.row);
    this.field = "";
    this.row = [];
    this.recordTouched = false;
    this.afterQuote = false;
  }

  push(chunk, { final = false } = {}) {
    if (this.finished) {
      throw new Error("Cannot push after the parser has been finalized");
    }
    if (typeof chunk !== "string") {
      throw new TypeError("CSV chunks must be strings");
    }

    const output = [];
    const delimiter = this.delimiter;

    for (let index = 0; index < chunk.length; index += 1) {
      const character = chunk[index];

      if (this.skipLF) {
        this.skipLF = false;
        if (character === "\n") continue;
      }

      if (this.inQuotes) {
        if (this.quotePending) {
          if (character === '"') {
            this.field += '"';
            this.quotePending = false;
            this.recordTouched = true;
            continue;
          }

          // The previous quote closed the field. Reprocess this character
          // using the ordinary delimiter / record-terminator rules.
          this.inQuotes = false;
          this.quotePending = false;
          this.afterQuote = true;
        } else {
          if (character === '"') {
            this.quotePending = true;
          } else {
            this.field += character;
          }
          this.recordTouched = true;
          continue;
        }
      }

      if (this.atStart) {
        this.atStart = false;
        if (character === "\uFEFF") continue;
      }

      if (this.afterQuote) {
        if (character === delimiter) {
          this.row.push(this.field);
          this.field = "";
          this.afterQuote = false;
          this.recordTouched = true;
          continue;
        }
        if (character === "\r" || character === "\n") {
          this._emitRecord(output);
          if (character === "\r") this.skipLF = true;
          continue;
        }
        throw new SyntaxError(
          "Unexpected character after a closing quote at chunk offset " + index
        );
      }

      if (character === '"') {
        if (this.field.length !== 0) {
          throw new SyntaxError(
            "A quote may only begin at the start of a field"
          );
        }
        this.inQuotes = true;
        this.recordTouched = true;
        continue;
      }

      if (character === delimiter) {
        this.row.push(this.field);
        this.field = "";
        this.recordTouched = true;
        continue;
      }

      if (character === "\r" || character === "\n") {
        this._emitRecord(output);
        if (character === "\r") this.skipLF = true;
        continue;
      }

      this.field += character;
      this.recordTouched = true;
    }

    if (final) {
      if (this.inQuotes && this.quotePending) {
        // A pending quote at EOF is the closing quote, not an escaped quote.
        this.inQuotes = false;
        this.quotePending = false;
        this.afterQuote = true;
      }
      if (this.inQuotes) {
        throw new SyntaxError("Unterminated quoted field at end of input");
      }

      if (
        this.recordTouched ||
        this.field.length > 0 ||
        this.row.length > 0
      ) {
        this._emitRecord(output);
      }
      this.finished = true;
    }

    return output;
  }
}

function parseCSV(chunks, options) {
  const parser = new StreamingCSVParser(options);
  const records = [];

  for (const chunk of chunks) {
    records.push(...parser.push(chunk));
  }
  records.push(...parser.push("", { final: true }));
  return records;
}

function runTests() {
  const source =
    '\uFEFFname,comment\r\n' +
    'Ada,"hello, world"\r\n' +
    'Grace,"line 1\nline 2"\r\n';

  const expected = [
    ["name", "comment"],
    ["Ada", "hello, world"],
    ["Grace", "line 1\nline 2"]
  ];

  assert.deepEqual(
    parseCSV([source.slice(0, 5), source.slice(5, 17), source.slice(17, 31), source.slice(31)]),
    expected
  );

  assert.deepEqual(
    parseCSV(['id;text\r\n1;"say ""hi"""\r\n'], { delimiter: ";" }),
    [["id", "text"], ["1", 'say "hi"']]
  );

  assert.deepEqual(parseCSV([",a,,\n"]), [["", "a", "", ""]]);
  assert.deepEqual(parseCSV([""]), []);
  assert.deepEqual(parseCSV(["\n"]), [[""]]);
  assert.deepEqual(parseCSV(["a\r", "\nb\r", "\n"]), [["a"], ["b"]]);

  // Every possible two-chunk boundary must produce the same records.
  for (let split = 0; split <= source.length; split += 1) {
    assert.deepEqual(
      parseCSV([source.slice(0, split), source.slice(split)]),
      expected
    );
  }

  assert.throws(
    () => parseCSV(['a,"unfinished']),
    /Unterminated quoted field/
  );
  assert.throws(
    () => parseCSV(["ab\"cd"]),
    /start of a field/
  );
  assert.throws(
    () => parseCSV(['"closed"x']),
    /after a closing quote/
  );

  const parser = new StreamingCSVParser();
  parser.push("a,b");
  parser.push("", { final: true });
  assert.throws(() => parser.push("c"), /finalized/);

  console.log("StreamingCSVParser: all tests passed");
}

module.exports = { StreamingCSVParser, parseCSV };

if (require.main === module) {
  runTests();
}