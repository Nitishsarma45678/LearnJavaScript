/**
 * Weighted Interval Scheduling
 * ----------------------------
 * Select a maximum-profit subset of non-overlapping jobs. Jobs use half-open
 * intervals [start, end), so one job may begin exactly when another ends.
 * The implementation sorts by finish time, binary-searches predecessors,
 * reconstructs the chosen schedule, and runs in O(n log n) time.
 *
 * Run: node weighted-interval-scheduling.js
 */

"use strict";

function scheduleJobs(input) {
  if (!Array.isArray(input)) throw new TypeError("Jobs must be an array");

  const jobs = input.map((job, index) => {
    if (!job || typeof job !== "object") throw new TypeError("Each job must be an object");
    const { start, end, profit } = job;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      throw new RangeError("Each job needs finite start and end values with start < end");
    }
    if (!Number.isFinite(profit)) throw new TypeError("Job profit must be finite");
    return { job, start, end, profit, inputIndex: index };
  });

  jobs.sort((a, b) =>
    a.end - b.end ||
    a.start - b.start ||
    a.inputIndex - b.inputIndex
  );

  const ends = jobs.map(entry => entry.end);

  // Return the number of entries in [0, high) whose end <= start.
  function predecessorCount(start, high) {
    let low = 0;
    let right = high;
    while (low < right) {
      const middle = (low + right) >>> 1;
      if (ends[middle] <= start) low = middle + 1;
      else right = middle;
    }
    return low;
  }

  const n = jobs.length;
  const best = new Array(n + 1).fill(0);
  const take = new Array(n).fill(false);
  const predecessor = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const compatibleCount = predecessorCount(jobs[i].start, i);
    predecessor[i] = compatibleCount;
    const includeProfit = jobs[i].profit + best[compatibleCount];
    const excludeProfit = best[i];

    // Strict comparison makes ties deterministic: keep the earlier solution.
    if (includeProfit > excludeProfit) {
      best[i + 1] = includeProfit;
      take[i] = true;
    } else {
      best[i + 1] = excludeProfit;
    }
  }

  const selected = [];
  for (let i = n - 1; i >= 0;) {
    if (take[i] && jobs[i].profit + best[predecessor[i]] === best[i + 1]) {
      selected.push(jobs[i].job);
      i = predecessor[i] - 1;
    } else {
      i--;
    }
  }
  selected.reverse();

  return {
    maxProfit: best[n],
    selected,
    selectedIds: selected.map((job, index) =>
      Object.prototype.hasOwnProperty.call(job, "id") ? job.id : index
    )
  };
}

function bruteForceProfit(jobs) {
  let best = 0;
  for (let mask = 0; mask < (1 << jobs.length); mask++) {
    const chosen = [];
    let profit = 0;
    for (let i = 0; i < jobs.length; i++) {
      if (mask & (1 << i)) {
        chosen.push(jobs[i]);
        profit += jobs[i].profit;
      }
    }
    chosen.sort((a, b) => a.start - b.start || a.end - b.end);
    let compatible = true;
    for (let i = 1; i < chosen.length; i++) {
      if (chosen[i - 1].end > chosen[i].start) {
        compatible = false;
        break;
      }
    }
    if (compatible && profit > best) best = profit;
  }
  return best;
}

function runTests() {
  let checks = 0;
  function equal(actual, expected, label) {
    checks++;
    if (!Object.is(actual, expected)) {
      throw new Error(label + ": expected " + expected + ", received " + actual);
    }
  }
  function truthy(value, label) {
    checks++;
    if (!value) throw new Error(label);
  }
  function throws(fn, ErrorType, label) {
    checks++;
    let error;
    try { fn(); } catch (caught) { error = caught; }
    if (!(error instanceof ErrorType)) throw new Error(label + ": expected " + ErrorType.name);
  }

  const sample = [
    { id: "A", start: 1, end: 3, profit: 50 },
    { id: "B", start: 2, end: 4, profit: 10 },
    { id: "C", start: 3, end: 5, profit: 40 },
    { id: "D", start: 3, end: 6, profit: 70 }
  ];
  const result = scheduleJobs(sample);
  equal(result.maxProfit, 120, "classic weighted schedule");
  equal(result.selectedIds.join(","), "A,D", "reconstruction");
  truthy(result.selected[0].end <= result.selected[1].start, "selected intervals do not overlap");

  const touching = scheduleJobs([
    { id: 1, start: 0, end: 2, profit: 4 },
    { id: 2, start: 2, end: 5, profit: 7 },
    { id: 3, start: 5, end: 8, profit: 6 }
  ]);
  equal(touching.maxProfit, 17, "touching half-open intervals are compatible");
  equal(touching.selected.length, 3, "all touching jobs selected");

  equal(scheduleJobs([]).maxProfit, 0, "empty input");
  equal(scheduleJobs([{ start: 0, end: 1, profit: -9 }]).selected.length, 0, "negative-profit job omitted");
  equal(scheduleJobs([
    { start: 0, end: 2, profit: 5 },
    { start: 0, end: 2, profit: 5 }
  ]).selected.length, 1, "deterministic tie handling");

  const rng = (() => {
    let state = 0x1badb002;
    return max => {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0;
      return state % max;
    };
  })();

  for (let trial = 0; trial < 220; trial++) {
    const count = rng(11);
    const jobs = [];
    for (let i = 0; i < count; i++) {
      const start = rng(12);
      const end = start + 1 + rng(6);
      jobs.push({ id: "J" + i, start, end, profit: rng(31) - 8 });
    }
    const actual = scheduleJobs(jobs);
    equal(actual.maxProfit, bruteForceProfit(jobs), "randomized schedule trial " + trial);
    const ordered = actual.selected.slice().sort((a, b) => a.start - b.start);
    for (let i = 1; i < ordered.length; i++) {
      truthy(ordered[i - 1].end <= ordered[i].start, "randomized schedule compatibility " + trial);
    }
  }

  throws(() => scheduleJobs(null), TypeError, "input must be an array");
  throws(() => scheduleJobs([{ start: 2, end: 2, profit: 1 }]), RangeError, "empty interval rejected");
  throws(() => scheduleJobs([{ start: 0, end: 1, profit: Infinity }]), TypeError, "non-finite profit rejected");
  return { passed: checks, randomizedTrials: 220 };
}

if (typeof require !== "undefined" && require.main === module) {
  const result = runTests();
  console.log("Weighted interval scheduling: " + result.passed + " checks passed");
}

module.exports = { scheduleJobs, bruteForceProfit, runTests };
