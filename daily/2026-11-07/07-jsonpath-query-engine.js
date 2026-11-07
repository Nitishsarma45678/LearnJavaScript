'use strict';

/**
 * Exercise: Build a safe JSONPath query engine without eval or Function.
 *
 * Supported syntax: $, .property, ['property'], ["property"], [index],
 * [-index], [*], [start:end:step], unions such as [0,2] or ['a','b'],
 * recursive descent (..property and ..*). Results retain their source paths.
 */

function syntaxError(message, position) {
  return new SyntaxError(`${message} at position ${position}`);
}

function readQuoted(source, start) {
  const quote = source[start];
  let i = start + 1;
  let value = '';
  while (i < source.length) {
    const ch = source[i++];
    if (ch === quote) return { value, next: i };
    if (ch !== '\\') { value += ch; continue; }
    if (i >= source.length) throw syntaxError('unterminated escape', i - 1);
    const escaped = source[i++];
    const simple = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '\\': '\\', '/': '/', "'": "'", '"': '"' };
    if (Object.hasOwn(simple, escaped)) { value += simple[escaped]; continue; }
    if (escaped === 'u') {
      const hex = source.slice(i, i + 4);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw syntaxError('invalid Unicode escape', i - 2);
      value += String.fromCharCode(parseInt(hex, 16));
      i += 4;
      continue;
    }
    throw syntaxError(`unsupported escape \\${escaped}`, i - 2);
  }
  throw syntaxError('unterminated quoted property', start);
}

function hasUnquotedColon(content) {
  let quote = null;
  let escaped = false;
  for (const ch of content) {
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
    } else if (ch === '\"' || ch === "'") quote = ch;
    else if (ch === ':') return true;
  }
  return false;
}

function splitUnion(content, offset) {
  const parts = [];
  let start = 0;
  let quote = null;
  let escaped = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ',') { parts.push(content.slice(start, i).trim()); start = i + 1; }
  }
  if (quote) throw syntaxError('unterminated quote in selector', offset + content.length);
  parts.push(content.slice(start).trim());
  if (parts.some((part) => part.length === 0)) throw syntaxError('empty union selector', offset);
  return parts;
}

function parseBracket(content, position) {
  const trimmed = content.trim();
  if (trimmed === '*') return { type: 'wildcard' };

  if (hasUnquotedColon(trimmed)) {
    const fields = trimmed.split(':');
    if (fields.length < 2 || fields.length > 3) throw syntaxError('slice must have two or three fields', position);
    const values = fields.map((field) => field.trim() === '' ? null : Number(field.trim()));
    if (values.some((value) => value !== null && !Number.isSafeInteger(value))) {
      throw syntaxError('slice bounds must be safe integers', position);
    }
    const step = values[2] ?? 1;
    if (step <= 0) throw syntaxError('slice step must be positive', position);
    return { type: 'slice', start: values[0], end: values[1], step };
  }

  const parts = splitUnion(trimmed, position);
  const selectors = parts.map((part) => {
    if (part[0] === '"' || part[0] === "'") {
      const parsed = readQuoted(part, 0);
      if (parsed.next !== part.length) throw syntaxError('unexpected text after quoted property', position);
      return { type: 'property', key: parsed.value };
    }
    if (/^-?\d+$/.test(part)) {
      const index = Number(part);
      if (!Number.isSafeInteger(index)) throw syntaxError('array index is outside the safe integer range', position);
      return { type: 'index', index };
    }
    throw syntaxError(`unsupported bracket selector: ${part}`, position);
  });
  return selectors.length === 1 ? selectors[0] : { type: 'union', selectors };
}

function parsePath(expression) {
  if (typeof expression !== 'string' || expression.length === 0 || expression[0] !== '$') {
    throw new TypeError('JSONPath expression must begin with $');
  }
  const tokens = [];
  let i = 1;
  while (i < expression.length) {
    if (/\s/.test(expression[i])) { i++; continue; }

    if (expression[i] === '.') {
      const recursive = expression[i + 1] === '.';
      i += recursive ? 2 : 1;
      if (expression[i] === '*') {
        tokens.push({ type: recursive ? 'recursive' : 'wildcard', key: '*' });
        i++;
        continue;
      }
      const start = i;
      while (i < expression.length && expression[i] !== '.' && expression[i] !== '[') i++;
      const key = expression.slice(start, i).trim();
      if (!key) throw syntaxError('expected property name after dot', start);
      tokens.push(recursive ? { type: 'recursive', key } : { type: 'property', key });
      continue;
    }

    if (expression[i] === '[') {
      const start = i++;
      let quote = null;
      let escaped = false;
      while (i < expression.length) {
        const ch = expression[i];
        if (quote) {
          if (escaped) escaped = false;
          else if (ch === '\\') escaped = true;
          else if (ch === quote) quote = null;
        } else if (ch === '"' || ch === "'") quote = ch;
        else if (ch === ']') break;
        i++;
      }
      if (i >= expression.length) throw syntaxError('missing closing bracket', start);
      tokens.push(parseBracket(expression.slice(start + 1, i), start + 1));
      i++;
      continue;
    }

    throw syntaxError(`unexpected character ${JSON.stringify(expression[i])}`, i);
  }
  return tokens;
}

function childEntries(value, path) {
  if (Array.isArray(value)) return value.map((item, index) => ({ key: String(index), value: item, path: `${path}[${index}]` }));
  if (value && typeof value === 'object') {
    return Object.keys(value).map((key) => ({ key, value: value[key], path: `${path}[${JSON.stringify(key)}]` }));
  }
  return [];
}

function normalizeIndex(index, length) {
  return index < 0 ? length + index : index;
}

function applySelector(item, selector) {
  const { value, path } = item;
  if (selector.type === 'property') {
    if (value !== null && typeof value === 'object' && Object.hasOwn(value, selector.key)) {
      return [{ path: `${path}[${JSON.stringify(selector.key)}]`, value: value[selector.key] }];
    }
    return [];
  }
  if (selector.type === 'index') {
    if (!Array.isArray(value)) return [];
    const index = normalizeIndex(selector.index, value.length);
    return index >= 0 && index < value.length ? [{ path: `${path}[${index}]`, value: value[index] }] : [];
  }
  if (selector.type === 'wildcard') return childEntries(value, path).map(({ path: p, value: v }) => ({ path: p, value: v }));
  if (selector.type === 'slice') {
    if (!Array.isArray(value)) return [];
    const start = Math.max(0, Math.min(value.length, selector.start === null ? 0 : normalizeIndex(selector.start, value.length)));
    const end = Math.max(0, Math.min(value.length, selector.end === null ? value.length : normalizeIndex(selector.end, value.length)));
    const results = [];
    for (let index = start; index < end; index += selector.step) results.push({ path: `${path}[${index}]`, value: value[index] });
    return results;
  }
  if (selector.type === 'union') return selector.selectors.flatMap((part) => applySelector(item, part));
  throw new Error(`unsupported selector type: ${selector.type}`);
}

function applyRecursive(item, key) {
  const results = [];
  const ancestors = new WeakSet();
  function visit(value, path) {
    if (value === null || typeof value !== 'object' || ancestors.has(value)) return;
    ancestors.add(value);
    for (const child of childEntries(value, path)) {
      if (key === '*' || child.key === key) results.push({ path: child.path, value: child.value });
      visit(child.value, child.path);
    }
    ancestors.delete(value);
  }
  visit(item.value, item.path);
  return results;
}

function queryJsonPath(document, expression) {
  const tokens = parsePath(expression);
  let current = [{ path: '$', value: document }];
  for (const token of tokens) {
    const next = [];
    for (const item of current) {
      if (token.type === 'recursive') next.push(...applyRecursive(item, token.key));
      else next.push(...applySelector(item, token));
    }
    current = next;
  }
  return current.map((match) => Object.freeze(match));
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  const data = {
    store: {
      book: [
        { title: 'A', price: 8, tags: ['classic', 'short'] },
        { title: 'B', price: 12, tags: ['long'] },
        { title: 'C', price: 5, tags: ['classic'] },
      ],
      bicycle: { color: 'red', price: 19 },
    },
    meta: { title: 'catalogue', 'odd.key': { title: 'nested' }, 'odd:colon': 'safe' },
  };

  assert.deepEqual(queryJsonPath(data, '$.store.book[0].title').map((m) => m.value), ['A']);
  assert.deepEqual(queryJsonPath(data, '$.store.book[*].price').map((m) => m.value), [8, 12, 5]);
  assert.deepEqual(queryJsonPath(data, '$.store.book[-1].title').map((m) => m.value), ['C']);
  assert.deepEqual(queryJsonPath(data, '$.store.book[0:3:2].title').map((m) => m.value), ['A', 'C']);
  assert.deepEqual(queryJsonPath(data, '$.store.book[0,2].title').map((m) => m.value), ['A', 'C']);
  assert.deepEqual(queryJsonPath(data, '$.store["book","bicycle"].price').map((m) => m.value), [19]);
  assert.deepEqual(queryJsonPath(data, '$..title').map((m) => m.value), ['A', 'B', 'C', 'catalogue', 'nested']);
  assert.deepEqual(queryJsonPath(data, '$..*').map((m) => m.value).length, 26);
  assert.deepEqual(queryJsonPath(data, '$.meta["odd.key"].title').map((m) => m.value), ['nested']);
  assert.deepEqual(queryJsonPath(data, "$.meta['odd:colon']").map((m) => m.value), ['safe']);
  assert.equal(queryJsonPath(data, '$.missing').length, 0);
  assert.equal(queryJsonPath(data, '$.store.book[99]').length, 0);

  const cyclic = { name: 'root', child: { name: 'child' } };
  cyclic.child.back = cyclic;
  assert.deepEqual(queryJsonPath(cyclic, '$..name').map((m) => m.value), ['root', 'child']);
  assert.throws(() => parsePath('store.book'), /begin with/);
  assert.throws(() => parsePath('$.items[1'), /closing bracket/);
  assert.throws(() => parsePath('$.items[::0]'), /positive/);
  assert.throws(() => parsePath('$.items[?(@.x)]'), /unsupported/);
  console.log('jsonpath-query-engine: all tests passed');
}

module.exports = { parsePath, queryJsonPath };
