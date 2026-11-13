/**
 * Weighted Interval Scheduler
 * ---------------------------
 * Solve weighted interval scheduling with an optional cooldown between jobs.
 *
 * Jobs are half-open intervals [start, end). A predecessor is compatible when
 * predecessor.end + cooldown <= job.start.
 *
 * Returns one deterministic optimal schedule and the BigInt count of all
 * optimal schedules. Jobs are treated as distinct by input position, even if
 * their fields are identical.
 *
 * Complexity: O(n log n) time and O(n) auxiliary space.
 */

function weightedIntervalSchedule(jobs, { cooldown = 0 } = {}) {
  if (!Array.isArray(jobs)) throw new TypeError("jobs must be an array");
  if (!Number.isFinite(cooldown) || cooldown < 0) {
    throw new RangeError("cooldown must be a finite non-negative number");
  }

  const sorted = jobs.map((job, originalIndex) => {
    if (!job || typeof job !== "object") {
      throw new TypeError(`job at index ${originalIndex} must be an object`);
    }
    const { start, end, profit } = job;
    if (![start, end, profit].every(Number.isFinite) || start >= end) {
      throw new RangeError(
        `job at index ${originalIndex} needs finite start < end and finite profit`
      );
    }
    return { job, originalIndex, start, end, profit };
  }).sort((a, b) =>
    a.end - b.end ||
    a.start - b.start ||
    a.originalIndex - b.originalIndex
  );

  const n = sorted.length;
  const predecessorCount = new Array(n);

  // Number of earlier jobs whose end plus cooldown is <= this job's start.
  for (let i = 0; i < n; i += 1) {
    let low = 0;
    let high = i;
    const threshold = sorted[i].start - cooldown;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (sorted[mid].end <= threshold) low = mid + 1;
      else high = mid;
    }
    predecessorCount[i] = low;
  }

  const bestProfit = new Array(n + 1).fill(0);
  const optimalCount = new Array(n + 1).fill(0n);
  const takeCurrent = new Array(n + 1).fill(false);
  optimalCount[0] = 1n;

  for (let i = 1; i <= n; i += 1) {
    const current = sorted[i - 1];
    const predecessorState = predecessorCount[i - 1];
    const includeProfit = bestProfit[predecessorState] + current.profit;
    const excludeProfit = bestProfit[i - 1];

    if (includeProfit > excludeProfit) {
      bestProfit[i] = includeProfit;
      optimalCount[i] = optimalCount[predecessorState];
      takeCurrent[i] = true;
    } else if (includeProfit < excludeProfit) {
      bestProfit[i] = excludeProfit;
      optimalCount[i] = optimalCount[i - 1];
    } else {
      bestProfit[i] = excludeProfit;
      optimalCount[i] =
        optimalCount[i - 1] + optimalCount[predecessorState];
      // Deterministic reconstruction: on a tie, prefer excluding this job.
      takeCurrent[i] = false;
    }
  }

  const selected = [];
  for (let i = n; i > 0;) {
    if (takeCurrent[i]) {
      selected.push(sorted[i - 1].job);
      i = predecessorCount[i - 1];
    } else {
      i -= 1;
    }
  }
  selected.reverse();

  return {
    profit: bestProfit[n],
    countOptimal: optimalCount[n],
    jobs: selected
  };
}

// ------------------------------ Example tests ------------------------------
if (require.main === module) {
  const assert = require("node:assert/strict");

  const sample = weightedIntervalSchedule([
    { id: "A", start: 1, end: 3, profit: 5 },
    { id: "B", start: 3, end: 5, profit: 6 },
    { id: "C", start: 1, end: 5, profit: 10 },
    { id: "D", start: 5, end: 7, profit: 5 },
    { id: "E", start: 2, end: 4, profit: 6 }
  ]);
  assert.equal(sample.profit, 16);
  assert.deepEqual(sample.jobs.map(job => job.id), ["A", "B", "D"]);

  const tied = weightedIntervalSchedule([
    { id: "left", start: 0, end: 1, profit: 5 },
    { id: "right", start: 1, end: 2, profit: 5 },
    { id: "whole", start: 0, end: 2, profit: 10 }
  ]);
  assert.equal(tied.profit, 10);
  assert.equal(tied.countOptimal, 2n);

  const withCooldown = weightedIntervalSchedule([
    { id: "short", start: 0, end: 2, profit: 5 },
    { id: "later", start: 2, end: 3, profit: 6 }
  ], { cooldown: 1 });
  assert.equal(withCooldown.profit, 6);

  assert.deepEqual(weightedIntervalSchedule([]), {
    profit: 0, countOptimal: 1n, jobs: []
  });
  assert.equal(weightedIntervalSchedule([
    { start: 0, end: 1, profit: -4 }
  ]).profit, 0);
  assert.throws(() => weightedIntervalSchedule([
    { start: 2, end: 1, profit: 3 }
  ]), RangeError);
  assert.throws(() => weightedIntervalSchedule([], { cooldown: -1 }), RangeError);

  // Randomized differential check against exhaustive subset enumeration.
  let seed = 0x51ced;
  const random = max => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed % max;
  };
  for (let trial = 0; trial < 250; trial += 1) {
    const count = random(9);
    const generated = Array.from({ length: count }, (_, id) => {
      const start = random(9);
      return { id, start, end: start + 1 + random(4), profit: random(15) - 3 };
    });
    const gap = random(3);
    let bruteBest = 0;
    let bruteWays = 0n;
    for (let mask = 0; mask < (1 << count); mask += 1) {
      const chosen = generated.filter((_, index) => mask & (1 << index))
        .sort((a, b) => a.start - b.start || a.end - b.end);
      let valid = true;
      let total = 0;
      for (let i = 0; i < chosen.length; i += 1) {
        total += chosen[i].profit;
        if (i > 0 && chosen[i - 1].end + gap > chosen[i].start) valid = false;
      }
      if (!valid) continue;
      if (total > bruteBest) {
        bruteBest = total;
        bruteWays = 1n;
      } else if (total === bruteBest) {
        bruteWays += 1n;
      }
    }
    const actual = weightedIntervalSchedule(generated, { cooldown: gap });
    assert.equal(actual.profit, bruteBest);
    assert.equal(actual.countOptimal, bruteWays);
  }

  console.log("weighted-interval-scheduler: all tests passed");
}

module.exports = { weightedIntervalSchedule };
