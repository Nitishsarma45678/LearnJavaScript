/**
 * EXERCISE: Asynchronous DAG Task Scheduler
 *
 * Execute a dependency graph with bounded concurrency, retries, cooperative
 * cancellation and explicit failure propagation. A task starts only after all
 * dependencies fulfill. Failed dependencies cause descendants to be skipped.
 *
 * The scheduler validates unknown dependencies and cycles before running work.
 */

"use strict";

function validateTaskGraph(tasks) {
  if (!Array.isArray(tasks)) throw new TypeError("tasks must be an array");

  const byId = new Map();
  for (const task of tasks) {
    if (!task || typeof task.id !== "string" || task.id.length === 0) {
      throw new TypeError("Every task needs a non-empty string id");
    }
    if (byId.has(task.id)) throw new Error("Duplicate task id: " + task.id);
    if (typeof task.run !== "function") throw new TypeError("Task " + task.id + " needs run()");
    const deps = task.deps === undefined ? [] : task.deps;
    if (!Array.isArray(deps) || deps.some((id) => typeof id !== "string")) {
      throw new TypeError("Task dependencies must be an array of ids");
    }
    byId.set(task.id, { id: task.id, deps: [...new Set(deps)], run: task.run });
  }

  const indegree = new Map();
  const dependents = new Map();
  for (const task of byId.values()) {
    indegree.set(task.id, task.deps.length);
    dependents.set(task.id, []);
    for (const dep of task.deps) {
      if (!byId.has(dep)) throw new Error("Unknown dependency " + dep + " for " + task.id);
      if (dep === task.id) throw new Error("Task cannot depend on itself: " + task.id);
    }
  }
  for (const task of byId.values()) {
    for (const dep of task.deps) dependents.get(dep).push(task.id);
  }

  const ready = [];
  for (const [id, degree] of indegree) if (degree === 0) ready.push(id);
  const order = [];

  for (let head = 0; head < ready.length; head++) {
    const id = ready[head];
    order.push(id);
    for (const child of dependents.get(id)) {
      indegree.set(child, indegree.get(child) - 1);
      if (indegree.get(child) === 0) ready.push(child);
    }
  }

  if (order.length !== byId.size) throw new Error("Task graph contains a dependency cycle");
  return { byId, order };
}

function makeAbortError(reason) {
  const error = new Error(reason ? String(reason) : "Operation aborted");
  error.name = "AbortError";
  return error;
}

function delay(ms, signal) {
  if (ms === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(makeAbortError(signal.reason));
    const timer = setTimeout(done, ms);

    function cleanup() {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }
    function done() {
      cleanup();
      resolve();
    }
    function onAbort() {
      cleanup();
      reject(makeAbortError(signal.reason));
    }

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function runDAG(tasks, options = {}) {
  const { byId, order } = validateTaskGraph(tasks);
  const concurrency = options.concurrency === undefined ? 4 : options.concurrency;
  const retries = options.retries === undefined ? 0 : options.retries;
  const retryDelayMs = options.retryDelayMs === undefined ? 0 : options.retryDelayMs;
  const failFast = options.failFast !== false;
  const externalSignal = options.signal;

  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError("concurrency must be a positive integer");
  }
  if (!Number.isInteger(retries) || retries < 0) {
    throw new RangeError("retries must be a non-negative integer");
  }
  if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0) {
    throw new RangeError("retryDelayMs must be non-negative");
  }
  if (externalSignal && typeof externalSignal.addEventListener !== "function") {
    throw new TypeError("signal must be an AbortSignal");
  }

  const statuses = new Map(order.map((id) => [id, "pending"]));
  const values = new Map();
  const errors = new Map();
  const attempts = new Map(order.map((id) => [id, 0]));
  const pending = new Set(order);
  const controller = new AbortController();

  let active = 0;
  let settled = 0;
  let stoppedByFailure = false;

  if (externalSignal) {
    if (externalSignal.aborted) controller.abort(externalSignal.reason);
    else externalSignal.addEventListener(
      "abort",
      () => controller.abort(externalSignal.reason),
      { once: true }
    );
  }

  const execute = async (task) => {
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      if (controller.signal.aborted) throw makeAbortError(controller.signal.reason);
      attempts.set(task.id, attempt);

      try {
        return await task.run({
          id: task.id,
          signal: controller.signal,
          attempt,
          results: new Map(values)
        });
      } catch (error) {
        if (controller.signal.aborted) throw makeAbortError(controller.signal.reason);
        if (attempt > retries) throw error;
        await delay(retryDelayMs, controller.signal);
      }
    }
  };

  return new Promise((resolve) => {
    const finish = () => {
      if (settled !== order.length) return;
      resolve({
        statuses,
        values,
        errors,
        attempts,
        order: [...order]
      });
    };

    const pump = () => {
      let changed = true;

      while (changed) {
        changed = false;
        for (const id of Array.from(pending)) {
          if (controller.signal.aborted) {
            pending.delete(id);
            statuses.set(id, "cancelled");
            errors.set(id, makeAbortError(controller.signal.reason));
            settled++;
            changed = true;
            continue;
          }

          if (failFast && stoppedByFailure) {
            pending.delete(id);
            statuses.set(id, "skipped");
            settled++;
            changed = true;
            continue;
          }

          const task = byId.get(id);
          const dependencyStates = task.deps.map((dep) => statuses.get(dep));
          if (dependencyStates.some((state) =>
            state === "rejected" || state === "skipped" || state === "cancelled"
          )) {
            pending.delete(id);
            statuses.set(id, "skipped");
            settled++;
            changed = true;
          }
        }
      }

      if (!controller.signal.aborted && !(failFast && stoppedByFailure)) {
        while (active < concurrency) {
          let nextId = null;
          for (const id of pending) {
            const task = byId.get(id);
            if (task.deps.every((dep) => statuses.get(dep) === "fulfilled")) {
              nextId = id;
              break;
            }
          }
          if (nextId === null) break;

          pending.delete(nextId);
          const task = byId.get(nextId);
          statuses.set(nextId, "running");
          active++;

          execute(task).then((value) => {
            statuses.set(nextId, "fulfilled");
            values.set(nextId, value);
          }).catch((error) => {
            if (controller.signal.aborted && error && error.name === "AbortError") {
              statuses.set(nextId, "cancelled");
            } else {
              statuses.set(nextId, "rejected");
              if (failFast) stoppedByFailure = true;
            }
            errors.set(nextId, error);
          }).finally(() => {
            active--;
            settled++;
            pump();
          });
        }
      }

      if (active === 0 && pending.size > 0) {
        for (const id of pending) {
          pending.delete(id);
          statuses.set(id, controller.signal.aborted ? "cancelled" : "skipped");
          settled++;
        }
      }

      finish();
    };

    pump();
  });
}

async function runTests() {
  const assert = require("node:assert/strict");
  const events = [];
  let active = 0;
  let peak = 0;

  const report = await runDAG([
    {
      id: "fetch-users",
      run: async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        events.push("users");
        return ["Ada", "Lin"];
      }
    },
    {
      id: "fetch-config",
      run: async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        events.push("config");
        return { region: "ap-south-1" };
      }
    },
    {
      id: "render",
      deps: ["fetch-users", "fetch-config"],
      run: ({ results }) => {
        events.push("render");
        return results.get("fetch-users").length + ":" +
          results.get("fetch-config").region;
      }
    }
  ], { concurrency: 2 });

  assert.equal(peak, 2);
  assert.equal(report.statuses.get("render"), "fulfilled");
  assert.equal(report.values.get("render"), "2:ap-south-1");
  assert.equal(events.at(-1), "render");

  let tries = 0;
  const retried = await runDAG([{
    id: "flaky",
    run: () => {
      tries++;
      if (tries < 3) throw new Error("temporary");
      return "ok";
    }
  }], { retries: 2 });
  assert.equal(retried.statuses.get("flaky"), "fulfilled");
  assert.equal(retried.attempts.get("flaky"), 3);

  const partial = await runDAG([
    { id: "bad", run: () => { throw new Error("boom"); } },
    { id: "child", deps: ["bad"], run: () => "unreachable" },
    { id: "independent", run: () => 42 }
  ], { failFast: false, concurrency: 2 });
  assert.equal(partial.statuses.get("bad"), "rejected");
  assert.equal(partial.statuses.get("child"), "skipped");
  assert.equal(partial.values.get("independent"), 42);

  await assert.rejects(
    runDAG([
      { id: "a", deps: ["b"], run: () => 1 },
      { id: "b", deps: ["a"], run: () => 2 }
    ]),
    /cycle/
  );

  const controller = new AbortController();
  controller.abort("cancel before start");
  const cancelled = await runDAG([
    { id: "never", run: () => "no" }
  ], { signal: controller.signal });
  assert.equal(cancelled.statuses.get("never"), "cancelled");

  console.log("Async DAG scheduler tests passed");
}

if (require.main === module) {
  runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { runDAG, validateTaskGraph };
