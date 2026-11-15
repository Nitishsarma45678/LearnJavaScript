/**
 * Weighted Interval Scheduler
 * ---------------------------
 * Choose a maximum-value compatible subset of jobs. Jobs use half-open
 * intervals [start, end), so a job ending at t can precede one starting at t.
 *
 * Challenge:
 *   Implement weighted interval scheduling with an optional job-count limit
 *   and a configurable cooldown between jobs. Reconstruct the chosen jobs.
 *
 * Complexity: O(n log n + nK), where K = min(maxJobs, n).
 */

'use strict';

function scheduleJobs(input, options = {}) {
  const { maxJobs = Infinity, cooldown = 0 } = options;

  if (!Array.isArray(input)) throw new TypeError('jobs must be an array');
  if (!(maxJobs === Infinity || (Number.isInteger(maxJobs) && maxJobs >= 0))) {
    throw new RangeError('maxJobs must be a non-negative integer or Infinity');
  }
  if (!Number.isFinite(cooldown) || cooldown < 0) {
    throw new RangeError('cooldown must be a finite non-negative number');
  }

  const ids = new Set();
  const jobs = input.map((job, index) => {
    if (!job || typeof job !== 'object') throw new TypeError('each job must be an object');
    const { id = index, start, end, weight } = job;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      throw new RangeError('each job needs finite start < end');
    }
    if (!Number.isFinite(weight)) throw new TypeError('job weight must be finite');
    if (ids.has(id)) throw new Error('job ids must be unique');
    ids.add(id);
    return { id, start, end, weight, originalIndex: index };
  });

  jobs.sort((a, b) =>
    a.end - b.end ||
    a.start - b.start ||
    String(a.id).localeCompare(String(b.id)) ||
    a.originalIndex - b.originalIndex
  );

  const n = jobs.length;
  const limit = Math.min(n, maxJobs);
  if (n === 0 || limit === 0) return { totalWeight: 0, jobs: [] };

  // predecessor[i] is the number of earlier sorted jobs compatible with i.
  const predecessor = new Array(n);
  const ends = jobs.map(job => job.end);
  for (let i = 0; i < n; i += 1) {
    const target = jobs[i].start - cooldown;
    let low = 0;
    let high = i;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (ends[mid] <= target) low = mid + 1;
      else high = mid;
    }
    predecessor[i] = low;
  }

  // dp[i][k] stores the best value using the first i jobs and at most k jobs.
  // A strict improvement chooses the current job; ties prefer the earlier
  // schedule, making reconstruction deterministic.
  const dp = Array.from({ length: n + 1 }, () => new Array(limit + 1).fill(0));
  const take = Array.from({ length: n + 1 }, () => new Array(limit + 1).fill(false));

  for (let i = 1; i <= n; i += 1) {
    const jobIndex = i - 1;
    const compatibleCount = predecessor[jobIndex];
    for (let k = 1; k <= limit; k += 1) {
      const skipValue = dp[i - 1][k];
      const takeValue = jobs[jobIndex].weight + dp[compatibleCount][k - 1];
      if (takeValue > skipValue) {
        dp[i][k] = takeValue;
        take[i][k] = true;
      } else {
        dp[i][k] = skipValue;
      }
    }
  }

  let i = n;
  let k = limit;
  const chosen = [];
  while (i > 0 && k > 0) {
    if (take[i][k]) {
      const jobIndex = i - 1;
      chosen.push(jobs[jobIndex]);
      i = predecessor[jobIndex];
      k -= 1;
    } else {
      i -= 1;
    }
  }

  chosen.reverse();
  return {
    totalWeight: dp[n][limit],
    jobs: chosen.map(({ id, start, end, weight }) => ({ id, start, end, weight }))
  };
}

function runTests() {
  const assert = require('node:assert/strict');

  const classic = scheduleJobs([
    { id: 'A', start: 1, end: 3, weight: 5 },
    { id: 'B', start: 2, end: 5, weight: 6 },
    { id: 'C', start: 4, end: 6, weight: 5 },
    { id: 'D', start: 6, end: 7, weight: 4 },
    { id: 'E', start: 5, end: 8, weight: 11 },
    { id: 'F', start: 7, end: 9, weight: 2 }
  ]);
  assert.equal(classic.totalWeight, 16);
  assert.deepEqual(classic.jobs.map(job => job.id), ['B', 'E']);

  const capped = scheduleJobs([
    { id: 'early', start: 0, end: 2, weight: 4 },
    { id: 'middle', start: 2, end: 4, weight: 5 },
    { id: 'late', start: 4, end: 6, weight: 6 }
  ], { maxJobs: 2 });
  assert.equal(capped.totalWeight, 11);
  assert.deepEqual(capped.jobs.map(job => job.id), ['middle', 'late']);

  const withCooldown = scheduleJobs([
    { id: 'one', start: 0, end: 2, weight: 7 },
    { id: 'two', start: 2, end: 4, weight: 8 },
    { id: 'three', start: 3, end: 5, weight: 20 },
    { id: 'four', start: 6, end: 7, weight: 5 }
  ], { cooldown: 1 });
  assert.equal(withCooldown.totalWeight, 25);
  assert.deepEqual(withCooldown.jobs.map(job => job.id), ['three', 'four']);

  const negative = scheduleJobs([
    { id: 'loss', start: 0, end: 1, weight: -10 },
    { id: 'gain', start: 1, end: 2, weight: 3 }
  ]);
  assert.equal(negative.totalWeight, 3);
  assert.deepEqual(negative.jobs.map(job => job.id), ['gain']);

  assert.deepEqual(scheduleJobs([], {}), { totalWeight: 0, jobs: [] });
  assert.equal(scheduleJobs([{ start: 0, end: 1, weight: 5 }], { maxJobs: 0 }).totalWeight, 0);
  assert.throws(() => scheduleJobs([{ id: 1, start: 2, end: 2, weight: 1 }]), /start < end/);
  assert.throws(() => scheduleJobs([{ id: 1, start: 0, end: 1, weight: 1 }, { id: 1, start: 2, end: 3, weight: 2 }]), /unique/);

  console.log('weighted-interval-scheduler: all tests passed');
}

if (require.main === module) runTests();

module.exports = { scheduleJobs };
