'use strict';

/**
 * Exercise: implement an atomic JSON Patch engine (RFC 6902 core operations).
 *
 * Supports add, remove, replace, move, copy, and test. JSON Pointer escapes
 * (~0 and ~1), array insertion semantics, root replacement, and prototype-safe
 * object writes are handled explicitly. A patch is applied to a private clone;
 * if any operation fails, the caller's original document remains unchanged.
 *
 * Run: node daily/2026-11-11/jsonPatchEngine.js
 */

const assert = require('node:assert/strict');

function cloneJson(value, ancestors = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('JSON numbers must be finite');
    return value;
  }
  if (typeof value !== 'object') throw new TypeError('value is not JSON-compatible');
  if (ancestors.has(value)) throw new TypeError('cyclic values are not valid JSON');
  ancestors.add(value);

  let result;
  if (Array.isArray(value)) {
    result = value.map(item => cloneJson(item, ancestors));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('only plain JSON objects are supported');
    }
    result = {};
    for (const key of Object.keys(value)) {
      Object.defineProperty(result, key, {
        value: cloneJson(value[key], ancestors),
        enumerable: true,
        writable: true,
        configurable: true
      });
    }
  }

  ancestors.delete(value);
  return result;
}

function decodePointer(pointer) {
  if (typeof pointer !== 'string') throw new TypeError('JSON Pointer must be a string');
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) throw new Error('JSON Pointer must be empty or begin with /');

  return pointer.slice(1).split('/').map(token => {
    let decoded = '';
    for (let index = 0; index < token.length; index += 1) {
      if (token[index] !== '~') {
        decoded += token[index];
        continue;
      }
      const escaped = token[index + 1];
      if (escaped === '0') decoded += '~';
      else if (escaped === '1') decoded += '/';
      else throw new Error('invalid JSON Pointer escape');
      index += 1;
    }
    return decoded;
  });
}

function encodePointer(tokens) {
  if (!Array.isArray(tokens)) throw new TypeError('tokens must be an array');
  return tokens.length === 0
    ? ''
    : '/' + tokens.map(token => String(token).replace(/~/g, '~0').replace(/\//g, '~1')).join('/');
}

function arrayIndex(token, length, allowEnd, allowDash) {
  if (allowDash && token === '-') return length;
  if (!/^(0|[1-9]\d*)$/.test(token)) throw new Error('invalid array index');
  const index = Number(token);
  if (!Number.isSafeInteger(index) || index < 0 || index > length ||
      (!allowEnd && index === length)) {
    throw new Error('array index is out of bounds');
  }
  return index;
}

function getAt(document, tokens) {
  let current = document;
  for (const token of tokens) {
    if (Array.isArray(current)) {
      current = current[arrayIndex(token, current.length, false, false)];
    } else if (current !== null && typeof current === 'object' &&
               Object.prototype.hasOwnProperty.call(current, token)) {
      current = current[token];
    } else {
      throw new Error('path does not exist');
    }
  }
  return current;
}

function parentAt(document, tokens) {
  if (tokens.length === 0) throw new Error('root has no parent');
  const parent = getAt(document, tokens.slice(0, -1));
  if (parent === null || typeof parent !== 'object') {
    throw new Error('path parent is not a container');
  }
  return { parent, key: tokens[tokens.length - 1] };
}

function defineOwn(object, key, value) {
  Object.defineProperty(object, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true
  });
}

function addAt(document, tokens, value) {
  const copied = cloneJson(value);
  if (tokens.length === 0) return copied;
  const { parent, key } = parentAt(document, tokens);

  if (Array.isArray(parent)) {
    const index = arrayIndex(key, parent.length, true, true);
    parent.splice(index, 0, copied);
  } else {
    defineOwn(parent, key, copied);
  }
  return document;
}

function removeAt(document, tokens) {
  if (tokens.length === 0) throw new Error('removing the document root is unsupported');
  const { parent, key } = parentAt(document, tokens);

  if (Array.isArray(parent)) {
    const index = arrayIndex(key, parent.length, false, false);
    return { document, removed: parent.splice(index, 1)[0] };
  }
  if (!Object.prototype.hasOwnProperty.call(parent, key)) {
    throw new Error('path does not exist');
  }
  const removed = parent[key];
  delete parent[key];
  return { document, removed };
}

function replaceAt(document, tokens, value) {
  const copied = cloneJson(value);
  if (tokens.length === 0) return copied;
  const { parent, key } = parentAt(document, tokens);

  if (Array.isArray(parent)) {
    const index = arrayIndex(key, parent.length, false, false);
    parent[index] = copied;
  } else {
    if (!Object.prototype.hasOwnProperty.call(parent, key)) {
      throw new Error('path does not exist');
    }
    defineOwn(parent, key, copied);
  }
  return document;
}

function deepEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left)) {
    return left.length === right.length && left.every((value, index) => deepEqual(value, right[index]));
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && deepEqual(left[key], right[key]));
}

function applyPatch(document, operations) {
  if (!Array.isArray(operations)) throw new TypeError('patch must be an array');
  let working = cloneJson(document);

  operations.forEach((operation, index) => {
    try {
      if (!operation || typeof operation !== 'object' || typeof operation.op !== 'string') {
        throw new TypeError('operation must have an op string');
      }
      const pathTokens = decodePointer(operation.path);

      switch (operation.op) {
        case 'add':
          if (!Object.prototype.hasOwnProperty.call(operation, 'value')) {
            throw new TypeError('add requires value');
          }
          working = addAt(working, pathTokens, operation.value);
          break;

        case 'remove':
          working = removeAt(working, pathTokens).document;
          break;

        case 'replace':
          if (!Object.prototype.hasOwnProperty.call(operation, 'value')) {
            throw new TypeError('replace requires value');
          }
          working = replaceAt(working, pathTokens, operation.value);
          break;

        case 'copy': {
          const fromTokens = decodePointer(operation.from);
          const copied = getAt(working, fromTokens);
          working = addAt(working, pathTokens, copied);
          break;
        }

        case 'move': {
          const fromTokens = decodePointer(operation.from);
          const moving = getAt(working, fromTokens);
          if (fromTokens.length < pathTokens.length &&
              fromTokens.every((token, tokenIndex) => token === pathTokens[tokenIndex])) {
            throw new Error('cannot move a value into one of its descendants');
          }
          if (encodePointer(fromTokens) === encodePointer(pathTokens)) break;
          const removal = removeAt(working, fromTokens);
          working = addAt(removal.document, pathTokens, removal.removed);
          break;
        }

        case 'test': {
          if (!Object.prototype.hasOwnProperty.call(operation, 'value')) {
            throw new TypeError('test requires value');
          }
          if (!deepEqual(getAt(working, pathTokens), operation.value)) {
            throw new Error('test operation failed');
          }
          break;
        }

        default:
          throw new Error('unsupported patch operation: ' + operation.op);
      }
    } catch (error) {
      throw new Error('patch operation ' + index + ' failed: ' + error.message);
    }
  });

  return working;
}

function runTests() {
  const original = {
    items: [{ name: 'a' }, { name: 'b' }],
    'a/b': { '~key': 1 },
    enabled: true
  };

  const result = applyPatch(original, [
    { op: 'add', path: '/items/1', value: { name: 'inserted' } },
    { op: 'replace', path: '/items/0/name', value: 'A' },
    { op: 'copy', from: '/items/0', path: '/copied' },
    { op: 'move', from: '/items/2', path: '/items/1' },
    { op: 'test', path: '/a~1b/~0key', value: 1 },
    { op: 'remove', path: '/enabled' }
  ]);

  assert.deepEqual(result.items, [
    { name: 'A' },
    { name: 'b' },
    { name: 'inserted' }
  ]);
  assert.deepEqual(result.copied, { name: 'A' });
  assert.equal(Object.hasOwn(result, 'enabled'), false);
  assert.equal(original.items.length, 2);
  assert.equal(original.items[0].name, 'a');

  const appended = applyPatch([1, 2], [
    { op: 'add', path: '/-', value: 3 },
    { op: 'move', from: '/0', path: '/2' }
  ]);
  assert.deepEqual(appended, [2, 3, 1]);

  assert.deepEqual(applyPatch(7, [
    { op: 'replace', path: '', value: { answer: 42 } }
  ]), { answer: 42 });

  const safe = applyPatch({}, [
    { op: 'add', path: '/__proto__', value: { polluted: true } }
  ]);
  assert.equal(Object.hasOwn(safe, '__proto__'), true);
  assert.equal(Object.prototype.polluted, undefined);

  assert.throws(() => applyPatch(original, [
    { op: 'replace', path: '/items/0/name', value: 'changed' },
    { op: 'remove', path: '/missing' }
  ]), /operation 1 failed/);
  assert.equal(original.items[0].name, 'a');

  assert.throws(() => decodePointer('/bad~2escape'), /escape/);
  assert.throws(() => applyPatch({ a: {} }, [
    { op: 'move', from: '/a', path: '/a/child' }
  ]), /descendants/);
  assert.throws(() => applyPatch([1], [
    { op: 'add', path: '/01', value: 2 }
  ]), /array index/);
  assert.throws(() => applyPatch({ a: 1 }, [
    { op: 'test', path: '/a', value: 2 }
  ]), /test operation failed/);

  const left = { nested: [1, { x: true }], z: 2 };
  const right = { z: 2, nested: [1, { x: true }] };
  assert.equal(deepEqual(left, right), true);
  assert.equal(deepEqual([1, 2], [2, 1]), false);

  return { checks: 17, operationsCovered: ['add', 'remove', 'replace', 'move', 'copy', 'test'] };
}

if (require.main === module) {
  console.log('JSON Patch engine:', runTests());
}

module.exports = { applyPatch, decodePointer, encodePointer, deepEqual, runTests };
