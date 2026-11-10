/**
 * Async Workflow Scheduler — execute a dependency DAG with bounded parallelism.
 *
 * Features: DAG validation, dependency-result access, retries with injectable
 * backoff/sleep, cancellation, independent-branch continuation and skipped
 * descendants after a failed prerequisite.
 *
 * Run: node async-workflow-scheduler.js
 */

"use strict";

const assert = require("node:assert/strict");

function abortError() {
  const error = new Error("Workflow aborted");
  error.name = "AbortError";
  return error;
}

function defaultSleep(milliseconds, signal) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, milliseconds);
    function cleanup() {
      if (signal) signal.removeEventListener("abort", onAbort);
    }
    function done() {
      cleanup();
      resolve();
    }
    function onAbort() {
      clearTimeout(timer);
      cleanup();
      reject(abortError());
    }
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
  });
}

function validateAndIndex(tasks) {
  if (!Array.isArray(tasks)) throw new TypeError("tasks must be an array");
  const byId = new Map();
  for (const task of tasks) {
    if (!task || typeof task.id !== "string" || task.id.length === 0) {
      throw new TypeError("every task needs a non-empty string id");
    }
    if (byId.has(task.id)) throw new Error("duplicate task id: " + task.id);
    if (typeof task.run !== "function") throw new TypeError("task " + task.id + " needs a run function");
    byId.set(task.id, { ...task, deps: [...new Set(task.deps || [])] });
  }

  const dependents = new Map([...byId.keys()].map(id => [id, []]));
  const indegree = new Map();
  for (const [id, task] of byId) {
    for (const dependency of task.deps) {
      if (!byId.has(dependency)) throw new Error("unknown dependency " + dependency + " for " + id);
      if (dependency === id) throw new Error("task cannot depend on itself: " + id);
      dependents.get(dependency).push(id);
    }
    indegree.set(id, task.deps.length);
  }

  const queue = [...byId.keys()].filter(id => indegree.get(id) === 0);
  let visited = 0;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const id = queue[cursor];
    visited++;
    for (const child of dependents.get(id)) {
      indegree.set(child, indegree.get(child) - 1);
      if (indegree.get(child) === 0) queue.push(child);
    }
  }
  if (visited !== byId.size) throw new Error("workflow contains a dependency cycle");
  return { byId, dependents };
}

async function runWorkflow(tasks, {
  concurrency = 4,
  retries = 0,
  backoff = () => 0,
  sleep = defaultSleep,
  signal
} = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError("concurrency must be a positive integer");
  }
  if (!Number.isInteger(retries) || retries < 0) {
    throw new RangeError("retries must be a non-negative integer");
  }
  if (typeof backoff !== "function" || typeof sleep !== "function") {
    throw new TypeError("backoff and sleep must be functions");
  }

  const { byId, dependents } = validateAndIndex(tasks);
  const states = new Map([...byId.keys()].map(id => [id, "pending"]));
  const remaining = new Map([...byId].map(([id, task]) => [id, task.deps.length]));
  const ready = [...byId.keys()].filter(id => remaining.get(id) === 0);
  const results = new Map();
  const errors = new Map();
  const attempts = new Map();
  const blockedBy = new Map();
  const completionOrder = [];

  function skipDescendants(failedId) {
    const queue = [failedId];
    const visited = new Set(queue);
    while (queue.length) {
      const parent = queue.shift();
      for (const child of dependents.get(parent)) {
        if (states.get(child) !== "pending") continue;
        states.set(child, "skipped");
        blockedBy.set(child, parent);
        if (!visited.has(child)) {
          visited.add(child);
          queue.push(child);
        }
      }
    }
  }

  async function worker() {
    while (ready.length > 0) {
      const id = ready.shift();
      if (states.get(id) !== "pending") continue;
      if (signal?.aborted) {
        states.set(id, "cancelled");
        continue;
      }

      states.set(id, "running");
      const task = byId.get(id);
      let succeeded = false;
      let lastError;

      for (let attempt = 1; attempt <= retries + 1; attempt++) {
        attempts.set(id, attempt);
        try {
          const value = await task.run({
            id,
            attempt,
            results: new Map(results),
            signal
          });
          if (signal?.aborted) throw abortError();
          results.set(id, value);
          states.set(id, "succeeded");
          completionOrder.push(id);
          succeeded = true;
          break;
        } catch (error) {
          lastError = error;
          if (signal?.aborted) {
            states.set(id, "cancelled");
            break;
          }
          if (attempt <= retries) {
            const delay = Number(backoff(attempt, id, error));
            if (!Number.isFinite(delay) || delay < 0) {
              lastError = new RangeError("backoff must return a finite non-negative delay");
              break;
            }
            try {
              await sleep(delay, signal);
            } catch (sleepError) {
              lastError = sleepError;
              if (signal?.aborted || sleepError?.name === "AbortError") {
                states.set(id, "cancelled");
              }
              break;
            }
          }
        }
      }

      if (!succeeded) {
        if (states.get(id) === "running") states.set(id, "failed");
        if (lastError) errors.set(id, lastError);
        if (states.get(id) === "failed") skipDescendants(id);
        continue;
      }

      for (const child of dependents.get(id)) {
        remaining.set(child, remaining.get(child) - 1);
        if (remaining.get(child) === 0 && states.get(child) === "pending") ready.push(child);
      }
    }
  }

  const workerCount = Math.min(concurrency, Math.max(1, ready.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (signal?.aborted) {
    for (const [id, state] of states) {
      if (state === "pending") states.set(id, "cancelled");
    }
  }

  return {
    results,
    states: Object.fromEntries(states),
    errors,
    attempts: Object.fromEntries(attempts),
    blockedBy: Object.fromEntries(blockedBy),
    completionOrder
  };
}

async function runTests() {
  let active = 0;
  let peak = 0;
  const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const report = await runWorkflow([
    { id: "load", run: async () => { active++; peak = Math.max(peak, active); await wait(8); active--; return 4; } },
    { id: "independent", run: async () => { active++; peak = Math.max(peak, active); await wait(5); active--; return 7; } },
    { id: "transform", deps: ["load"], run: ({ results }) => results.get("load") * 3 },
    { id: "join", deps: ["transform", "independent"], run: ({ results }) => results.get("transform") + results.get("independent") }
  ], { concurrency: 2 });
  assert.equal(report.states.join, "succeeded");
  assert.equal(report.results.get("join"), 19);
  assert.equal(peak, 2);

  let calls = 0;
  const retried = await runWorkflow([
    { id: "flaky", run: () => {
      calls++;
      if (calls < 3) throw new Error("temporary");
      return "recovered";
    } }
  ], { retries: 2, backoff: () => 0, sleep: async () => {} });
  assert.equal(retried.states.flaky, "succeeded");
  assert.equal(retried.attempts.flaky, 3);
  assert.equal(retried.results.get("flaky"), "recovered");

  const partial = await runWorkflow([
    { id: "bad", run: () => { throw new Error("boom"); } },
    { id: "child", deps: ["bad"], run: () => "must not run" },
    { id: "grandchild", deps: ["child"], run: () => "must not run" },
    { id: "healthy", run: () => "still runs" }
  ], { concurrency: 2 });
  assert.equal(partial.states.bad, "failed");
  assert.equal(partial.states.child, "skipped");
  assert.equal(partial.states.grandchild, "skipped");
  assert.equal(partial.states.healthy, "succeeded");
  assert.equal(partial.blockedBy.child, "bad");

  await assert.rejects(() => runWorkflow([
    { id: "a", deps: ["b"], run: () => 1 },
    { id: "b", deps: ["a"], run: () => 2 }
  ]), /cycle/);

  await assert.rejects(() => runWorkflow([
    { id: "a", deps: ["missing"], run: () => 1 }
  ]), /unknown dependency/);

  const controller = new AbortController();
  controller.abort();
  const cancelled = await runWorkflow([
    { id: "never", run: () => "not called" }
  ], { signal: controller.signal });
  assert.equal(cancelled.states.never, "cancelled");

  console.log("AsyncWorkflowScheduler: all tests passed");
}

module.exports = { runWorkflow, validateAndIndex, defaultSleep };

if (require.main === module) runTests().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
