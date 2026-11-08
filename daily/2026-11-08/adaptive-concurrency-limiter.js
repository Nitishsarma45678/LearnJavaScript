"use strict";

// FIFO concurrency limiter with an additive-increase / multiplicative-decrease
// controller. Latency and failure feedback adjust the number of active slots.

const assert = require("node:assert/strict");

function makeAbortError() {
  const error = new Error("operation was aborted while queued");
  error.name = "AbortError";
  return error;
}

function createAdaptiveLimiter(options = {}) {
  const minConcurrency = options.minConcurrency ?? 1;
  const maxConcurrency = options.maxConcurrency ?? 16;
  let concurrency = options.initialConcurrency ?? 2;
  const additiveIncrease = options.additiveIncrease ?? 1;
  const decreaseFactor = options.decreaseFactor ?? 0.5;
  const latencyTargetMs = options.latencyTargetMs ?? 250;
  const windowSize = options.windowSize ?? 8;
  const now = options.now ?? Date.now;
  const onChange = options.onChange ?? (() => {});

  for (const [name, value] of Object.entries({
    minConcurrency, maxConcurrency, concurrency, additiveIncrease, windowSize
  })) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new RangeError(name + " must be a positive integer");
    }
  }
  if (minConcurrency > concurrency || concurrency > maxConcurrency) {
    throw new RangeError("concurrency bounds are inconsistent");
  }
  if (!(decreaseFactor > 0 && decreaseFactor < 1)) {
    throw new RangeError("decreaseFactor must be between zero and one");
  }
  if (!(latencyTargetMs >= 0) || typeof now !== "function") {
    throw new RangeError("invalid latency target or clock");
  }

  const queue = [];
  let active = 0;
  let closed = false;
  let sampleCount = 0;
  let sampleLatency = 0;
  let completed = 0;
  let failed = 0;

  function cleanup(entry) {
    if (entry.signal && entry.abortHandler) {
      entry.signal.removeEventListener("abort", entry.abortHandler);
    }
  }

  function setConcurrency(next, reason) {
    const bounded = Math.max(minConcurrency, Math.min(maxConcurrency, next));
    if (bounded === concurrency) return;
    const previous = concurrency;
    concurrency = bounded;
    onChange({ previous, current: concurrency, reason });
  }

  function record(success, latency, wasAborted) {
    completed++;
    if (!success) failed++;
    if (wasAborted) return;

    if (!success || latency > latencyTargetMs) {
      sampleCount = 0;
      sampleLatency = 0;
      setConcurrency(Math.floor(concurrency * decreaseFactor), success ? "latency" : "failure");
      return;
    }

    sampleCount++;
    sampleLatency += latency;
    if (sampleCount >= windowSize) {
      const average = sampleLatency / sampleCount;
      sampleCount = 0;
      sampleLatency = 0;
      if (average <= latencyTargetMs) {
        setConcurrency(concurrency + additiveIncrease, "healthy-window");
      } else {
        setConcurrency(Math.floor(concurrency * decreaseFactor), "slow-window");
      }
    }
  }

  function pump() {
    while (!closed && active < concurrency && queue.length > 0) {
      const entry = queue.shift();
      if (entry.signal?.aborted) {
        cleanup(entry);
        entry.reject(makeAbortError());
        continue;
      }

      entry.queued = false;
      active++;
      const startedAt = now();

      Promise.resolve()
        .then(() => entry.task({ signal: entry.signal }))
        .then(
          value => {
            entry.resolve(value);
            record(true, Math.max(0, now() - startedAt), false);
          },
          error => {
            entry.reject(error);
            record(false, Math.max(0, now() - startedAt), entry.signal?.aborted === true);
          }
        )
        .finally(() => {
          active--;
          cleanup(entry);
          pump();
        });
    }
  }

  function run(task, runOptions = {}) {
    if (typeof task !== "function") throw new TypeError("task must be a function");
    if (closed) return Promise.reject(new Error("limiter is closed"));

    const signal = runOptions.signal;
    if (signal?.aborted) return Promise.reject(makeAbortError());

    return new Promise((resolve, reject) => {
      const entry = { task, signal, resolve, reject, queued: true, abortHandler: null };

      if (signal) {
        entry.abortHandler = () => {
          if (!entry.queued) return;
          const index = queue.indexOf(entry);
          if (index !== -1) queue.splice(index, 1);
          entry.queued = false;
          cleanup(entry);
          reject(makeAbortError());
        };
        signal.addEventListener("abort", entry.abortHandler, { once: true });
      }

      queue.push(entry);
      pump();
    });
  }

  function close() {
    if (closed) return;
    closed = true;
    const pending = queue.splice(0);
    for (const entry of pending) {
      entry.queued = false;
      cleanup(entry);
      entry.reject(new Error("limiter closed before task started"));
    }
  }

  function getStatus() {
    return {
      concurrency,
      active,
      queued: queue.length,
      closed,
      completed,
      failed,
      healthySamples: sampleCount
    };
  }

  return Object.freeze({ run, close, getStatus });
}

// ------------------------------- Tests ---------------------------------

async function runTests() {
  let clock = 0;
  const changes = [];
  const limiter = createAdaptiveLimiter({
    initialConcurrency: 1,
    minConcurrency: 1,
    maxConcurrency: 4,
    windowSize: 2,
    latencyTargetMs: 10,
    now: () => clock,
    onChange: change => changes.push(change)
  });

  const values = await Promise.all([
    limiter.run(async () => { clock += 3; return "first"; }),
    limiter.run(async () => { clock += 4; return "second"; })
  ]);
  assert.deepEqual(values, ["first", "second"]);
  assert.equal(limiter.getStatus().concurrency, 2, "healthy window should increase concurrency");
  assert.equal(changes.at(-1).reason, "healthy-window");

  await assert.rejects(
    limiter.run(() => { throw new Error("simulated overload"); }),
    /simulated overload/
  );
  assert.equal(limiter.getStatus().concurrency, 1, "failure should multiplicatively decrease concurrency");

  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const serialized = createAdaptiveLimiter({ initialConcurrency: 1, maxConcurrency: 1 });
  const activeTask = serialized.run(() => gate);
  const controller = new AbortController();
  let queuedTaskStarted = false;
  const queuedTask = serialized.run(() => {
    queuedTaskStarted = true;
    return "unexpected";
  }, { signal: controller.signal });

  controller.abort();
  await assert.rejects(queuedTask, error => error.name === "AbortError");
  release("released");
  assert.equal(await activeTask, "released");
  assert.equal(queuedTaskStarted, false);
  assert.equal(serialized.getStatus().active, 0);

  const closing = createAdaptiveLimiter({ initialConcurrency: 1, maxConcurrency: 1 });
  let finish;
  const blocker = closing.run(() => new Promise(resolve => { finish = resolve; }));
  const rejected = closing.run(() => "never");
  closing.close();
  await assert.rejects(rejected, /closed before task started/);
  finish("done");
  assert.equal(await blocker, "done");
  await assert.rejects(closing.run(() => 1), /limiter is closed/);

  console.log("Adaptive concurrency limiter: all tests passed.");
}

if (require.main === module) {
  runTests().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { createAdaptiveLimiter };
