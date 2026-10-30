/*
 * Structured Task Group
 * Runs registered async tasks with bounded concurrency. The first failure
 * aborts the shared signal, prevents queued tasks from starting, and waits
 * for active tasks to settle. Successful results retain registration order.
 */
class TaskGroup {
  constructor({ concurrency = Infinity, signal } = {}) {
    if (concurrency !== Infinity &&
        (!Number.isInteger(concurrency) || concurrency < 1)) {
      throw new RangeError("concurrency must be a positive integer or Infinity");
    }
    if (signal !== undefined &&
        (!signal || typeof signal.addEventListener !== "function" ||
         typeof signal.aborted !== "boolean")) {
      throw new TypeError("signal must be an AbortSignal");
    }
    this.concurrency = concurrency;
    this.externalSignal = signal;
    this.tasks = [];
    this.closed = false;
    this.promise = null;
  }
  add(task) {
    if (this.closed) throw new Error("group is already closed");
    if (typeof task !== "function") throw new TypeError("task must be a function");
    this.tasks.push(task);
    return this;
  }
  wait() {
    if (this.promise) return this.promise;
    this.closed = true;
    this.promise = this._execute();
    return this.promise;
  }
  async _execute() {
    const controller = new AbortController();
    const external = this.externalSignal;
    let externallyAborted = Boolean(external && external.aborted);
    const externalReason = () => external && external.reason !== undefined
      ? external.reason : makeAbortError("Task group externally aborted");
    const onExternalAbort = () => {
      externallyAborted = true;
      if (!controller.signal.aborted) controller.abort(externalReason());
    };
    if (external) {
      if (external.aborted) onExternalAbort();
      else external.addEventListener("abort", onExternalAbort, { once: true });
    }

    const results = new Array(this.tasks.length);
    const failures = [];
    let next = 0;
    const worker = async () => {
      while (!controller.signal.aborted) {
        const index = next++;
        if (index >= this.tasks.length) return;
        try {
          results[index] = await this.tasks[index](controller.signal);
        } catch (error) {
          if (externallyAborted) return;
          if (failures.length === 0) {
            failures.push({ index, error });
            controller.abort(error);
          } else if (error !== controller.signal.reason &&
                     !(error && error.name === "AbortError")) {
            failures.push({ index, error });
          }
          return;
        }
      }
    };

    try {
      if (!controller.signal.aborted) {
        const workers = Math.min(this.concurrency, this.tasks.length);
        await Promise.all(Array.from({ length: workers }, () => worker()));
      }
      if (externallyAborted) throw externalReason();
      if (failures.length) {
        failures.sort((a, b) => a.index - b.index);
        const aggregate = new AggregateError(
          failures.map(item => item.error), "A task in the group failed"
        );
        aggregate.failures = failures;
        throw aggregate;
      }
      return results;
    } finally {
      if (external) external.removeEventListener("abort", onExternalAbort);
    }
  }
}
function makeAbortError(message) {
  const error = new Error(message); error.name = "AbortError"; return error;
}
function assert(ok, message) { if (!ok) throw new Error(message || "assertion failed"); }
async function runTests() {
  let active = 0, peak = 0;
  const group = new TaskGroup({ concurrency: 2 });
  for (let i = 0; i < 5; i++) group.add(async () => {
    active++; peak = Math.max(peak, active);
    await Promise.resolve(); active--;
    return i * 10;
  });
  const values = await group.wait();
  assert(values.join(",") === "0,10,20,30,40");
  assert(peak === 2 && active === 0);
  assert(group.wait() === group.promise);

  let started = 0;
  const failing = new TaskGroup({ concurrency: 2 });
  failing.add(async () => { started++; throw new Error("primary"); });
  failing.add(signal => {
    started++;
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(signal.reason);
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  });
  failing.add(async () => { started++; return "must not run"; });
  let caught;
  try { await failing.wait(); } catch (error) { caught = error; }
  assert(caught instanceof AggregateError && caught.errors.length === 1);
  assert(started === 2, "queued task started after fail-fast cancellation");
  let rejectedAdd = false;
  try { failing.add(() => 1); } catch (_) { rejectedAdd = true; }
  assert(rejectedAdd);
}
if (typeof module !== "undefined" && require.main === module) {
  runTests().then(() => console.log("structured-task-group: tests passed"))
    .catch(e => { console.error(e); process.exitCode = 1; });
}
