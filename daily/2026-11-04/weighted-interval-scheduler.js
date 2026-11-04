'use strict';

const assert = require('node:assert/strict');

/**
 * Select a maximum-profit set of non-overlapping half-open intervals.
 * Two jobs are compatible when the earlier job's end <= the later job's start.
 * Time: O(n log n); space: O(n).
 */
function weightedIntervalSchedule(jobs) {
  if (!Array.isArray(jobs)) throw new TypeError('jobs must be an array');

  const sorted = jobs.map((job, index) => {
    if (!job || typeof job !== 'object') throw new TypeError('each job must be an object');
    const { start, end, profit } = job;
    if (![start, end, profit].every(Number.isFinite) || start > end) {
      throw new RangeError('jobs require finite start/end/profit and start <= end');
    }
    return { job, index };
  }).sort((a, b) =>
    a.job.end - b.job.end ||
    a.job.start - b.job.start ||
    a.index - b.index
  );

  const ends = sorted.map(entry => entry.job.end);
  const predecessor = new Array(sorted.length);

  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i].job.start;
    let low = 0, high = i;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (ends[mid] <= start) low = mid + 1;
      else high = mid;
    }
    predecessor[i] = low - 1;
  }

  const dp = new Array(sorted.length + 1).fill(0);
  const take = new Array(sorted.length + 1).fill(false);

  for (let i = 1; i <= sorted.length; i++) {
    const entry = sorted[i - 1];
    const include = entry.job.profit + dp[predecessor[i - 1] + 1];
    const exclude = dp[i - 1];
    if (include > exclude) {
      dp[i] = include;
      take[i] = true;
    } else {
      dp[i] = exclude;
    }
  }

  const selected = [];
  for (let i = sorted.length; i > 0;) {
    if (take[i]) {
      selected.push(sorted[i - 1].job);
      i = predecessor[i - 1] + 1;
    } else {
      i--;
    }
  }
  selected.reverse();
  return { profit: dp[sorted.length], jobs: selected };
}

const sample = [
  { id: 'a', start: 1, end: 3, profit: 5 },
  { id: 'b', start: 2, end: 5, profit: 6 },
  { id: 'c', start: 4, end: 6, profit: 5 },
  { id: 'd', start: 6, end: 7, profit: 4 },
  { id: 'e', start: 5, end: 8, profit: 11 },
  { id: 'f', start: 7, end: 9, profit: 2 }
];
const result = weightedIntervalSchedule(sample);
assert.equal(result.profit, 17);
assert.deepEqual(result.jobs.map(job => job.id), ['b', 'e']);
assert.equal(weightedIntervalSchedule([]).profit, 0);
assert.deepEqual(weightedIntervalSchedule([
  { id: 'negative', start: 0, end: 2, profit: -10 }
]).jobs, []);
assert.deepEqual(weightedIntervalSchedule([
  { id: 'left', start: 0, end: 2, profit: 4 },
  { id: 'right', start: 2, end: 4, profit: 4 }
]).jobs.map(job => job.id), ['left', 'right']);
assert.throws(() => weightedIntervalSchedule([{ start: 3, end: 1, profit: 4 }]), RangeError);
assert.equal(sample[0].start, 1, 'input jobs must not be mutated');

console.log('Weighted interval scheduling tests passed');