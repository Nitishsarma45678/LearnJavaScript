'use strict';

/**
 * EXERCISE: Reconcile keyed sibling lists with a minimum-move strategy.
 *
 * Each virtual node has { key, type, props }. Keys must be unique within a
 * sibling list. The diff emits remove/insert/move/replace/update operations.
 * A longest-increasing-subsequence (LIS) pass identifies nodes that can remain
 * in place, minimizing moves for retained keys.
 *
 * Patches use `beforeKey` anchors and are applied from right to left, so the
 * algorithm does not depend on fragile intermediate numeric indexes.
 *
 * Run: node keyed-list-reconciler.js
 */

function validateNodes(nodes, label) {
  if (!Array.isArray(nodes)) throw new TypeError(`${label} must be an array`);
  const keys = new Set();
  for (const node of nodes) {
    if (!node || (typeof node.key !== 'string' && typeof node.key !== 'number')) {
      throw new TypeError(`${label} nodes require string or number keys`);
    }
    if (keys.has(node.key)) throw new Error(`Duplicate key in ${label}: ${String(node.key)}`);
    keys.add(node.key);
    if (typeof node.type !== 'string') throw new TypeError('node.type must be a string');
    if (!node.props || typeof node.props !== 'object' || Array.isArray(node.props)) {
      throw new TypeError('node.props must be an object');
    }
  }
}

function sameProps(a, b) {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every(key => Object.prototype.hasOwnProperty.call(b, key) && Object.is(a[key], b[key]));
}

function longestIncreasingSubsequenceIndices(values) {
  const tails = [];
  const previous = new Array(values.length).fill(-1);
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (value === 0) continue; // zero marks a newly inserted node
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (values[tails[mid]] < value) low = mid + 1;
      else high = mid;
    }
    if (low > 0) previous[i] = tails[low - 1];
    tails[low] = i;
  }
  const result = new Set();
  let cursor = tails.length ? tails[tails.length - 1] : -1;
  while (cursor !== -1) {
    result.add(cursor);
    cursor = previous[cursor];
  }
  return result;
}

function diffKeyedList(oldNodes, newNodes) {
  validateNodes(oldNodes, 'oldNodes');
  validateNodes(newNodes, 'newNodes');
  const oldIndex = new Map(oldNodes.map((node, index) => [node.key, index]));
  const newKeys = new Set(newNodes.map(node => node.key));
  const patches = [];

  // Remove absent keys from right to left so each intermediate index is valid
  // for consumers that choose to log or inspect the operations.
  for (let i = oldNodes.length - 1; i >= 0; i--) {
    if (!newKeys.has(oldNodes[i].key)) patches.push({ op: 'remove', key: oldNodes[i].key });
  }

  const oldPositions = newNodes.map(node => oldIndex.has(node.key) ? oldIndex.get(node.key) + 1 : 0);
  const stable = longestIncreasingSubsequenceIndices(oldPositions);
  let anchor = null;

  for (let i = newNodes.length - 1; i >= 0; i--) {
    const node = newNodes[i];
    if (!oldIndex.has(node.key)) {
      patches.push({ op: 'insert', node, beforeKey: anchor });
    } else if (!stable.has(i)) {
      patches.push({ op: 'move', key: node.key, beforeKey: anchor });
    }
    anchor = node.key;
  }

  // Content patches are separate from structural patches. A type change keeps
  // the key but replaces the rendered node at its final position.
  for (const node of newNodes) {
    const index = oldIndex.get(node.key);
    if (index === undefined) continue;
    const old = oldNodes[index];
    if (old.type !== node.type) {
      patches.push({ op: 'replace', key: node.key, node });
    } else if (!sameProps(old.props, node.props)) {
      patches.push({ op: 'update', key: node.key, props: node.props });
    }
  }
  return patches;
}

function applyPatches(oldNodes, patches) {
  const result = oldNodes.slice();
  const findIndex = key => result.findIndex(node => node.key === key || (Number.isNaN(node.key) && Number.isNaN(key)));
  for (const patch of patches) {
    if (patch.op === 'remove') {
      const index = findIndex(patch.key);
      if (index !== -1) result.splice(index, 1);
    } else if (patch.op === 'insert') {
      const index = patch.beforeKey === null ? result.length : findIndex(patch.beforeKey);
      if (index === -1) throw new Error(`Missing insertion anchor: ${String(patch.beforeKey)}`);
      result.splice(index, 0, patch.node);
    } else if (patch.op === 'move') {
      const from = findIndex(patch.key);
      if (from === -1) throw new Error(`Cannot move missing key: ${String(patch.key)}`);
      const [node] = result.splice(from, 1);
      const to = patch.beforeKey === null ? result.length : findIndex(patch.beforeKey);
      if (to === -1) throw new Error(`Missing move anchor: ${String(patch.beforeKey)}`);
      result.splice(to, 0, node);
    } else if (patch.op === 'replace') {
      const index = findIndex(patch.key);
      if (index === -1) throw new Error(`Cannot replace missing key: ${String(patch.key)}`);
      result[index] = patch.node;
    } else if (patch.op === 'update') {
      const index = findIndex(patch.key);
      if (index === -1) throw new Error(`Cannot update missing key: ${String(patch.key)}`);
      result[index] = { ...result[index], props: patch.props };
    } else {
      throw new Error(`Unknown patch operation: ${patch.op}`);
    }
  }
  return result;
}

function runTests() {
  const assert = require('node:assert/strict');
  const node = (key, props = {}, type = 'li') => ({ key, type, props });
  const oldNodes = [node('a'), node('b'), node('c'), node('d')];
  const newNodes = [node('d'), node('b', { selected: true }), node('e'), node('a')];
  const patches = diffKeyedList(oldNodes, newNodes);
  const result = applyPatches(oldNodes, patches);
  assert.deepEqual(result, newNodes);
  assert.equal(patches.filter(p => p.op === 'move').length, 2);
  assert.equal(patches.filter(p => p.op === 'remove').length, 1); // only c is removed

  const replaced = applyPatches([node('x')], diffKeyedList([node('x')], [node('x', {}, 'button')]));
  assert.equal(replaced[0].type, 'button');
  const unchanged = diffKeyedList(oldNodes, oldNodes.map(item => ({ ...item, props: { ...item.props } })));
  assert.deepEqual(unchanged, []);
  assert.throws(() => diffKeyedList([node('x'), node('x')], []), /Duplicate key/);
  assert.throws(() => diffKeyedList([], [{ key: 'x', props: {} }]), /node.type/);

  // Random permutations/insertions/deletions must always reconstruct the target.
  let seed = 0x12345678;
  const random = max => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % max;
  };
  for (let trial = 0; trial < 300; trial++) {
    const pool = Array.from({ length: 12 }, (_, i) => `k${i}`);
    const oldKeys = pool.filter(() => random(2) === 0);
    const newKeys = pool.filter(() => random(2) === 0);
    for (let i = oldKeys.length - 1; i > 0; i--) {
      const j = random(i + 1);
      [oldKeys[i], oldKeys[j]] = [oldKeys[j], oldKeys[i]];
    }
    for (let i = newKeys.length - 1; i > 0; i--) {
      const j = random(i + 1);
      [newKeys[i], newKeys[j]] = [newKeys[j], newKeys[i]];
    }
    const before = oldKeys.map(key => node(key, { value: key }));
    const after = newKeys.map((key, index) => node(key, { value: index }));
    const trialPatches = diffKeyedList(before, after);
    assert.deepEqual(applyPatches(before, trialPatches), after);
    const retained = new Set(oldKeys.filter(key => newKeys.includes(key))).size;
    const positions = newKeys.map(key => { const index = oldKeys.indexOf(key); return index < 0 ? 0 : index + 1; });
    const minimumMoves = retained - longestIncreasingSubsequenceIndices(positions).size;
    assert.equal(trialPatches.filter(patch => patch.op === 'move').length, minimumMoves);
  }

  console.log('keyed-list-reconciler: all tests passed');
}

if (require.main === module) runTests();
module.exports = { diffKeyedList, applyPatches, longestIncreasingSubsequenceIndices, runTests };
