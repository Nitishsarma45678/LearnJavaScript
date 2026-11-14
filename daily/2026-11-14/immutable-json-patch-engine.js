'use strict';

// Transactional RFC 6902 JSON Patch engine with RFC 6901 pointer escaping.
// Supports add/remove/replace/move/copy/test. Input is cloned first, so a
// failed operation never exposes a partially modified document.
class PatchError extends Error {
  constructor(message, index, cause) { super(message, { cause }); this.name = 'PatchError'; this.operationIndex = index; }
}
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x) &&
  (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
const own = (x, k) => Object.prototype.hasOwnProperty.call(x, k);

function cloneJSON(x, seen = new Set()) {
  if (x === null || typeof x === 'string' || typeof x === 'boolean') return x;
  if (typeof x === 'number' && Number.isFinite(x)) return x;
  if (typeof x !== 'object') throw new TypeError('value is not JSON-compatible');
  if (seen.has(x)) throw new TypeError('cyclic value is not JSON');
  seen.add(x);
  let out;
  if (Array.isArray(x)) {
    out = x.map(v => cloneJSON(v, seen));
    if (out.length !== x.length || Reflect.ownKeys(x).length !== x.length + 1) throw new TypeError('sparse/extended arrays are not JSON');
  } else {
    if (!plain(x)) throw new TypeError('only plain objects are JSON objects');
    out = Object.create(Object.getPrototypeOf(x));
    for (const key of Reflect.ownKeys(x)) {
      if (typeof key !== 'string') throw new TypeError('symbol keys are not JSON');
      const d = Object.getOwnPropertyDescriptor(x, key);
      if (!d.enumerable || !own(d, 'value')) throw new TypeError('accessors/non-enumerable properties are not JSON');
      Object.defineProperty(out, key, { value: cloneJSON(d.value, seen), enumerable: true, writable: true, configurable: true });
    }
  }
  seen.delete(x); return out;
}
function pointer(path) {
  if (typeof path !== 'string') throw new TypeError('pointer must be a string');
  if (path === '') return [];
  if (!path.startsWith('/')) throw new SyntaxError('pointer must start with /');
  return path.slice(1).split('/').map(s => {
    if (/~(?![01])/.test(s)) throw new SyntaxError('invalid ~ escape');
    return s.replace(/~1/g, '/').replace(/~0/g, '~');
  });
}
function encode(tokens) { return tokens.length ? '/' + tokens.map(s => String(s).replace(/~/g, '~0').replace(/\//g, '~1')).join('/') : ''; }
function indexOf(token, length, allowEnd) {
  if (token === '-' && allowEnd) return length;
  if (!/^(0|[1-9]\d*)$/.test(token)) throw new RangeError('invalid array index: ' + token);
  const i = Number(token);
  if (!Number.isSafeInteger(i) || i > length || (!allowEnd && i === length)) throw new RangeError('array index out of bounds: ' + token);
  return i;
}
function getAt(root, parts) {
  let value = root;
  for (const key of parts) {
    if (Array.isArray(value)) value = value[indexOf(key, value.length, false)];
    else if (plain(value) && own(value, key)) value = value[key];
    else throw new ReferenceError('path does not exist: ' + encode(parts));
  }
  return value;
}
function parentAt(root, parts) {
  if (!parts.length) throw new RangeError('root has no parent');
  return { parent: getAt(root, parts.slice(0, -1)), key: parts[parts.length - 1] };
}
function addAt(root, parts, value) {
  const copy = cloneJSON(value);
  if (!parts.length) return copy;
  const p = parentAt(root, parts);
  if (Array.isArray(p.parent)) p.parent.splice(indexOf(p.key, p.parent.length, true), 0, copy);
  else if (plain(p.parent)) Object.defineProperty(p.parent, p.key, { value: copy, enumerable: true, writable: true, configurable: true });
  else throw new TypeError('parent is not a container');
  return root;
}
function removeAt(root, parts) {
  if (!parts.length) throw new RangeError('removing the document root is unsupported');
  const p = parentAt(root, parts); let value;
  if (Array.isArray(p.parent)) value = p.parent.splice(indexOf(p.key, p.parent.length, false), 1)[0];
  else if (plain(p.parent) && own(p.parent, p.key)) { value = p.parent[p.key]; delete p.parent[p.key]; }
  else throw new ReferenceError('remove target does not exist: ' + encode(parts));
  return { root, value };
}
function replaceAt(root, parts, value) {
  const copy = cloneJSON(value);
  if (!parts.length) return copy;
  const p = parentAt(root, parts);
  if (Array.isArray(p.parent)) p.parent[indexOf(p.key, p.parent.length, false)] = copy;
  else if (plain(p.parent) && own(p.parent, p.key)) Object.defineProperty(p.parent, p.key, { value: copy, enumerable: true, writable: true, configurable: true });
  else throw new ReferenceError('replace target does not exist: ' + encode(parts));
  return root;
}
function equalJSON(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((v, i) => equalJSON(v, b[i]));
  if (!plain(a) || !plain(b)) return false;
  const ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
  return ak.length === bk.length && ak.every((k, i) => k === bk[i] && equalJSON(a[k], b[k]));
}
function applyPatch(document, operations) {
  if (!Array.isArray(operations)) throw new TypeError('operations must be an array');
  let root = cloneJSON(document);
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    try {
      if (!plain(op) || typeof op.op !== 'string' || typeof op.path !== 'string') throw new TypeError('operation needs op and path');
      const path = pointer(op.path);
      switch (op.op) {
        case 'add': if (!own(op, 'value')) throw new TypeError('add needs value'); root = addAt(root, path, op.value); break;
        case 'remove': root = removeAt(root, path).root; break;
        case 'replace': if (!own(op, 'value')) throw new TypeError('replace needs value'); root = replaceAt(root, path, op.value); break;
        case 'test': if (!own(op, 'value') || !equalJSON(getAt(root, path), op.value)) throw new Error('test failed at ' + op.path); break;
        case 'copy': {
          if (typeof op.from !== 'string') throw new TypeError('copy needs from');
          root = addAt(root, path, getAt(root, pointer(op.from))); break;
        }
        case 'move': {
          if (typeof op.from !== 'string') throw new TypeError('move needs from');
          const from = pointer(op.from);
          if (from.length < path.length && from.every((x, j) => x === path[j])) throw new RangeError('cannot move into a descendant');
          if (encode(from) !== op.path) { const removed = removeAt(root, from); root = addAt(removed.root, path, removed.value); }
          break;
        }
        default: throw new TypeError('unsupported operation: ' + op.op);
      }
    } catch (error) { throw new PatchError('operation ' + i + ' failed: ' + error.message, i, error); }
  }
  return root;
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  const original = { profile: { name: 'Ada', roles: ['reader', 'author'] }, 'a/b': { '~key': 3 }, queue: ['first', 'third'] };
  const result = applyPatch(original, [
    { op: 'test', path: '/profile/name', value: 'Ada' },
    { op: 'replace', path: '/profile/name', value: 'Grace' },
    { op: 'add', path: '/profile/roles/-', value: 'admin' },
    { op: 'copy', from: '/profile/roles/0', path: '/queue/1' },
    { op: 'move', from: '/queue/0', path: '/queue/2' },
    { op: 'remove', path: '/a~1b/~0key' },
    { op: 'add', path: '/a~1b/~0key', value: 9 }
  ]);
  assert.equal(original.profile.name, 'Ada');
  assert.equal(result.profile.name, 'Grace');
  assert.deepEqual(result.queue, ['reader', 'third', 'first']);
  assert.deepEqual(result.profile.roles, ['reader', 'author', 'admin']);
  assert.equal(result['a/b']['~key'], 9);
  assert.throws(() => applyPatch(original, [{ op: 'replace', path: '/profile/name', value: 'x' }, { op: 'remove', path: '/missing' }]),
    e => e instanceof PatchError && e.operationIndex === 1);
  assert.equal(original.profile.name, 'Ada');
  assert.throws(() => applyPatch(original, [{ op: 'move', from: '/profile', path: '/profile/name/child' }]), PatchError);
  assert.throws(() => pointer('/bad~2escape'), SyntaxError);
  assert.deepEqual(applyPatch([1, 3], [{ op: 'add', path: '/1', value: 2 }]), [1, 2, 3]);
  assert.deepEqual(applyPatch({ x: 1 }, [{ op: 'add', path: '', value: { safe: true } }]), { safe: true });
  console.log('Transactional JSON Patch Engine: all tests passed');
}
module.exports = { PatchError, applyPatch, cloneJSON, pointer, encode, equalJSON };
