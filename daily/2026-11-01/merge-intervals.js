const assert = require('node:assert/strict');

function mergeIntervals(intervals) {
  const sorted = intervals.map(([start,end]) => {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) throw new RangeError('Invalid interval');
    return [start,end];
  }).sort((a,b) => a[0]-b[0] || a[1]-b[1]);
  const merged = [];
  for (const current of sorted) {
    const last = merged[merged.length - 1];
    if (!last || current[0] > last[1]) merged.push(current);
    else last[1] = Math.max(last[1], current[1]);
  }
  return merged;
}
assert.deepEqual(mergeIntervals([[1,3],[2,6],[8,10],[10,12]]), [[1,6],[8,12]]);
assert.deepEqual(mergeIntervals([]), []);
assert.deepEqual(mergeIntervals([[4,4],[1,2]]), [[1,2],[4,4]]);
assert.throws(() => mergeIntervals([[3,1]]), RangeError);
console.log('Merge intervals tests passed');