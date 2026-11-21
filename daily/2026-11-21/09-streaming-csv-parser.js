// Exercise: Parse CSV incrementally across arbitrary chunk boundaries.
// Support quoted fields, escaped quotes, commas/newlines inside quotes, and CRLF.
// This parser is intentionally strict: characters after a closing quote are rejected.

class StreamingCSVParser {
  constructor(delimiter = ",", quote = '"') {
    if (delimiter.length !== 1 || quote.length !== 1 ||
        delimiter === quote || delimiter === "\r" || delimiter === "\n") {
      throw new TypeError("delimiter and quote must be distinct single characters");
    }
    this.delimiter = delimiter;
    this.quote = quote;
    this.field = "";
    this.row = [];
    this.inQuotes = false;
    this.quotePending = false;
    this.afterQuote = false;
    this.skipLF = false;
    this.hasData = false;
    this.ended = false;
  }

  _finishRow(output) {
    this.row.push(this.field);
    output.push(this.row);
    this.field = "";
    this.row = [];
    this.afterQuote = false;
    this.hasData = false;
  }

  write(chunk) {
    if (this.ended) throw new Error("parser has already ended");
    if (typeof chunk !== "string") throw new TypeError("chunk must be a string");
    const output = [];

    for (let i = 0; i < chunk.length; i++) {
      const char = chunk[i];

      if (this.skipLF) {
        this.skipLF = false;
        if (char === "\n") continue;
      }

      if (this.quotePending) {
        this.quotePending = false;
        if (char === this.quote) {
          this.field += this.quote;
          this.hasData = true;
          continue;
        }
        this.inQuotes = false;
        this.afterQuote = true;
      }

      if (this.inQuotes) {
        if (char === this.quote) this.quotePending = true;
        else this.field += char;
        this.hasData = true;
        continue;
      }

      if (this.afterQuote) {
        if (char === this.delimiter) {
          this.row.push(this.field);
          this.field = "";
          this.afterQuote = false;
          this.hasData = true;
        } else if (char === "\n" || char === "\r") {
          this._finishRow(output);
          if (char === "\r") this.skipLF = true;
        } else {
          throw new SyntaxError("unexpected character after closing quote");
        }
        continue;
      }

      if (char === this.quote) {
        if (this.field.length !== 0) {
          throw new SyntaxError("quote must begin at the start of a field");
        }
        this.inQuotes = true;
        this.hasData = true;
      } else if (char === this.delimiter) {
        this.row.push(this.field);
        this.field = "";
        this.hasData = true;
      } else if (char === "\n" || char === "\r") {
        this._finishRow(output);
        if (char === "\r") this.skipLF = true;
      } else {
        this.field += char;
        this.hasData = true;
      }
    }
    return output;
  }

  end() {
    if (this.ended) throw new Error("parser has already ended");
    this.ended = true;
    if (this.quotePending) {
      this.quotePending = false;
      this.inQuotes = false;
      this.afterQuote = true;
    }
    if (this.inQuotes) throw new SyntaxError("unterminated quoted field");

    const output = [];
    if (this.hasData || this.field.length > 0 || this.row.length > 0 || this.afterQuote) {
      this._finishRow(output);
    }
    return output;
  }
}

// Tests
const assert = require("node:assert/strict");
const parser = new StreamingCSVParser();
const rows = [];
rows.push(...parser.write('name,note\r\nAlice,"hello,'));
rows.push(...parser.write(' world ""quoted"""\r'));
rows.push(...parser.write('\nBob,done'));
rows.push(...parser.end());
assert.deepEqual(rows, [
  ["name", "note"],
  ["Alice", 'hello, world "quoted"'],
  ["Bob", "done"]
]);

const empty = new StreamingCSVParser();
assert.deepEqual([...empty.write('a,,c\n'), ...empty.end()], [["a", "", "c"]]);

const malformed = new StreamingCSVParser();
malformed.write('"open');
assert.throws(() => malformed.end(), SyntaxError);

const invalid = new StreamingCSVParser();
assert.throws(() => invalid.write('ab"cd'), SyntaxError);
console.log("streaming CSV parser tests passed");
