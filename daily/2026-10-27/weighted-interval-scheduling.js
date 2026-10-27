/**
 * Exercise: Select non-overlapping jobs with maximum total weight.
 * Each job has { start, end, weight }. Intervals are compatible when the
 * earlier job's end is <= the later job's start. Returns original job indexes.
 * Runs in O(n log n) time after sorting, excluding output construction.
 */

function weightedIntervalSchedule(jobs) {
  if (!Array.isArray(jobs)) throw new TypeError("jobs must be an array");

  const sorted = jobs.map((job, originalIndex) => {
    if (!job || !Number.isFinite(job.start) || !Number.isFinite(job.end) ||
        !Number.isFinite(job.weight) || job.end < job.start) {
      throw new TypeError("Each job needs finite start/end/weight and end >= start");
    }
    return { start: job.start, end: job.end, weight: job.weight, originalIndex };
  }).sort((a, b) =>
    a.end - b.end || a.start - b.start || a.originalIndex - b.originalIndex
  );

  const n = sorted.length;
  const ends = sorted.map((job) => job.end);
  const predecessor = new Array(n).fill(-1);

  // For each job, find the rightmost earlier job ending no later than its start.
  for (let i = 0; i < n; i += 1) {
    let low = 0;
    let high = i - 1;
    let best = -1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (ends[mid] <= sorted[i].start) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    predecessor[i] = best;
  }

  const bestWeight = new Array(n + 1).fill(0);
  const take = new Array(n).fill(false);

  for (let i = 1; i <= n; i += 1) {
    const job = sorted[i - 1];
    const include = job.weight + bestWeight[predecessor[i - 1] + 1];
    const exclude = bestWeight[i - 1];

    // On ties, exclude the later-ending job for deterministic reconstruction.
    if (include > exclude) {
      bestWeight[i] = include;
      take[i - 1] = true;
    } else {
      bestWeight[i] = exclude;
    }
  }

  const selected = [];
  let i = n - 1;
  while (i >= 0) {
    const job = sorted[i];
    const include = job.weight + bestWeight[predecessor[i] + 1];
    if (include > bestWeight[i]) {
      selected.push(job.originalIndex);
      i = predecessor[i];
    } else {
      i -= 1;
    }
  }
  selected.reverse();

  return {
    totalWeight: bestWeight[n],
    selectedIndexes: selected,
    selectedJobs: selected.map((index) => jobs[index])
  };
}

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(label + ": expected " + JSON.stringify(expected) +
      ", received " + JSON.stringify(actual));
  }
}

const jobs = [
  { start: 1, end: 3, weight: 5 },  // 0
  { start: 2, end: 5, weight: 6 },  // 1
  { start: 4, end: 6, weight: 5 },  // 2
  { start: 6, end: 7, weight: 4 },  // 3
  { start: 5, end: 8, weight: 11 }, // 4
  { start: 7, end: 9, weight: 2 }   // 5
];
const result = weightedIntervalSchedule(jobs);
assertEqual(result.totalWeight, 17, "optimal total weight");
assertEqual(result.selectedIndexes, [1, 4], "reconstructed optimal schedule");

assertEqual(weightedIntervalSchedule([]).totalWeight, 0, "empty input");
assertEqual(
  weightedIntervalSchedule([{ start: 0, end: 2, weight: -3 }]).selectedIndexes,
  [],
  "negative-weight job should be skipped"
);
assertEqual(
  weightedIntervalSchedule([
    { start: 0, end: 2, weight: 3 },
    { start: 2, end: 4, weight: 4 }
  ]).totalWeight,
  7,
  "touching intervals are compatible"
);

console.log("Weighted interval scheduling: all tests passed.");
