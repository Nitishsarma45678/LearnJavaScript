const assert = require('node:assert/strict');

function encodeGraph(root) {
  const seen = new WeakMap();
  const nodes = [];

  function encode(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (Number.isNaN(value)) return { $number: 'NaN' };
      if (value === Infinity) return { $number: 'Infinity' };
      if (value === -Infinity) return { $number: '-Infinity' };
      if (Object.is(value, -0)) return { $number: '-0' };
      return value;
    }
    if (typeof value === 'undefined') return { $type: 'undefined' };
    if (typeof value === 'bigint') return { $type: 'bigint', value: value.toString() };
    if (typeof value === 'symbol' || typeof value === 'function') {
      throw new TypeError('symbols and functions are not supported');
    }
    if (seen.has(value)) return { $ref: seen.get(value) };

    const id = nodes.length;
    seen.set(value, id);
    nodes.push(null);
    let node;

    if (Array.isArray(value)) {
      node = { type: 'Array', values: value.map(encode) };
    } else if (value instanceof Date) {
      node = { type: 'Date', value: Number.isNaN(value.getTime()) ? null : value.toISOString() };
    } else if (value instanceof RegExp) {
      node = { type: 'RegExp', source: value.source, flags: value.flags, lastIndex: value.lastIndex };
    } else if (value instanceof Map) {
      node = { type: 'Map', entries: [...value].map(([k, v]) => [encode(k), encode(v)]) };
    } else if (value instanceof Set) {
      node = { type: 'Set', values: [...value].map(encode) };
    } else {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError('only plain objects and supported built-ins are supported');
      }
      node = {
        type: 'Object',
        nullPrototype: prototype === null,
        entries: Object.keys(value).map(key => [key, encode(value[key])])
      };
    }
    nodes[id] = node;
    return { $ref: id };
  }

  return { root: encode(root), nodes };
}

function decodeGraph(document) {
  if (!document || !Array.isArray(document.nodes)) throw new TypeError('invalid graph document');
  const shells = document.nodes.map(node => {
    if (!node || typeof node.type !== 'string') throw new TypeError('invalid node');
    switch (node.type) {
      case 'Array': return [];
      case 'Date': return new Date(node.value === null ? NaN : node.value);
      case 'RegExp': return new RegExp(node.source, node.flags);
      case 'Map': return new Map();
      case 'Set': return new Set();
      case 'Object': return Object.create(node.nullPrototype ? null : Object.prototype);
      default: throw new TypeError('unknown node type: ' + node.type);
    }
  });

  function decode(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Object.hasOwn(value, '$ref')) {
      const id = value.$ref;
      if (!Number.isInteger(id) || id < 0 || id >= shells.length) throw new TypeError('invalid reference');
      return shells[id];
    }
    if (value.$type === 'undefined') return undefined;
    if (value.$type === 'bigint') return BigInt(value.value);
    if (value.$number === 'NaN') return NaN;
    if (value.$number === 'Infinity') return Infinity;
    if (value.$number === '-Infinity') return -Infinity;
    if (value.$number === '-0') return -0;
    throw new TypeError('invalid encoded value');
  }

  document.nodes.forEach((node, id) => {
    const target = shells[id];
    if (node.type === 'Array') {
      for (const value of node.values) target.push(decode(value));
    } else if (node.type === 'RegExp') {
      target.lastIndex = node.lastIndex;
    } else if (node.type === 'Map') {
      for (const [key, value] of node.entries) target.set(decode(key), decode(value));
    } else if (node.type === 'Set') {
      for (const value of node.values) target.add(decode(value));
    } else if (node.type === 'Object') {
      for (const [key, value] of node.entries) {
        Object.defineProperty(target, key, { value: decode(value), enumerable: true, writable: true, configurable: true });
      }
    }
  });
  return decode(document.root);
}

const original = { label: 'root', count: 12n, missing: undefined, score: NaN };
original.self = original;
original.children = [new Date('2024-01-02T03:04:05.000Z'), /ab+/gi];
original.map = new Map([[original, new Set(['x', 'y'])]]);
const restored = decodeGraph(JSON.parse(JSON.stringify(encodeGraph(original))));
assert.equal(restored.self, restored);
assert.equal(restored.count, 12n);
assert.equal(restored.missing, undefined);
assert.ok(Number.isNaN(restored.score));
assert.equal(restored.children[0].toISOString(), '2024-01-02T03:04:05.000Z');
assert.equal(restored.children[1].flags, 'gi');
assert.equal(restored.map.get(restored).has('x'), true);
assert.throws(() => encodeGraph(() => {}), TypeError);
console.log('Object graph codec tests passed');
