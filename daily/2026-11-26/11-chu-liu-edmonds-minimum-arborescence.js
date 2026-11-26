'use strict';

// Exercise: find the minimum-cost directed spanning arborescence rooted at
// a chosen vertex using Chu-Liu/Edmonds cycle contraction. Returns cost only.

const assert = require('node:assert/strict');

function minimumArborescence(nodeCount, root, edges) {
  if (!Number.isInteger(nodeCount) || nodeCount < 1 ||
      !Number.isInteger(root) || root < 0 || root >= nodeCount || !Array.isArray(edges)) {
    throw new TypeError('invalid graph dimensions or root');
  }
  for (const edge of edges) {
    if (!Number.isInteger(edge.from) || !Number.isInteger(edge.to) ||
        edge.from < 0 || edge.from >= nodeCount || edge.to < 0 || edge.to >= nodeCount ||
        typeof edge.weight !== 'number' || !Number.isFinite(edge.weight)) {
      throw new TypeError('invalid directed edge');
    }
  }

  function solve(n, r, arcs) {
    const incoming = Array(n).fill(null);
    for (const edge of arcs) {
      if (edge.from !== edge.to && edge.to !== r &&
          (!incoming[edge.to] || edge.weight < incoming[edge.to].weight)) {
        incoming[edge.to] = edge;
      }
    }
    for (let v = 0; v < n; v += 1) {
      if (v !== r && !incoming[v]) return null;
    }

    let total = 0;
    for (let v = 0; v < n; v += 1) if (v !== r) total += incoming[v].weight;

    const component = Array(n).fill(-1);
    const seen = Array(n).fill(-1);
    let cycleCount = 0;

    for (let start = 0; start < n; start += 1) {
      let v = start;
      while (v !== r && component[v] === -1 && seen[v] !== start) {
        seen[v] = start;
        v = incoming[v].from;
      }
      if (v !== r && component[v] === -1) {
        component[v] = cycleCount;
        for (let u = incoming[v].from; u !== v; u = incoming[u].from) {
          component[u] = cycleCount;
        }
        cycleCount += 1;
      }
    }

    if (cycleCount === 0) return total;
    let nextCount = cycleCount;
    for (let v = 0; v < n; v += 1) {
      if (component[v] === -1) component[v] = nextCount++;
    }

    const contracted = [];
    for (const edge of arcs) {
      const from = component[edge.from];
      const to = component[edge.to];
      if (from !== to) {
        const adjusted = edge.weight - (edge.to === r ? 0 : incoming[edge.to].weight);
        contracted.push({ from, to, weight: adjusted });
      }
    }

    const remainder = solve(nextCount, component[r], contracted);
    return remainder === null ? null : total + remainder;
  }

  return solve(nodeCount, root, edges);
}

assert.equal(minimumArborescence(3, 0, [
  { from: 0, to: 1, weight: 5 },
  { from: 0, to: 2, weight: 5 },
  { from: 1, to: 2, weight: 1 },
  { from: 2, to: 1, weight: 1 }
]), 6);
assert.equal(minimumArborescence(4, 0, [
  { from: 0, to: 1, weight: 2 },
  { from: 0, to: 2, weight: 8 },
  { from: 1, to: 2, weight: 1 },
  { from: 1, to: 3, weight: 4 },
  { from: 2, to: 3, weight: 1 }
]), 4);
assert.equal(minimumArborescence(3, 0, [{ from: 1, to: 2, weight: 1 }]), null);
assert.throws(() => minimumArborescence(2, 2, []), TypeError);

module.exports = { minimumArborescence };
