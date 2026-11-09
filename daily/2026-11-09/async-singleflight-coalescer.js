/*
 * Abort-Aware Async Single-Flight Coalescer
 * -----------------------------------------
 * Concurrent callers for the same key share one loader invocation. Each
 * caller may cancel independently; the shared operation is aborted only
 * after every interested caller has left. Successful values can be cached
 * for a configurable TTL. Rejections are never cached.
 *
 * The loader receives an AbortSignal and should honor it when possible.
 */

"use strict";

const assert = require("node:assert/strict");

function makeAbortError(reason) {
  const error = new Error(
    reason instanceof Error ? reason.message : "The operation was aborted"
  );
  error.name = "AbortError";
  return error;
}

function createSingleFlight({ cacheTtl = 0, now = () => Date.now() } = {}) {
  if (!Number.isFinite(cacheTtl) || cacheTtl < 0) {
    throw new RangeError("cacheTtl must be a non-negative finite number");
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function");
  }

  const inFlight = new Map();
  const cache = new Map();

  function removeWaiter(entry, waiter) {
    if (!waiter.active) return false;
    waiter.active = false;
    entry.waiters.delete(waiter);
    if (waiter.signal && waiter.onAbort) {
      waiter.signal.removeEventListener("abort", waiter.onAbort);
    }
    return true;
  }

  function settleWaiter(entry, waiter, result) {
    if (!removeWaiter(entry, waiter)) return;
    if (result.ok) waiter.resolve(result.value);
    else waiter.reject(result.error);
  }

  function run(key, loader, { signal } = {}) {
    if (typeof loader !== "function") {
      return Promise.reject(new TypeError("loader must be a function"));
    }
    if (signal && signal.aborted) {
      return Promise.reject(makeAbortError(signal.reason));
    }

    const cached = cache.get(key);
    if (cached) {
      if (now() < cached.expiresAt) return Promise.resolve(cached.value);
      cache.delete(key);
    }

    let entry = inFlight.get(key);
    if (!entry) {
      entry = {
        controller: new AbortController(),
        waiters: new Set(),
        settled: false
      };
      inFlight.set(key, entry);

      entry.promise = Promise.resolve()
        .then(() => loader(entry.controller.signal))
        .then(
          value => ({ ok: true, value }),
          error => ({ ok: false, error })
        )
        .then(result => {
          entry.settled = true;
          if (inFlight.get(key) === entry) inFlight.delete(key);

          if (
            result.ok &&
            cacheTtl > 0 &&
            !entry.controller.signal.aborted
          ) {
            cache.set(key, {
              value: result.value,
              expiresAt: now() + cacheTtl
            });
          }

          for (const waiter of Array.from(entry.waiters)) {
            settleWaiter(entry, waiter, result);
          }
          return result;
        });
    }

    return new Promise((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        signal,
        onAbort: null,
        active: true
      };

      entry.waiters.add(waiter);

      if (signal) {
        waiter.onAbort = () => {
          if (!removeWaiter(entry, waiter)) return;
          reject(makeAbortError(signal.reason));

          if (entry.waiters.size === 0 && !entry.settled) {
            entry.controller.abort();
            if (inFlight.get(key) === entry) inFlight.delete(key);
          }
        };
        signal.addEventListener("abort", waiter.onAbort, { once: true });

        // Close the race between the initial check and listener registration.
        if (signal.aborted) waiter.onAbort();
      }
    });
  }

  function invalidate(key) {
    return cache.delete(key);
  }

  function clear({ abortInFlight = false } = {}) {
    cache.clear();
    if (abortInFlight) {
      for (const [key, entry] of inFlight) {
        entry.controller.abort();
        inFlight.delete(key);
        for (const waiter of Array.from(entry.waiters)) {
          settleWaiter(entry, waiter, {
            ok: false,
            error: makeAbortError()
          });
        }
      }
    }
  }

  return {
    run,
    invalidate,
    clear,
    get inFlightCount() {
      return inFlight.size;
    },
    get cacheSize() {
      return cache.size;
    }
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function runTests() {
  const coalescer = createSingleFlight();
  let calls = 0;
  const loader = async () => {
    calls += 1;
    await Promise.resolve();
    return { answer: 42 };
  };

  const [first, second] = await Promise.all([
    coalescer.run("same-key", loader),
    coalescer.run("same-key", loader)
  ]);
  assert.equal(calls, 1);
  assert.strictEqual(first, second);

  // One caller aborting must not cancel work still needed by another caller.
  const gate = deferred();
  const one = new AbortController();
  const two = new AbortController();
  let sharedSignal;
  const firstCaller = coalescer.run(
    "shared-abort",
    signal => {
      sharedSignal = signal;
      return gate.promise;
    },
    { signal: one.signal }
  );
  const secondCaller = coalescer.run(
    "shared-abort",
    () => gate.promise,
    { signal: two.signal }
  );
  const firstRejected = assert.rejects(firstCaller, { name: "AbortError" });
  await Promise.resolve();
  one.abort();
  await firstRejected;
  assert.equal(sharedSignal.aborted, false);
  gate.resolve("still-needed");
  assert.equal(await secondCaller, "still-needed");

  // When the final waiter leaves, the loader's shared signal is aborted.
  const allAbortController = new AbortController();
  let abandonedSignal;
  const abandoned = coalescer.run(
    "abandoned",
    signal => {
      abandonedSignal = signal;
      return new Promise(resolve => {
        signal.addEventListener("abort", () => resolve("stopped"), {
          once: true
        });
      });
    },
    { signal: allAbortController.signal }
  );
  const abandonedRejected = assert.rejects(abandoned, { name: "AbortError" });
  await Promise.resolve();
  allAbortController.abort();
  await abandonedRejected;
  assert.equal(abandonedSignal.aborted, true);

  // TTL uses an injectable clock, so expiration tests need no timers.
  let clock = 100;
  let cachedCalls = 0;
  const cached = createSingleFlight({
    cacheTtl: 25,
    now: () => clock
  });
  const cachedLoader = async () => {
    cachedCalls += 1;
    return cachedCalls;
  };
  assert.equal(await cached.run("ttl", cachedLoader), 1);
  assert.equal(await cached.run("ttl", cachedLoader), 1);
  assert.equal(cachedCalls, 1);
  clock = 126;
  assert.equal(await cached.run("ttl", cachedLoader), 2);
  assert.equal(cachedCalls, 2);
  assert.equal(cached.invalidate("ttl"), true);

  // Failed work is shared while in flight but is not cached.
  let failures = 0;
  await assert.rejects(
    coalescer.run("retry", async () => {
      failures += 1;
      throw new Error("temporary");
    }),
    /temporary/
  );
  assert.equal(await coalescer.run("retry", async () => {
    failures += 1;
    return "recovered";
  }), "recovered");
  assert.equal(failures, 2);

  assert.equal(coalescer.inFlightCount, 0);
  assert.throws(() => createSingleFlight({ cacheTtl: -1 }), RangeError);
  console.log("createSingleFlight: all tests passed");
}

module.exports = { createSingleFlight, makeAbortError };

if (require.main === module) {
  runTests().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
