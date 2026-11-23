// Exercise: Coalesce concurrent requests with the same key.
// Each caller may abort independently. Abort the shared underlying operation
// only when every active caller has cancelled. Remove settled flights safely.
//
// Run: node 14-async-singleflight-abort-coalescer.js
const assert = require("node:assert/strict");

function makeAbortError(reason) {
  const error = new Error(reason instanceof Error ? reason.message : "The operation was aborted");
  error.name = "AbortError";
  return error;
}

class SingleFlight {
  constructor() {
    this.flights = new Map();
  }

  run(key, factory, options = {}) {
    if (typeof factory !== "function") return Promise.reject(new TypeError("factory must be a function"));
    const signal = options.signal;
    if (signal?.aborted) return Promise.reject(makeAbortError(signal.reason));

    let entry = this.flights.get(key);
    if (!entry) {
      const controller = new AbortController();
      entry = { controller, clients: 0, settled: false, promise: null };
      this.flights.set(key, entry);

      entry.promise = Promise.resolve()
        .then(() => factory(controller.signal))
        .then(
          (value) => {
            entry.settled = true;
            if (this.flights.get(key) === entry) this.flights.delete(key);
            return value;
          },
          (error) => {
            entry.settled = true;
            if (this.flights.get(key) === entry) this.flights.delete(key);
            throw error;
          }
        );
    }

    entry.clients += 1;
    return new Promise((resolve, reject) => {
      let finished = false;

      const release = (cancelled) => {
        if (finished) return false;
        finished = true;
        signal?.removeEventListener("abort", onAbort);
        entry.clients -= 1;
        if (cancelled && entry.clients === 0 && !entry.settled) {
          if (this.flights.get(key) === entry) this.flights.delete(key);
          entry.controller.abort();
        }
        return true;
      };

      const onAbort = () => {
        if (release(true)) reject(makeAbortError(signal.reason));
      };

      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) onAbort();

      entry.promise.then(
        (value) => { if (release(false)) resolve(value); },
        (error) => { if (release(false)) reject(error); }
      );
    });
  }

  get activeKeys() {
    return this.flights.size;
  }
}

// Example tests
(async () => {
  const flights = new SingleFlight();
  let calls = 0;
  let resolveWork;
  const factory = (signal) => {
    calls += 1;
    return new Promise((resolve, reject) => {
      resolveWork = resolve;
      signal.addEventListener("abort", () => reject(makeAbortError()), { once: true });
    });
  };

  const firstController = new AbortController();
  const first = flights.run("profile:7", factory, { signal: firstController.signal });
  const second = flights.run("profile:7", () => { throw new Error("must not run twice"); });
  firstController.abort();
  await assert.rejects(first, { name: "AbortError" });
  resolveWork({ id: 7 });
  assert.deepEqual(await second, { id: 7 });
  assert.equal(calls, 1);
  assert.equal(flights.activeKeys, 0);

  const controllerA = new AbortController();
  const controllerB = new AbortController();
  let underlyingSignal;
  const pendingFactory = (signal) => {
    underlyingSignal = signal;
    return new Promise(() => {});
  };
  const a = flights.run("slow", pendingFactory, { signal: controllerA.signal });
  const b = flights.run("slow", pendingFactory, { signal: controllerB.signal });
  controllerA.abort();
  await assert.rejects(a, { name: "AbortError" });
  assert.equal(underlyingSignal.aborted, false);
  controllerB.abort();
  await assert.rejects(b, { name: "AbortError" });
  assert.equal(underlyingSignal.aborted, true);
  assert.equal(flights.activeKeys, 0);

  console.log("single-flight tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
