/**
 * Exercise: Structured Concurrency Task Group
 *
 * Run a fixed set of asynchronous child tasks under one cancellation scope.
 * The first failure aborts siblings, the group waits for every child to settle,
 * and registered cleanup handlers run in reverse order before run() completes.
 *
 * Run: node daily/2026-11-11/structuredTaskGroup.js
 */

const assert = require("node:assert/strict");

function abortError(reason) {
  if (reason && reason.name === "AbortError") return reason;
  const message = reason instanceof Error ? reason.message : String(reason ?? "Aborted");
  const error = new Error(message);
  error.name = "AbortError";
  if (reason !== undefined) error.cause = reason;
  return error;
}

function throwIfAborted(signal) {
  if (signal.aborted) throw abortError(signal.reason);
}

class TaskGroup {
  constructor({ signal, timeoutMs } = {}) {
    if (timeoutMs !== undefined &&
        (!Number.isFinite(timeoutMs) || timeoutMs < 0)) {
      throw new RangeError("timeoutMs must be a non-negative finite number");
    }

    this.controller = new AbortController();
    this.state = "idle";
    this.cleanups = [];
    this.externalSignal = signal;
    this.timeoutMs = timeoutMs;
    this.timeoutHandle = null;
    this.onExternalAbort = () => this.cancel(signal.reason);

    if (signal) {
      if (signal.aborted) this.cancel(signal.reason);
      else signal.addEventListener("abort", this.onExternalAbort, { once: true });
    }
  }

  get signal() {
    return this.controller.signal;
  }

  cancel(reason = new Error("Task group cancelled")) {
    if (!this.signal.aborted && this.state !== "finished") {
      this.controller.abort(reason);
      return true;
    }
    return false;
  }

  /** Register cleanup now; handlers execute once, in reverse registration order. */
  defer(cleanup) {
    if (typeof cleanup !== "function") throw new TypeError("cleanup must be a function");
    if (this.state === "finished") throw new Error("Task group has already finished");
    const record = { cleanup, active: true };
    this.cleanups.push(record);
    return () => { record.active = false; };
  }

  async run(tasks) {
    if (this.state !== "idle") throw new Error("A TaskGroup can run only once");
    if (!Array.isArray(tasks) || tasks.some(task => typeof task !== "function")) {
      throw new TypeError("run expects an array of task functions");
    }

    this.state = "running";
    if (this.timeoutMs !== undefined) {
      this.timeoutHandle = setTimeout(
        () => this.cancel(new Error(\`Task group timed out after \${this.timeoutMs}ms\`)),
        this.timeoutMs
      );
    }

    const taskPromises = tasks.map((task, index) => Promise.resolve().then(() => {
      throwIfAborted(this.signal);
      return task({
        signal: this.signal,
        index,
        defer: cleanup => this.defer(cleanup),
        cancel: reason => this.cancel(reason)
      });
    }).catch(error => {
      if (!this.signal.aborted) this.cancel(error);
      throw error;
    }));

    const settled = await Promise.allSettled(taskPromises);
    const failures = settled
      .filter(result => result.status === "rejected")
      .map(result => result.reason)
      .filter(error => !(error && error.name === "AbortError" &&
        this.signal.aborted && error !== this.signal.reason));

    if (this.signal.aborted && failures.length === 0) {
      failures.push(this.signal.reason instanceof Error
        ? this.signal.reason
        : abortError(this.signal.reason));
    }

    for (let index = this.cleanups.length - 1; index >= 0; index -= 1) {
      const record = this.cleanups[index];
      if (!record.active) continue;
      record.active = false;
      try {
        await record.cleanup();
      } catch (error) {
        failures.push(error);
      }
    }

    this.state = "finished";
    if (this.timeoutHandle !== null) clearTimeout(this.timeoutHandle);
    if (this.externalSignal) {
      this.externalSignal.removeEventListener("abort", this.onExternalAbort);
    }

    if (failures.length) {
      throw new AggregateError(failures, "Task group did not complete successfully");
    }
    return settled.map(result => result.value);
  }
}

function waitForAbort(signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError(signal.reason));
      return;
    }
    signal.addEventListener("abort", () => reject(abortError(signal.reason)), { once: true });
  });
}

async function runTests() {
  const order = [];
  const group = new TaskGroup();
  group.defer(() => order.push("outer cleanup"));
  const values = await group.run([
    async ({ defer }) => {
      defer(() => order.push("task cleanup"));
      await Promise.resolve();
      return "alpha";
    },
    async () => {
      await Promise.resolve();
      return "beta";
    }
  ]);
  assert.deepEqual(values, ["alpha", "beta"]);
  assert.deepEqual(order, ["task cleanup", "outer cleanup"]);
  assert.equal(group.state, "finished");
  assert.throws(() => group.defer(() => {}), /already finished/);
  await assert.rejects(group.run([]), /only once/);

  let siblingCancelled = false;
  const failingGroup = new TaskGroup();
  await assert.rejects(
    failingGroup.run([
      async () => {
        await Promise.resolve();
        throw new Error("primary task failure");
      },
      async ({ signal }) => {
        await waitForAbort(signal).catch(error => {
          siblingCancelled = true;
          throw error;
        });
      }
    ]),
    error => error instanceof AggregateError &&
      error.errors.some(item => item.message === "primary task failure")
  );
  assert.equal(siblingCancelled, true, "a child failure must abort its siblings");

  const external = new AbortController();
  const externalGroup = new TaskGroup({ signal: external.signal });
  const externalRun = externalGroup.run([({ signal }) => waitForAbort(signal)]);
  external.abort(new Error("caller stopped the operation"));
  await assert.rejects(externalRun, AggregateError);

  const timedGroup = new TaskGroup({ timeoutMs: 10 });
  await assert.rejects(
    timedGroup.run([({ signal }) => waitForAbort(signal)]),
    error => error instanceof AggregateError &&
      error.errors.some(item => /timed out/.test(item.message))
  );

  const cleanupGroup = new TaskGroup();
  cleanupGroup.defer(() => { throw new Error("cleanup failed"); });
  await assert.rejects(
    cleanupGroup.run([async () => 1]),
    error => error instanceof AggregateError &&
      error.errors.some(item => item.message === "cleanup failed")
  );

  assert.throws(() => new TaskGroup({ timeoutMs: -1 }), /non-negative/);
  await assert.rejects(new TaskGroup().run("not an array"), /array/);
  console.log("structuredTaskGroup: all tests passed");
}

if (require.main === module) {
  runTests().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { TaskGroup, abortError, throwIfAborted };
