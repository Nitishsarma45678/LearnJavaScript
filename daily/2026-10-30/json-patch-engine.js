'use strict';

/**
 * Transactional JSON Patch engine for RFC 6902 add/remove/replace/move/copy/test.
 * The input is cloned first, so a failed operation never mutates the caller's
 * document. JSON Pointer escaping (~0 and ~1), array insertion, and root
 * replacement are supported. Root removal is intentionally rejected.
 */
function applyJsonPatch(document, operations) {
  if (!Array.isArray(operations)) throw new TypeError('operations must be an array');
  let working = cloneJson(document);
  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index];
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
      throw new TypeError(`operation ${index} must be an object`);
    }
    const { op, path } = operation;
    if (typeof path !== 'string') throw new TypeError(`operation ${index} needs a string path`);
    const parts = parsePointer(path);
    switch (op) {
      case 'add':
        if (!Object.hasOwn(operation, 'value')) throw new TypeError(`add at ${path} needs value`);
        working = addAt(working, parts, cloneJson(operation.value));
        break;
      case 'remove':
        working = removeAt(working, parts).document;
        break;
      case 'replace':
        if (!Object.hasOwn(operation, 'value')) throw new TypeError(`replace at ${path} needs value`);
        assertExists(working, parts);
        working = addAt(working, parts, cloneJson(operation.value), true);
        break;
      case 'copy': {
        const from = requireFrom(operation, index);
        const value = cloneJson(getAt(working, parsePointer(from)));
        working = addAt(working, parts, value);
        break;
      }
      case 'move': {
        const from = requireFrom(operation, index);
        const fromParts = parsePointer(from);
        const movingValue = getAt(working, fromParts);
        if (from === path) break;
        if (fromParts.length < parts.length && fromParts.every((part, i) => part === parts[i])) {
          throw new Error(`cannot move ${from} into its own descendant ${path}`);
        }
        const removed = removeAt(working, fromParts);
        working = addAt(removed.document, parts, movingValue);
        break;
      }
      case 'test':
        if (!Object.hasOwn(operation, 'value')) throw new TypeError(`test at ${path} needs value`);
        if (!jsonEqual(getAt(working, parts), operation.value)) {
          throw new Error(`test operation failed at ${path}`);
        }
        break;
      default:
        throw new TypeError(`unsupported operation '${String(op)}'`);
    }
  }
  return working;
}

function requireFrom(operation, index) {
  if (typeof operation.from !== 'string') throw new TypeError(`operation ${index} needs a string from path`);
  return operation.from;
}

function parsePointer(pointer) {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) throw new SyntaxError(`invalid JSON Pointer '${pointer}'`);
  return pointer.slice(1).split('/').map(segment => {
    if (/~(?![01])/.test(segment)) throw new SyntaxError(`invalid escape in JSON Pointer '${pointer}'`);
    return segment.replace(/~1/g, '/').replace(/~0/g, '~');
  });
}

function cloneJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(cloneJson);
  if (typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    const copy = {};
    for (const key of Object.keys(value)) {
      Object.defineProperty(copy, key, {
        value: cloneJson(value[key]), enumerable: true, writable: true, configurable: true
      });
    }
    return copy;
  }
  throw new TypeError('document and patch values must contain only JSON-compatible values');
}

function arrayIndex(segment, length, allowEnd) {
  if (!/^(0|[1-9]\d*)$/.test(segment)) throw new RangeError(`invalid array index '${segment}'`);
  const index = Number(segment);
  if (!Number.isSafeInteger(index) || index > length || (!allowEnd && index === length)) {
    throw new RangeError(`array index '${segment}' is out of bounds`);
  }
  return index;
}

function getChild(container, key) {
  if (Array.isArray(container)) return container[arrayIndex(key, container.length, false)];
  if (container === null || typeof container !== 'object' || !Object.hasOwn(container, key)) {
    throw new RangeError(`path component '${key}' does not exist`);
  }
  return container[key];
}

function getAt(root, parts) {
  let current = root;
  for (const part of parts) current = getChild(current, part);
  return current;
}

function assertExists(root, parts) {
  if (parts.length === 0) return;
  getAt(root, parts);
}

function locateParent(root, parts) {
  if (parts.length === 0) throw new RangeError('operation requires a non-root path');
  let parent = root;
  for (const part of parts.slice(0, -1)) parent = getChild(parent, part);
  if (parent === null || typeof parent !== 'object') throw new TypeError('path parent is not a container');
  return { parent, key: parts[parts.length - 1] };
}

function addAt(root, parts, value, replacing = false) {
  if (parts.length === 0) return value;
  const { parent, key } = locateParent(root, parts);
  if (Array.isArray(parent)) {
    if (key === '-' && !replacing) {
      parent.push(value);
    } else {
      const index = arrayIndex(key, parent.length, !replacing);
      if (replacing) parent[index] = value;
      else parent.splice(index, 0, value);
    }
  } else if (replacing && !Object.hasOwn(parent, key)) {
    throw new RangeError(`path component '${key}' does not exist`);
  } else {
    Object.defineProperty(parent, key, { value, enumerable: true, writable: true, configurable: true });
  }
  return root;
}

function removeAt(root, parts) {
  if (parts.length === 0) throw new RangeError('root removal is not supported');
  const { parent, key } = locateParent(root, parts);
  if (Array.isArray(parent)) {
    const index = arrayIndex(key, parent.length, false);
    return { document: root, value: parent.splice(index, 1)[0] };
  }
  if (!Object.hasOwn(parent, key)) throw new RangeError(`path component '${key}' does not exist`);
  const value = parent[key];
  delete parent[key];
  return { document: root, value };
}

function jsonEqual(left, right) {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length || leftKeys.some((key, i) => key !== rightKeys[i])) return false;
  return leftKeys.every(key => jsonEqual(left[key], right[key]));
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  const original = { name: 'Ada', tags: ['math', 'logic'], profile: { active: true } };
  const patched = applyJsonPatch(original, [
    { op: 'test', path: '/name', value: 'Ada' },
    { op: 'add', path: '/tags/1', value: 'coding' },
    { op: 'replace', path: '/profile/active', value: false },
    { op: 'copy', from: '/name', path: '/alias' },
    { op: 'move', from: '/tags/0', path: '/tags/2' }
  ]);
  assert.deepEqual(patched, { name: 'Ada', tags: ['coding', 'logic', 'math'], profile: { active: false }, alias: 'Ada' });
  assert.deepEqual(original, { name: 'Ada', tags: ['math', 'logic'], profile: { active: true } });

  const escaped = applyJsonPatch({}, [
    { op: 'add', path: '/a~1b', value: {} },
    { op: 'add', path: '/a~1b/~0key', value: 7 },
    { op: 'add', path: '/__proto__', value: {} },
    { op: 'add', path: '/__proto__/safe', value: true }
  ]);
  assert.equal(escaped['a/b']['~key'], 7);
  assert.equal(Object.hasOwn(escaped, '__proto__'), true);
  assert.equal({}.safe, undefined);
  assert.deepEqual(applyJsonPatch([1, 3], [{ op: 'add', path: '/1', value: 2 }, { op: 'add', path: '/-', value: 4 }]), [1, 2, 3, 4]);
  assert.deepEqual(applyJsonPatch({ a: 1 }, [{ op: 'replace', path: '', value: { b: 2 } }]), { b: 2 });
  assert.throws(() => applyJsonPatch(original, [{ op: 'replace', path: '/name', value: 'Grace' }, { op: 'test', path: '/name', value: 'Ada' }]), /test operation failed/);
  assert.deepEqual(original, { name: 'Ada', tags: ['math', 'logic'], profile: { active: true } });
  assert.throws(() => applyJsonPatch({ a: {} }, [{ op: 'move', from: '/a', path: '/a/child' }]), /own descendant/);
  assert.throws(() => applyJsonPatch({}, [{ op: 'move', from: '/missing', path: '/missing' }]), /does not exist/);
  assert.throws(() => applyJsonPatch({}, [{ op: 'remove', path: '' }]), /root removal/);
  assert.throws(() => applyJsonPatch({}, [{ op: 'add', path: '/bad~2escape', value: 1 }]), /invalid escape/);
  console.log('JSON Patch engine tests passed');
}

module.exports = { applyJsonPatch };
