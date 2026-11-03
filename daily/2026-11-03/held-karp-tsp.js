const assert = require('node:assert/strict');

function heldKarp(costs, start = 0) {
  const n = costs.length;
  if (n < 1 || n > 18 || costs.some(row => !Array.isArray(row) || row.length !== n)) {
    throw new RangeError('cost matrix must be square with 1 to 18 vertices');
  }
  if (!Number.isInteger(start) || start < 0 || start >= n) throw new RangeError('invalid start vertex');
  for (const row of costs) {
    for (const value of row) {
      if (value !== null && value !== Infinity && !Number.isFinite(value)) {
        throw new TypeError('edge costs must be finite numbers, null, or Infinity');
      }
    }
  }
  if (n === 1) return { cost: 0, path: [start, start] };

  const stateCount = 1 << n;
  const dp = new Float64Array(stateCount * n);
  dp.fill(Infinity);
  const parent = new Int8Array(stateCount * n);
  parent.fill(-1);
  const initialMask = 1 << start;
  dp[initialMask * n + start] = 0;

  for (let mask = 0; mask < stateCount; mask++) {
    if ((mask & initialMask) === 0) continue;
    for (let u = 0; u < n; u++) {
      const current = dp[mask * n + u];
      if (!Number.isFinite(current)) continue;
      for (let v = 0; v < n; v++) {
        const bit = 1 << v;
        const edgeCost = costs[u][v];
        if ((mask & bit) !== 0 || edgeCost === null || edgeCost === Infinity) continue;
        const nextMask = mask | bit;
        const nextIndex = nextMask * n + v;
        const candidate = current + edgeCost;
        if (candidate < dp[nextIndex]) {
          dp[nextIndex] = candidate;
          parent[nextIndex] = u;
        }
      }
    }
  }

  const fullMask = stateCount - 1;
  let bestCost = Infinity;
  let last = -1;
  for (let u = 0; u < n; u++) {
    const backEdge = costs[u][start];
    if (u === start || backEdge === null || backEdge === Infinity) continue;
    const candidate = dp[fullMask * n + u] + backEdge;
    if (candidate < bestCost) { bestCost = candidate; last = u; }
  }
  if (last === -1 || !Number.isFinite(bestCost)) return { cost: Infinity, path: [] };

  const reversed = [];
  let mask = fullMask;
  let vertex = last;
  while (vertex !== -1) {
    reversed.push(vertex);
    if (vertex === start) break;
    const previous = parent[mask * n + vertex];
    mask ^= 1 << vertex;
    vertex = previous;
  }
  if (reversed[reversed.length - 1] !== start) throw new Error('path reconstruction failed');
  const path = reversed.reverse();
  path.push(start);
  return { cost: bestCost, path };
}

const sample = [
  [0, 10, 15, 20],
  [10, 0, 35, 25],
  [15, 35, 0, 30],
  [20, 25, 30, 0]
];
const result = heldKarp(sample);
assert.equal(result.cost, 80);
assert.equal(result.path[0], 0);
assert.equal(result.path[result.path.length - 1], 0);
assert.equal(new Set(result.path.slice(0, -1)).size, 4);
assert.deepEqual(heldKarp([[0]]), { cost: 0, path: [0, 0] });
assert.deepEqual(heldKarp([[0, null], [null, 0]]), { cost: Infinity, path: [] });
assert.equal(heldKarp(sample, 2).cost, 80);
console.log('Held-Karp TSP tests passed');
