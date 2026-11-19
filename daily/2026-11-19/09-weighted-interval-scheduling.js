'use strict';

/**
 * Exercise: Select a maximum-profit subset of non-overlapping jobs.
 *
 * Intervals are half-open: a job ending at time t may be followed by one
 * starting at t. The solution uses sorting, binary search for predecessors,
 * dynamic programming, and reconstruction of the selected original jobs.
 */

function weightedIntervalScheduling(jobs) {
  if (!Array.isArray(jobs)) throw new TypeError('jobs must be an array');

  const sorted = jobs.map((job, originalIndex) => {
    if (!job || !Number.isFinite(job.start) || !Number.isFinite(job.end) ||
        !Number.isFinite(job.profit) || job.start > job.end) {
      throw new TypeError('each job needs finite start, end, profit and start <= end');
    }
    return { ...job, originalIndex };
  }).sort((a, b) => a.end - b.end || a.start - b.start || a.originalIndex - b.originalIndex);

  const ends = sorted.map((job) => job.end);
  const predecessor = sorted.map((job, index) => {
    let low = 0;
    let high = index - 1;
    let answer = -1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (ends[middle] <= job.start) {
        answer = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return answer;
  });

  const best = new Array(sorted.length + 1).fill(0);
  const take = new Array(sorted.length).fill(false);

  for (let index = 0; index < sorted.length; index += 1) {
    const include = sorted[index].profit + best[predecessor[index] + 1];
    const exclude = best[index];
    if (include > exclude) {
      best[index + 1] = include;
      take[index] = true;
    } else {
      best[index + 1] = exclude;
    }
  }

  const selected = [];
  let index = sorted.length - 1;
  while (index >= 0) {
    const include = sorted[index].profit + best[predecessor[index] + 1];
    if (take[index] && include > best[index]) {
      selected.push(sorted[index]);
      index = predecessor[index];
    } else {
      index -= 1;
    }
  }

  selected.reverse();
  return {
    maxProfit: best[sorted.length],
    jobs: selected.map(({ originalIndex, ...job }) => ({ ...job, originalIndex }))
  };
}

function runTests() {
  const assert = require('node:assert/strict');
  const jobs = [
    { id: 'A', start: 1, end: 3, profit: 5 },
    { id: 'B', start: 2, end: 5, profit: 6 },
    { id: 'C', start: 4, end: 6, profit: 5 },
    { id: 'D', start: 6, end: 7, profit: 4 },
    { id: 'E', start: 5, end: 8, profit: 11 },
    { id: 'F', start: 7, end: 9, profit: 2 }
  ];
  const result = weightedIntervalScheduling(jobs);
  assert.equal(result.maxProfit, 16);
  assert.deepEqual(result.jobs.map((job) => job.id), ['A', 'E']);

  const touching = weightedIntervalScheduling([
    { id: 1, start: 0, end: 2, profit: 3 },
    { id: 2, start: 2, end: 4, profit: 4 }
  ]);
  assert.equal(touching.maxProfit, 7);
  assert.equal(weightedIntervalScheduling([]).maxProfit, 0);
  assert.equal(weightedIntervalScheduling([{ start: 0, end: 1, profit: -5 }]).jobs.length, 0);
  assert.throws(() => weightedIntervalScheduling([{ start: 4, end: 2, profit: 1 }]), /start <= end/);
}

if (require.main === module) {
  runTests();
  console.log('Weighted interval scheduling: all tests passed');
}

module.exports = { weightedIntervalScheduling };
