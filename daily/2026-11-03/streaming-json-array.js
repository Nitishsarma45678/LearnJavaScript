const assert = require('node:assert/strict');

async function* parseJsonArray(chunks) {
  let started = false;
  let ended = false;
  let item = null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let complete = false;
  let afterComma = false;

  for await (const chunk of chunks) {
    if (typeof chunk !== 'string') throw new TypeError('chunks must yield strings');
    for (const character of chunk) {
      if (!started) {
        if (/\s/.test(character)) continue;
        if (character !== '[') throw new SyntaxError('expected a top-level JSON array');
        started = true;
        continue;
      }
      if (ended) {
        if (!/\s/.test(character)) throw new SyntaxError('unexpected data after JSON array');
        continue;
      }

      if (item === null) {
        if (/\s/.test(character)) continue;
        if (character === ']') {
          if (afterComma) throw new SyntaxError('trailing comma in JSON array');
          ended = true;
          continue;
        }
        if (character === ',') throw new SyntaxError('unexpected comma');
        item = character;
        depth = 0;
        inString = false;
        escaped = false;
        complete = false;
        if (character === '"') inString = true;
        else if (character === '{' || character === '[') depth = 1;
        continue;
      }

      if (complete) {
        if (/\s/.test(character)) continue;
        if (character === ',' || character === ']') {
          const value = JSON.parse(item);
          item = null;
          afterComma = character === ',';
          if (character === ']') ended = true;
          yield value;
          continue;
        }
        throw new SyntaxError('expected comma or closing bracket');
      }

      if (inString) {
        item += character;
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') {
          inString = false;
          if (depth === 0) complete = true;
        }
        continue;
      }

      if (depth > 0) {
        item += character;
        if (character === '"') inString = true;
        else if (character === '{' || character === '[') depth++;
        else if (character === '}' || character === ']') {
          depth--;
          if (depth < 0) throw new SyntaxError('unbalanced JSON container');
          if (depth === 0) complete = true;
        }
        continue;
      }

      // Primitive values end at whitespace, a comma, or the array's closing bracket.
      if (character === ',' || character === ']') {
        const value = JSON.parse(item.trim());
        item = null;
        afterComma = character === ',';
        if (character === ']') ended = true;
        yield value;
      } else if (/\s/.test(character)) {
        complete = true;
      } else {
        item += character;
      }
    }
  }

  if (!started || !ended || item !== null) throw new SyntaxError('incomplete JSON array stream');
}

async function* chunksOf(parts) {
  for (const part of parts) yield part;
}

(async () => {
  const values = [];
  for await (const value of parseJsonArray(chunksOf([
    '  [1, {"message":"hel',
    'lo, \\"world\\"","items":[true, null]}, ',
    '"split \\u263A string", -2.5e2, [] ]  '
  ]))) values.push(value);
  assert.deepEqual(values, [
    1,
    { message: 'hello, "world"', items: [true, null] },
    'split ☺ string',
    -250,
    []
  ]);

  const empty = [];
  for await (const value of parseJsonArray(chunksOf(['[', ' ]']))) empty.push(value);
  assert.deepEqual(empty, []);
  await assert.rejects(async () => {
    for await (const _ of parseJsonArray(chunksOf(['[1,]']))) { /* consume */ }
  }, SyntaxError);
  await assert.rejects(async () => {
    for await (const _ of parseJsonArray(chunksOf(['[1']))) { /* consume */ }
  }, SyntaxError);
  console.log('Streaming JSON array parser tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
