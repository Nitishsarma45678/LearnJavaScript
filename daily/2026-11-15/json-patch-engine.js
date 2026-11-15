'use strict';

/**
 * RFC 6902-style JSON Patch engine for JSON-compatible values.
 *
 * Supported operations: add, remove, replace, move, copy and test.
 * Patches are applied transactionally to a deep clone: if any operation fails,
 * the caller's original document remains untouched. Dangerous JavaScript
 * prototype-mutating path segments are rejected deliberately.
 */

const assert = require('node:assert/strict');

function cloneJson(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('JSON numbers must be finite');
    return value;
  }
  if (typeof value !== 'object') throw new TypeError('Value is not JSON-compatible');
  if (seen.has(value)) throw new TypeError('Cyclic values are not valid JSON');
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    result = value.map(item => cloneJson(item, seen));
  } else {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new TypeError('Only plain objects are supported');
    }
    result = {};
    for (const key of Object.keys(value)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
        throw new TypeError(`Unsafe object key: ${key}`);
      }
      Object.defineProperty(result, key, {
        value: cloneJson(value[key], seen), enumerable: true, writable: true, configurable: true
      });
    }
  }
  seen.delete(value);
  return result;
}

function parsePointer(pointer) {
  if (pointer === '') return [];
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) {
    throw new TypeError('JSON Pointer must be an empty string or start with /');
  }
  return pointer.slice(1).split('/').map(raw => {
    if (/~(?![01])/.test(raw)) throw new TypeError(`Invalid JSON Pointer escape: ${raw}`);
    const part = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (part === '__proto__' || part === 'prototype' || part === 'constructor') {
      throw new TypeError(`Unsafe JSON Pointer segment: ${part}`);
    }
    return part;
  });
}

function arrayIndex(segment, length, allowEnd = false) {
  if (segment === '-' && allowEnd) return length;
  if (!/^(0|[1-9]\d*)$/.test(segment)) throw new TypeError(`Invalid array index: ${segment}`);
  const index = Number(segment);
  const upper = allowEnd ? length : length - 1;
  if (!Number.isSafeInteger(index) || index < 0 || index > upper) {
    throw new RangeError(`Array index out of bounds: ${segment}`);
  }
  return index;
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function getAt(document, segments) {
  let current = document;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      current = current[arrayIndex(segment, current.length)];
    } else if (current && typeof current === 'object' && own(current, segment)) {
      current = current[segment];
    } else {
      throw new RangeError(`Path does not exist at segment: ${segment}`);
    }
  }
  return current;
}

function parentAt(document, segments) {
  if (segments.length === 0) return { parent: null, key: null };
  const parent = getAt(document, segments.slice(0, -1));
  if (!parent || typeof parent !== 'object') throw new TypeError('Path parent is not a container');
  return { parent, key: segments[segments.length - 1] };
}

function addAt(document, segments, value) {
  if (segments.length === 0) return value;
  const { parent, key } = parentAt(document, segments);
  if (Array.isArray(parent)) {
    parent.splice(arrayIndex(key, parent.length, true), 0, value);
  } else {
    Object.defineProperty(parent, key, {
      value, enumerable: true, writable: true, configurable: true
    });
  }
  return document;
}

function removeAt(document, segments) {
  if (segments.length === 0) return { document: undefined, removed: document };
  const { parent, key } = parentAt(document, segments);
  let removed;
  if (Array.isArray(parent)) {
    const index = arrayIndex(key, parent.length);
    [removed] = parent.splice(index, 1);
  } else {
    if (!own(parent, key)) throw new RangeError(`Path does not exist: ${key}`);
    removed = parent[key];
    delete parent[key];
  }
  return { document, removed };
}

function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const key of ak) {
    if (!own(b, key) || !deepEqual(a[key], b[key])) return false;
  }
  return true;
}

function isDescendantPath(from, to) {
  return to.length > from.length && from.every((part, index) => part === to[index]);
}

function applyOperation(document, operation) {
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
    throw new TypeError('Each patch operation must be an object');
  }
  const { op, path } = operation;
  const target = parsePointer(path);
  switch (op) {
    case 'add':
      if (!own(operation, 'value')) throw new TypeError('add requires value');
      return addAt(document, target, cloneJson(operation.value));
    case 'remove':
      return removeAt(document, target).document;
    case 'replace': {
      if (!own(operation, 'value')) throw new TypeError('replace requires value');
      getAt(document, target);
      if (target.length === 0) return cloneJson(operation.value);
      const removed = removeAt(document, target);
      return addAt(removed.document, target, cloneJson(operation.value));
    }
    case 'copy': {
      const source = getAt(document, parsePointer(operation.from));
      return addAt(document, target, cloneJson(source));
    }
    case 'move': {
      const sourcePath = parsePointer(operation.from);
      if (sourcePath.length === target.length && sourcePath.every((part, i) => part === target[i])) return document;
      if (isDescendantPath(sourcePath, target)) throw new TypeError('Cannot move a value into its own descendant');
      const source = getAt(document, sourcePath);
      const removed = removeAt(document, sourcePath);
      return addAt(removed.document, target, source);
    }
    case 'test': {
      if (!own(operation, 'value')) throw new TypeError('test requires value');
      if (!deepEqual(getAt(document, target), operation.value)) {
        throw new Error(`JSON Patch test failed at ${path}`);
      }
      return document;
    }
    default:
      throw new TypeError(`Unsupported patch operation: ${String(op)}`);
  }
}

function applyPatch(document, operations) {
  if (!Array.isArray(operations)) throw new TypeError('Patch must be an array');
  let working = cloneJson(document);
  for (let index = 0; index < operations.length; index++) {
    try {
      working = applyOperation(working, operations[index]);
    } catch (error) {
      error.message = `Patch operation ${index} failed: ${error.message}`;
      throw error;
    }
  }
  return working;
}

function runTests() {
  const original = { profile: { name: 'Ada', tags: ['math', 'logic'] }, active: true };
  const patched = applyPatch(original, [
    { op: 'test', path: '/active', value: true },
    { op: 'replace', path: '/profile/name', value: 'Grace' },
    { op: 'add', path: '/profile/tags/1', value: 'computing' },
    { op: 'copy', from: '/profile/name', path: '/displayName' },
    { op: 'move', from: '/profile/tags/0', path: '/profile/tags/2' },
    { op: 'remove', path: '/active' }
  ]);
  assert.deepEqual(patched, {
    profile: { name: 'Grace', tags: ['computing', 'logic', 'math'] }, displayName: 'Grace'
  });
  assert.deepEqual(original.profile.tags, ['math', 'logic'], 'input must remain unchanged');

  const escaped = applyPatch({ 'a/b': { '~key': 1 } }, [
    { op: 'replace', path: '/a~1b/~0key', value: 2 }
  ]);
  assert.equal(escaped['a/b']['~key'], 2);
  assert.deepEqual(applyPatch([1, 3], [{ op: 'add', path: '/1', value: 2 }]), [1, 2, 3]);
  assert.deepEqual(applyPatch({ x: 1 }, [{ op: 'replace', path: '', value: { y: 2 } }]), { y: 2 });

  const unchanged = { safe: { value: 1 } };
  assert.throws(() => applyPatch(unchanged, [
    { op: 'replace', path: '/safe/value', value: 9 },
    { op: 'test', path: '/safe/value', value: 10 }
  ]), /operation 1 failed/);
  assert.deepEqual(unchanged, { safe: { value: 1 } }, 'failed patch must be transactional');
  assert.throws(() => applyPatch({}, [{ op: 'add', path: '/__proto__/polluted', value: true }]), /Unsafe/);
  assert.equal({}.polluted, undefined);
  assert.throws(() => applyPatch({ a: 1 }, [{ op: 'remove', path: '/missing' }]));
  assert.throws(() => applyPatch({}, [{ op: 'add', path: '/a~2b', value: 1 }]));
  assert.throws(() => applyPatch({ a: [1] }, [{ op: 'add', path: '/a/01', value: 2 }]));
  assert.throws(() => applyPatch({ a: { b: 1 } }, [{ op: 'move', from: '/a', path: '/a/b/c' }]));
  console.log('JSON Patch Engine: all tests passed');
}

if (require.main === module) runTests();
module.exports = { applyPatch, parsePointer, cloneJson, deepEqual, runTests };
