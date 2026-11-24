'use strict';

const assert = require('node:assert/strict');

function parseIPv4(address) {
  const parts = address.split('.');
  if (parts.length !== 4 || parts.some(part => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)) {
    throw new TypeError('Invalid IPv4 address: ' + address);
  }
  return parts.reduce((value, part) => value * 256 + Number(part), 0);
}

function formatIPv4(value) {
  return [24, 16, 8, 0].map(shift => Math.floor(value / (2 ** shift)) % 256).join('.');
}

function mask(value, length) {
  if (length === 0) return 0;
  const block = 2 ** (32 - length);
  return Math.floor(value / block) * block;
}

function bitAt(value, index) {
  return Math.floor(value / (2 ** (31 - index))) % 2;
}

function commonPrefix(a, aLength, b, bLength) {
  const limit = Math.min(aLength, bLength);
  let index = 0;
  while (index < limit && bitAt(a, index) === bitAt(b, index)) index++;
  return index;
}

class PatriciaIPv4Trie {
  constructor() {
    this.root = null;
    this.size = 0;
  }

  insert(address, length, value) {
    if (!Number.isInteger(length) || length < 0 || length > 32) throw new RangeError('Prefix length must be 0..32');
    if (value === undefined) throw new TypeError('Route value cannot be undefined');
    const ip = parseIPv4(address);
    const prefix = mask(ip, length);
    const leaf = { prefix, length, value, zero: null, one: null };

    if (!this.root) {
      this.root = leaf;
      this.size++;
      return this;
    }

    let current = this.root;
    let parent = null;
    let parentSide = null;
    while (true) {
      const shared = commonPrefix(prefix, length, current.prefix, current.length);
      if (shared < current.length) {
        const branch = { prefix: mask(prefix, shared), length: shared, value: undefined, zero: null, one: null };
        branch[bitAt(current.prefix, shared) ? 'one' : 'zero'] = current;
        if (length === shared) branch.value = value;
        else branch[bitAt(prefix, shared) ? 'one' : 'zero'] = leaf;
        if (parent) parent[parentSide] = branch;
        else this.root = branch;
        this.size++;
        return this;
      }
      if (length === current.length) {
        if (current.value === undefined) this.size++;
        current.value = value;
        return this;
      }
      const side = bitAt(prefix, current.length) ? 'one' : 'zero';
      if (!current[side]) {
        current[side] = leaf;
        this.size++;
        return this;
      }
      parent = current;
      parentSide = side;
      current = current[side];
    }
  }

  lookup(address) {
    const ip = parseIPv4(address);
    let current = this.root;
    let best = null;
    while (current) {
      if (mask(ip, current.length) !== current.prefix) break;
      if (current.value !== undefined) best = {
        prefix: formatIPv4(current.prefix), length: current.length, value: current.value
      };
      if (current.length === 32) break;
      current = current[bitAt(ip, current.length) ? 'one' : 'zero'];
    }
    return best;
  }
}

const routes = new PatriciaIPv4Trie();
routes.insert('0.0.0.0', 0, 'default');
routes.insert('10.0.0.0', 8, 'private-10');
routes.insert('10.1.0.0', 16, 'campus');
routes.insert('10.1.2.0', 24, 'lab');
routes.insert('192.168.4.9', 32, 'host');
assert.equal(routes.lookup('8.8.8.8').value, 'default');
assert.equal(routes.lookup('10.9.1.2').value, 'private-10');
assert.equal(routes.lookup('10.1.9.2').value, 'campus');
assert.equal(routes.lookup('10.1.2.99').value, 'lab');
assert.equal(routes.lookup('192.168.4.9').value, 'host');
assert.equal(routes.lookup('192.168.4.10').value, 'default');
assert.equal(routes.size, 5);
assert.throws(() => parseIPv4('300.1.2.3'), TypeError);
console.log('Patricia IPv4 examples passed.');

module.exports = { parseIPv4, formatIPv4, PatriciaIPv4Trie };
