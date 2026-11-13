/**
 * Incremental CSV Parser
 * ----------------------
 * Parse RFC-4180-style CSV across arbitrary string chunk boundaries.
 * Handles quoted delimiters, escaped quotes, embedded CR/LF, CRLF split across
 * chunks, optional headers, and strict row-width validation.
 *
 * API:
 *   const parser = new CSVParser({ headers: true });
 *   const rows = [...parser.write(chunk1), ...parser.write(chunk2), ...parser.end()];
 *
 * parseCSVStream accepts any AsyncIterable<string> and yields rows as soon as
 * complete records become available.
 */

class CSVParser {
  constructor({
    delimiter = ",",
    quote = '"',
    headers = false,
    skipEmptyLines = false,
    strict = true
  } = {}) {
    if (typeof delimiter !== "string" || delimiter.length !== 1 ||
        delimiter === "\r" || delimiter === "\n") {
      throw new TypeError("delimiter must be one non-newline character");
    }
    if (typeof quote !== "string" || quote.length !== 1 ||
        quote === delimiter || quote === "\r" || quote === "\n") {
      throw new TypeError("quote must be one character distinct from delimiter");
    }

    this.delimiter = delimiter;
    this.quote = quote;
    this.useHeaders = Boolean(headers);
    this.skipEmptyLines = Boolean(skipEmptyLines);
    this.strict = Boolean(strict);

    this.field = "";
    this.row = [];
    this.inQuotes = false;
    this.afterQuote = false;
    this.atFieldStart = true;
    this.rowStarted = false;
    this.skipNextLF = false;
    this.firstCharacter = true;
    this.ended = false;
    this.header = null;
    this.recordNumber = 0;
  }

  _syntax(message) {
    return new SyntaxError(`CSV record ${this.recordNumber + 1}: ${message}`);
  }

  _endField() {
    this.row.push(this.field);
    this.field = "";
    this.atFieldStart = true;
  }

  _emitRecord(output) {
    this._endField();
    this.recordNumber += 1;
    const record = this.row;
    this.row = [];
    this.rowStarted = false;

    if (this.skipEmptyLines && record.length === 1 && record[0] === "") {
      return;
    }

    if (!this.useHeaders) {
      output.push(record);
      return;
    }

    if (this.header === null) {
      if (new Set(record).size !== record.length) {
        throw this._syntax("duplicate header names are not allowed");
      }
      this.header = record;
      return;
    }

    if (this.strict && record.length !== this.header.length) {
      throw this._syntax(
        `expected ${this.header.length} columns, received ${record.length}`
      );
    }

    const object = Object.create(null);
    for (let i = 0; i < this.header.length; i += 1) {
      object[this.header[i]] = record[i] ?? "";
    }
    for (let i = this.header.length; i < record.length; i += 1) {
      object[`_extra${i - this.header.length + 1}`] = record[i];
    }
    output.push(object);
  }

  write(chunk) {
    if (this.ended) throw new Error("cannot write after end()");
    if (typeof chunk !== "string") throw new TypeError("CSV chunks must be strings");

    const output = [];
    for (let i = 0; i < chunk.length; i += 1) {
      const character = chunk[i];

      if (this.firstCharacter) {
        this.firstCharacter = false;
        if (character === "\uFEFF") continue;
      }

      if (this.skipNextLF) {
        this.skipNextLF = false;
        if (character === "\n") continue;
      }

      this.rowStarted = true;

      if (this.inQuotes) {
        if (character === this.quote) {
          if (chunk[i + 1] === this.quote) {
            this.field += this.quote;
            i += 1;
          } else {
            this.inQuotes = false;
            this.afterQuote = true;
          }
        } else {
          this.field += character;
        }
        continue;
      }

      if (this.afterQuote) {
        if (character === this.quote) {
          // The closing quote was the last character of the prior chunk;
          // this quote completes an escaped quote pair.
          this.field += this.quote;
          this.inQuotes = true;
          this.afterQuote = false;
          continue;
        }
        if (character === this.delimiter) {
          this._endField();
          this.afterQuote = false;
          continue;
        }
        if (character === "\r" || character === "\n") {
          this.afterQuote = false;
          this._emitRecord(output);
          if (character === "\r") this.skipNextLF = true;
          continue;
        }
        if (this.strict) {
          throw this._syntax("unexpected character after a closing quote");
        }
        this.field += character;
        this.afterQuote = false;
        this.atFieldStart = false;
        continue;
      }

      if (character === this.quote) {
        if (!this.atFieldStart) {
          throw this._syntax("quote found inside an unquoted field");
        }
        this.inQuotes = true;
        this.atFieldStart = false;
      } else if (character === this.delimiter) {
        this._endField();
      } else if (character === "\r" || character === "\n") {
        this._emitRecord(output);
        if (character === "\r") this.skipNextLF = true;
      } else {
        this.field += character;
        this.atFieldStart = false;
      }
    }
    return output;
  }

  end() {
    if (this.ended) throw new Error("end() may only be called once");
    this.ended = true;
    if (this.inQuotes) throw this._syntax("unterminated quoted field");

    const output = [];
    this.afterQuote = false;
    if (this.rowStarted || this.row.length > 0 || this.field.length > 0) {
      this._emitRecord(output);
    }
    return output;
  }
}

function parseCSV(text, options) {
  const parser = new CSVParser(options);
  return [...parser.write(text), ...parser.end()];
}

async function* parseCSVStream(chunks, options) {
  const parser = new CSVParser(options);
  for await (const chunk of chunks) {
    for (const row of parser.write(chunk)) yield row;
  }
  for (const row of parser.end()) yield row;
}

// ------------------------------ Example tests ------------------------------
if (require.main === module) {
  const assert = require("node:assert/strict");

  const parser = new CSVParser({ headers: true });
  const rows = [
    ...parser.write("\uFEFFname,comment\r"),
    ...parser.write("\nAda,\"hello,"),
    ...parser.write(" world\"\r\nGrace,\"line one\r"),
    ...parser.write("\nline two\"\r"),
    ...parser.write("\n"),
    ...parser.end()
  ];
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, "Ada");
  assert.equal(rows[0].comment, "hello, world");
  assert.equal(rows[1].comment, "line one\r\nline two");

  assert.deepEqual(parseCSV('a,"b""c",d'), [["a", 'b"c', "d"]]);
  assert.deepEqual(parseCSV("a,b\r\n1,2\r\n3,4"), [
    ["a", "b"], ["1", "2"], ["3", "4"]
  ]);
  assert.deepEqual(parseCSV("a,,c\n\n", { skipEmptyLines: true }), [
    ["a", "", "c"]
  ]);
  assert.deepEqual(parseCSV("x;y\n1;2", { delimiter: ";" }), [
    ["x", "y"], ["1", "2"]
  ]);
  assert.deepEqual(parseCSV("a,b\n1", {
    headers: true, strict: false
  }).map(row => [row.a, row.b]), [["1", ""]]);

  assert.throws(() => parseCSV('"unfinished'), /unterminated quoted field/);
  assert.throws(() => parseCSV('ab"cd'), /inside an unquoted field/);
  assert.throws(() => parseCSV('"ok"x'), /after a closing quote/);
  assert.throws(() => parseCSV("a,a\n1,2", { headers: true }), /duplicate header/);
  assert.throws(() => parseCSV("a,b\n1", { headers: true }), /expected 2 columns/);

  async function* chunks() {
    yield "id,value\r";
    yield "\n1,\"alpha";
    yield ",beta\"\r\n2,gamma";
  }
  (async () => {
    const streamed = [];
    for await (const row of parseCSVStream(chunks(), { headers: true })) {
      streamed.push(row);
    }
    assert.deepEqual(streamed.map(row => [row.id, row.value]), [
      ["1", "alpha,beta"], ["2", "gamma"]
    ]);
    console.log("streaming-csv-parser: all tests passed");
  })().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { CSVParser, parseCSV, parseCSVStream };
