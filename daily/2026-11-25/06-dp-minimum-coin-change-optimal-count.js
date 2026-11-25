'use strict';

// Exercise: return the minimum number of unbounded coins, count how many
// unordered combinations attain that minimum, and reconstruct one witness.

function minimumCoinChange(denominations, amount) {
  if (!Number.isInteger(amount) || amount < 0) throw new RangeError('amount must be non-negative');
  const coins = [...new Set(denominations)];
  if (coins.some(c => !Number.isInteger(c) || c <= 0)) throw new RangeError('coins must be positive integers');
  coins.sort((a, b) => a - b);

  const best = Array(amount + 1).fill(Infinity);
  const ways = Array(amount + 1).fill(0n);
  const previous = Array(amount + 1).fill(null);
  best[0] = 0;
  ways[0] = 1n;

  for (const coin of coins) {
    for (let value = coin; value <= amount; value++) {
      if (best[value - coin] === Infinity) continue;
      const candidate = best[value - coin] + 1;
      if (candidate < best[value]) {
        best[value] = candidate;
        ways[value] = ways[value - coin];
        previous[value] = coin;
      } else if (candidate === best[value]) {
        ways[value] += ways[value - coin];
        if (previous[value] === null || coin < previous[value]) previous[value] = coin;
      }
    }
  }

  if (best[amount] === Infinity) return { minCoins: null, optimalWays: 0n, coins: [] };
  const witness = [];
  for (let value = amount; value > 0;) {
    const coin = previous[value];
    if (coin === null) throw new Error('reconstruction invariant failed');
    witness.push(coin);
    value -= coin;
  }
  return { minCoins: best[amount], optimalWays: ways[amount], coins: witness.sort((a, b) => a - b) };
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  assert.deepEqual(minimumCoinChange([1, 3, 4], 6), {
    minCoins: 2, optimalWays: 1n, coins: [3, 3]
  });
  assert.deepEqual(minimumCoinChange([1, 2, 3], 4), {
    minCoins: 2, optimalWays: 2n, coins: [2, 2]
  });
  assert.deepEqual(minimumCoinChange([4, 6], 5), {
    minCoins: null, optimalWays: 0n, coins: []
  });
  assert.deepEqual(minimumCoinChange([2, 2, 4], 0), {
    minCoins: 0, optimalWays: 1n, coins: []
  });
  assert.throws(() => minimumCoinChange([0, 2], 4), RangeError);
  console.log('minimum coin change: all tests passed');
}

module.exports = { minimumCoinChange };
