/**
 * FIFO semaphore with abortable queued acquisitions and idempotent release.
 * A permit is handed directly to the oldest live waiter when possible.
 *
 * Run: node daily/2026-10-29/abortable-fair-semaphore.js
 */
const assert = require("node:assert/strict");

function abortError() {
  const error = new Error("The semaphore acquisition was aborted");
  error.name = "AbortError";
  return error;
}

class Semaphore {
  #available;
  #queue = [];

  constructor(permits = 1) {
    if (!Number.isInteger(permits) || permits < 1) {
      throw new RangeError("permits must be a positive integer");
    }
    this.#available = permits;
  }

  #makeRelease() {
    let released = false;
    return () => {
      if (released) return;
      released = true;

      while (this.#queue.length > 0) {
        const waiter = this.#queue.shift();
        if (waiter.signal && waiter.signal.aborted) {
          waiter.cleanup();
          waiter.reject(abortError());
          continue;
        }
        waiter.cleanup();
        waiter.resolve(this.#makeRelease());
        return; // Transfer the permit without increasing availability.
      }
      this.#available += 1;
    };
  }

  acquire({ signal } = {}) {
    if (signal && signal.aborted) return Promise.reject(abortError());
    if (this.#available > 0 && this.#queue.length === 0) {
      this.#available -= 1;
      return Promise.resolve(this.#makeRelease());
    }

    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, signal, onAbort: null, cleanup: null };
      waiter.cleanup = () => {
        if (signal && waiter.onAbort) signal.removeEventListener("abort", waiter.onAbort);
      };
      waiter.onAbort = () => {
        const index = this.#queue.indexOf(waiter);
        if (index !== -1) this.#queue.splice(index, 1);
        waiter.cleanup();
        reject(abortError());
      };
      this.#queue.push(waiter);
      if (signal) signal.addEventListener("abort", waiter.onAbort, { once: true });
      // Cover a signal aborted between the initial check and listener setup.
      if (signal && signal.aborted) waiter.onAbort();
    });
  }

  async run(task, options) {
    const release = await this.acquire(options);
    try {
      return await task();
    } finally {
      release();
    }
  }

  get waitingCount() {
    return this.#queue.length;
  }
}

async function main() {
  const semaphore = new Semaphore(1);
  const releaseFirst = await semaphore.acquire();
  const order = [];
  const second = semaphore.acquire().then((release) => {
    order.push("second");
    return release;
  });
  const third = semaphore.acquire().then((release) => {
    order.push("third");
    return release;
  });
  assert.equal(semaphore.waitingCount, 2);
  releaseFirst();
  const releaseSecond = await second;
  assert.deepEqual(order, ["second"]);
  releaseSecond();
  const releaseThird = await third;
  assert.deepEqual(order, ["second", "third"]);
  releaseThird();
  releaseThird(); // Idempotent: must not create an extra permit.

  const held = await semaphore.acquire();
  const controller = new AbortController();
  const abortedWait = semaphore.acquire({ signal: controller.signal });
  controller.abort();
  await assert.rejects(abortedWait, (error) => error.name === "AbortError");
  assert.equal(semaphore.waitingCount, 0);
  held();

  assert.equal(await semaphore.run(async () => 42), 42);
  await assert.rejects(semaphore.acquire({ signal: AbortSignal.abort() }),
    (error) => error.name === "AbortError");
  console.log("abortable-fair-semaphore: all assertions passed");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { Semaphore };
