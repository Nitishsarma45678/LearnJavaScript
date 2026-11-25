'use strict';

// Exercise: construct a canonical reduced ordered BDD from a truth table.
// Eliminate redundant tests (low === high), merge identical subgraphs, and
// evaluate assignments without rebuilding the decision structure.

function buildBDD(variables, truthTable) {
  const names = [...variables];
  if (new Set(names).size !== names.length) throw new Error('variable names must be unique');
  if (names.length > 20) throw new RangeError('truth table is too large for this exercise');
  const expected = 2 ** names.length;
  if (!Array.isArray(truthTable) || truthTable.length !== expected ||
      !truthTable.every(value => typeof value === 'boolean')) {
    throw new TypeError('truth table must contain exactly 2^n booleans');
  }

  const nodes = new Map();
  const unique = new Map();
  let nextId = 2;

  function build(level, start, width) {
    if (level === names.length) return truthTable[start] ? 1 : 0;
    const half = width / 2;
    const low = build(level + 1, start, half);
    const high = build(level + 1, start + half, half);
    if (low === high) return low;

    const key = level + ':' + low + ':' + high;
    if (unique.has(key)) return unique.get(key);
    const id = nextId++;
    unique.set(key, id);
    nodes.set(id, Object.freeze({ id, variable: names[level], level, low, high }));
    return id;
  }

  const root = build(0, 0, expected);
  function evaluate(assignment) {
    let id = root;
    while (id > 1) {
      const node = nodes.get(id);
      const value = Array.isArray(assignment) ? assignment[node.level] : assignment[node.variable];
      if (typeof value !== 'boolean') throw new TypeError('missing boolean assignment for ' + node.variable);
      id = value ? node.high : node.low;
    }
    return id === 1;
  }

  return Object.freeze({
    root,
    nodeCount: nodes.size,
    nodes,
    evaluate
  });
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  const variables = ['a', 'b', 'c'];
  const parity = Array.from({ length: 8 }, (_, mask) =>
    Boolean(((mask >> 2) ^ (mask >> 1) ^ mask) & 1));
  const bdd = buildBDD(variables, parity);
  for (let mask = 0; mask < 8; mask++) {
    const assignment = { a: Boolean(mask & 4), b: Boolean(mask & 2), c: Boolean(mask & 1) };
    assert.equal(bdd.evaluate(assignment), parity[mask]);
  }
  const constant = buildBDD(['x', 'y'], [true, true, true, true]);
  assert.equal(constant.nodeCount, 0);
  assert.equal(constant.evaluate({ x: false, y: true }), true);
  assert.throws(() => bdd.evaluate({ a: true }), /missing boolean/);
  console.log('reduced ordered BDD: all tests passed');
}

module.exports = { buildBDD };
