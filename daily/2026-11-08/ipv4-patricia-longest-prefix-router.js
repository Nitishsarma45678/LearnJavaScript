'use strict';

const IPV4_BITS = 32;
const IPV4_LIMIT = 1n << 32n;

function parseIPv4(address) {
  if (typeof address !== 'string') throw new TypeError('IPv4 address must be a string');
  const parts = address.split('.');
  if (parts.length !== 4) throw new TypeError(`invalid IPv4 address: ${address}`);
  let value = 0n;
  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) throw new TypeError(`invalid IPv4 octet: ${part}`);
    const octet = Number(part);
    if (octet > 255) throw new RangeError(`IPv4 octet out of range: ${part}`);
    value = (value << 8n) | BigInt(octet);
  }
  return value;
}

function formatIPv4(value) {
  if (typeof value !== 'bigint' || value < 0n || value >= IPV4_LIMIT) throw new RangeError('IPv4 value out of range');
  return [24n, 16n, 8n, 0n].map(shift => Number((value >> shift) & 255n)).join('.');
}

function prefixMask(length) {
  if (!Number.isInteger(length) || length < 0 || length > IPV4_BITS) throw new RangeError('prefix length must be between 0 and 32');
  return length === 0 ? 0n : ((1n << BigInt(length)) - 1n) << BigInt(IPV4_BITS - length);
}

function parseCIDR(cidr) {
  if (typeof cidr !== 'string') throw new TypeError('CIDR must be a string');
  const match = /^(.*)\/(\d{1,2})$/.exec(cidr);
  if (!match) throw new TypeError(`invalid CIDR notation: ${cidr}`);
  const address = parseIPv4(match[1]);
  const length = Number(match[2]);
  return { network: address & prefixMask(length), length };
}

function bitAt(address, index) {
  return Number((address >> BigInt(IPV4_BITS - 1 - index)) & 1n);
}

function commonPrefixLength(a, b, limit) {
  let length = 0;
  while (length < limit && bitAt(a, length) === bitAt(b, length)) length += 1;
  return length;
}

function makeNode(network, length) {
  return { network, length, hasValue: false, value: undefined, zero: null, one: null };
}

/**
 * Compressed binary prefix trie for IPv4 routing. Insert and delete split or
 * collapse Patricia nodes; lookup returns the most-specific matching route.
 */
class IPv4PatriciaRouter {
  constructor() {
    this.root = null;
    this.routeCount = 0;
  }

  insert(cidr, value) {
    const prefix = parseCIDR(cidr);
    const inserted = { value: false };
    this.root = this._insert(this.root, prefix.network, prefix.length, value, inserted);
    if (inserted.value) this.routeCount += 1;
    return this;
  }

  _insert(node, network, length, value, inserted) {
    if (node === null) {
      const leaf = makeNode(network, length);
      leaf.hasValue = true;
      leaf.value = value;
      inserted.value = true;
      return leaf;
    }

    const shared = commonPrefixLength(network, node.network, Math.min(length, node.length));
    if (shared < node.length) {
      const parent = makeNode(network & prefixMask(shared), shared);
      if (bitAt(node.network, shared) === 0) parent.zero = node;
      else parent.one = node;

      if (length === shared) {
        parent.hasValue = true;
        parent.value = value;
      } else {
        const leaf = makeNode(network, length);
        leaf.hasValue = true;
        leaf.value = value;
        if (bitAt(network, shared) === 0) parent.zero = leaf;
        else parent.one = leaf;
      }
      inserted.value = true;
      return parent;
    }

    if (length === node.length) {
      if (!node.hasValue) inserted.value = true;
      node.hasValue = true;
      node.value = value;
      return node;
    }

    const branch = bitAt(network, node.length);
    if (branch === 0) node.zero = this._insert(node.zero, network, length, value, inserted);
    else node.one = this._insert(node.one, network, length, value, inserted);
    return node;
  }

  delete(cidr) {
    const prefix = parseCIDR(cidr);
    const removed = { value: false };
    this.root = this._delete(this.root, prefix.network, prefix.length, removed);
    if (removed.value) this.routeCount -= 1;
    return removed.value;
  }

  _delete(node, network, length, removed) {
    if (node === null) return null;
    const shared = commonPrefixLength(network, node.network, Math.min(length, node.length));
    if (shared < Math.min(length, node.length)) return node;

    if (length === node.length) {
      if (!node.hasValue) return node;
      node.hasValue = false;
      node.value = undefined;
      removed.value = true;
    } else if (length > node.length) {
      const branch = bitAt(network, node.length);
      if (branch === 0) node.zero = this._delete(node.zero, network, length, removed);
      else node.one = this._delete(node.one, network, length, removed);
    } else {
      return node;
    }

    if (node.hasValue) return node;
    if (node.zero === null) return node.one;
    if (node.one === null) return node.zero;
    return node;
  }

  lookup(address) {
    const value = parseIPv4(address);
    let node = this.root;
    let best = null;
    while (node !== null) {
      if (commonPrefixLength(value, node.network, node.length) !== node.length) break;
      if (node.hasValue) best = node;
      if (node.length === IPV4_BITS) break;
      node = bitAt(value, node.length) === 0 ? node.zero : node.one;
    }
    return best === null ? null : {
      cidr: `${formatIPv4(best.network)}/${best.length}`,
      network: formatIPv4(best.network),
      prefixLength: best.length,
      value: best.value
    };
  }

  routes() {
    const result = [];
    const visit = node => {
      if (!node) return;
      if (node.hasValue) result.push({ cidr: `${formatIPv4(node.network)}/${node.length}`, value: node.value });
      visit(node.zero);
      visit(node.one);
    };
    visit(this.root);
    return result.sort((a, b) => {
      const pa = parseCIDR(a.cidr), pb = parseCIDR(b.cidr);
      return pa.network < pb.network ? -1 : pa.network > pb.network ? 1 : pa.length - pb.length;
    });
  }
}

function runTests() {
  const assert = require('node:assert/strict');
  const router = new IPv4PatriciaRouter();
  router.insert('0.0.0.0/0', 'default');
  router.insert('10.0.0.0/8', 'private');
  router.insert('10.24.0.0/16', 'campus');
  router.insert('10.24.8.0/21', 'lab');
  assert.equal(router.lookup('203.0.113.8').value, 'default');
  assert.equal(router.lookup('10.99.2.1').cidr, '10.0.0.0/8');
  assert.equal(router.lookup('10.24.1.1').value, 'campus');
  assert.equal(router.lookup('10.24.9.1').value, 'lab');
  assert.equal(router.routeCount, 4);
  assert.equal(router.delete('10.24.0.0/16'), true);
  assert.equal(router.lookup('10.24.1.1').value, 'private');
  assert.equal(router.delete('10.24.0.0/16'), false);
  assert.equal(router.routeCount, 3);
  assert.equal(router.delete('0.0.0.0/0'), true);
  assert.equal(router.lookup('203.0.113.8'), null);
  assert.throws(() => router.insert('300.1.1.1/8', 'bad'), RangeError);
  assert.throws(() => router.insert('10.0.0.0/33', 'bad'), RangeError);

  // Differential checks against a simple longest-prefix scan.
  let seed = 0x31415926;
  const random = max => ((seed = (seed * 1664525 + 1013904223) >>> 0) % max);
  const reference = new Map();
  const tested = new IPv4PatriciaRouter();
  const randomAddress = () => (BigInt(random(256)) << 24n) |
    (BigInt(random(256)) << 16n) | (BigInt(random(256)) << 8n) | BigInt(random(256));
  for (let step = 0; step < 600; step += 1) {
    const length = random(33);
    const network = randomAddress() & prefixMask(length);
    const cidr = `${formatIPv4(network)}/${length}`;
    if (random(3) !== 0 || reference.size === 0) {
      const value = `route-${step}`;
      tested.insert(cidr, value);
      reference.set(cidr, value);
    } else {
      const key = [...reference.keys()][random(reference.size)];
      assert.equal(tested.delete(key), true);
      reference.delete(key);
    }

    for (let sample = 0; sample < 4; sample += 1) {
      const address = randomAddress();
      let expected = null, bestLength = -1;
      for (const [key, routeValue] of reference) {
        const prefix = parseCIDR(key);
        if ((address & prefixMask(prefix.length)) === prefix.network && prefix.length > bestLength) {
          bestLength = prefix.length;
          expected = { cidr: key, value: routeValue };
        }
      }
      const actual = tested.lookup(formatIPv4(address));
      assert.equal(actual?.cidr ?? null, expected?.cidr ?? null);
      assert.equal(actual?.value ?? null, expected?.value ?? null);
    }
  }
  assert.equal(tested.routeCount, reference.size);
  console.log('IPv4 Patricia router tests passed');
}

if (require.main === module) runTests();
module.exports = { IPv4PatriciaRouter, parseIPv4, formatIPv4, parseCIDR, prefixMask };
