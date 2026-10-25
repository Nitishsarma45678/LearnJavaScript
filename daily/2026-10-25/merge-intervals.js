/**
 * Merge overlapping intervals in O(n log n) time.
 * Inputs are [start, end] pairs; reversed intervals are rejected.
 */
function mergeIntervals(intervals) {
  const sorted = intervals.map(([start, end]) => {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
      throw new TypeError("Each interval must contain finite start <= end");
    }
    return [start, end];
  }).sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const merged = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (!last || interval[0] > last[1]) merged.push(interval);
    else last[1] = Math.max(last[1], interval[1]);
  }
  return merged;
}

console.assert(JSON.stringify(mergeIntervals([[1, 3], [2, 6], [8, 10], [10, 12]])) ===
  "[[1,6],[8,12]]");
console.assert(JSON.stringify(mergeIntervals([])) === "[]");
console.log("merge intervals practice passed");
