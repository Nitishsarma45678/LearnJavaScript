// Exercise: Build a concurrency-limited priority work queue.
// Higher priority runs first; equal priorities remain FIFO. Support pause/resume,
// per-task AbortSignal, close/cancel-pending, and an idle promise.
//
// Run: node 15-async-priority-work-queue.js
const assert = require("node:assert/strict");

function abortError(reason) {
  const error = new Error(reason instanceof Error ? reason.message : "Task aborted");
  error.name = "AbortError";
  return error;
}

class PriorityWorkQueue {
  constructor(concurrency = 2) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new RangeError("concurrency must be a positive integer");
    }
    this.concurrency = concurrency;
    this.pending = [];
    this.active = 0;
    this.sequence = 0;
    this.paused = false;
    this.closed = false;
    this.idleWaiters = [];
  }

  enqueue(task, options = {}) {
    if (this.closed) return Promise.reject(new Error("queue is closed"));
    if (typeof task !== "function") return Promise.reject(new TypeError("task must be a function"));
    const signal = options.signal;
    if (signal?.aborted) return Promise.reject(abortError(signal.reason));

    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const item = {
        task,
        priority: Number.isFinite(options.priority) ? options.priority : 0,
        sequence: this.sequence++,
        controller,
        signal,
        resolve,
        reject,
        state: "pending",
        abortHandler: null
      };

      item.abortHandler = () => {
        if (item.state === "pending") {
          item.state = "cancelled";
          reject(abortError(signal.reason));
          this.checkIdle();
        } else if (item.state === "running") {
          controller.abort(signal.reason);
        }
      };
      signal?.addEventListener("abort", item.abortHandler, { once: true });
      this.pending.push(item);
      this.pending.sort((a, b) => b.priority - a.priority || a.sequence - b.sequence);
      this.dispatch();
    });
  }

  pause() {
    this.paused = true;
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.dispatch();
  }

  close(options = {}) {
    this.closed = true;
    if (options.cancelPending) {
      for (const item of this.pending) {
        if (item.state === "pending") {
          item.state = "cancelled";
          item.signal?.removeEventListener("abort", item.abortHandler);
          item.reject(new Error("queue closed before task started"));
        }
      }
      this.pending = [];
    }
    this.checkIdle();
  }

  dispatch() {
    if (this.paused) return;
    while (this.active < this.concurrency && this.pending.length) {
      const item = this.pending.shift();
      if (item.state !== "pending") continue;
      item.state = "running";
      this.active += 1;

      Promise.resolve()
        .then(() => item.task(item.controller.signal))
        .then(item.resolve, item.reject)
        .finally(() => {
          item.state = "settled";
          item.signal?.removeEventListener("abort", item.abortHandler);
          this.active -= 1;
          this.dispatch();
          this.checkIdle();
        });
    }
    this.checkIdle();
  }

  checkIdle() {
    const hasPending = this.pending.some((item) => item.state === "pending");
    if (this.active === 0 && !hasPending) {
      const waiters = this.idleWaiters.splice(0);
      for (const resolve of waiters) resolve();
    }
  }

  onIdle() {
    if (this.active === 0 && !this.pending.some((item) => item.state === "pending")) {
      return Promise.resolve();
    }
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  get size() {
    return this.pending.filter((item) => item.state === "pending").length;
  }
}

// Example tests
(async () => {
  const queue = new PriorityWorkQueue(1);
  queue.pause();
  const order = [];
  const low = queue.enqueue(async () => order.push("low"), { priority: 1 });
  const high = queue.enqueue(async () => order.push("high"), { priority: 9 });
  const middle = queue.enqueue(async () => order.push("middle"), { priority: 4 });
  assert.equal(queue.size, 3);
  queue.resume();
  await Promise.all([low, high, middle]);
  assert.deepEqual(order, ["high", "middle", "low"]);
  await queue.onIdle();

  const cancelQueue = new PriorityWorkQueue(1);
  const controller = new AbortController();
  let release;
  const running = cancelQueue.enqueue(() => new Promise((resolve) => { release = resolve; }));
  const cancelled = cancelQueue.enqueue(() => "never", { signal: controller.signal });
  await Promise.resolve();
  controller.abort();
  await assert.rejects(cancelled, { name: "AbortError" });
  release("done");
  assert.equal(await running, "done");
  await cancelQueue.onIdle();

  const closed = new PriorityWorkQueue(1);
  closed.close();
  await assert.rejects(closed.enqueue(() => 1), /closed/);
  console.log("priority work queue tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
