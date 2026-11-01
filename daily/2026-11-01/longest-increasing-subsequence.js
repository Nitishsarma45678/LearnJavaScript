const assert = require('node:assert/strict');

function longestIncreasingSubsequence(values) {
  const tails = [], tailIndices = [], previous = Array(values.length).fill(-1);
  for (let i = 0; i < values.length; i++) {
    let lo = 0, hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < values[i]) lo = mid + 1; else hi = mid;
    }
    if (lo > 0) previous[i] = tailIndices[lo - 1];
    tails[lo] = values[i]; tailIndices[lo] = i;
  }
  const result = [];
  let k = tailIndices[tails.length - 1] ?? -1;
  while (k !== -1) { result.push(values[k]); k = previous[k]; }
  return result.reverse();
}
assert.deepEqual(longestIncreasingSubsequence([10,9,2,5,3,7,101,18]), [2,3,7,18]);
assert.deepEqual(longestIncreasingSubsequence([3,3,3]), [3]);
assert.deepEqual(longestIncreasingSubsequence([]), []);
assert.deepEqual(longestIncreasingSubsequence([1,2,3]), [1,2,3]);
console.log('LIS tests passed');