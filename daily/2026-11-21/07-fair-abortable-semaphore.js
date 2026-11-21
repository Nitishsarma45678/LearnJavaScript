// Exercise: Implement a FIFO semaphore with AbortSignal support.
// A permit is represented by an idempotent release function. Aborted waiters must be removed
// from the queue and must never consume a permit.

class FairSemaphore {
  constructor(permits = 1) {
    if (!Number.isInteger(permits) || permits < 1) {
      throw new RangeError("permits must be a positive integer");
    }
    this.available = permits;
    this.queue = [];
  }

  acquire(signal) {
    if (signal?.aborted) return Promise.reject(signal.reason || new Error("acquisition aborted"));

    if (this.available > 0 && this.queue.length === 0) {
      this.available--;
      return Promise.resolve(this._releaseHandle());
    }

    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, signal, onAbort: null };
      if (signal) {
        waiter.onAbort = () => {
          const index = this.queue.indexOf(waiter);
          if (index !== -1) this.queue.splice(index, 1);
          reject(signal.reason || new Error("acquisition aborted"));
        };
        signal.addEventListener("abort", waiter.onAbort, { once: true });
      }
      this.queue.push(waiter);
      if (signal?.aborted) waiter.onAbort();
    });
  }

  _releaseHandle() {
    let released = false;
    return () => {
      if (released) return;
      released = true;

      while (this.queue.length) {
        const waiter = this.queue.shift();
        if (waiter.signal?.aborted) {
          waiter.reject(waiter.signal.reason || new Error("acquisition aborted"));
          continue;
        }
        if (waiter.onAbort) {
          waiter.signal.removeEventListener("abort", waiter.onAbort);
        }
        waiter.resolve(this._releaseHandle());
        return;
      }
      this.available++;
    };
  }

  async run(task, signal) {
    if (typeof task !== "function") throw new TypeError("task must be a function");
    const release = await this.acquire(signal);
    try {
      return await task();
    } finally {
      release();
    }
  }
}

// Tests
const assert = require("node:assert/strict");

(async () => {
  const semaphore = new FairSemaphore(1);
  const releaseFirst = await semaphore.acquire();
  const order = [];

  const second = semaphore.acquire().then(release => {
    order.push("second");
    release();
  });

  const controller = new AbortController();
  const third = semaphore.acquire(controller.signal).then(
    () => order.push("third"),
    () => order.push("aborted")
  );
  controller.abort();
  await Promise.resolve();

  releaseFirst();
  await Promise.all([second, third]);
  assert.deepEqual(order, ["aborted", "second"]);
  assert.equal(semaphore.available, 1);

  const values = await Promise.all([
    semaphore.run(async () => 10),
    semaphore.run(async () => 20)
  ]);
  assert.deepEqual(values, [10, 20]);
  console.log("fair semaphore tests passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
