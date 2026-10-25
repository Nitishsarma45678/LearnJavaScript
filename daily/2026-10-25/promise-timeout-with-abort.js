/**
 * Race an async task against a timeout and optional AbortSignal.
 * The task receives an AbortSignal so cooperative work can stop early.
 */
function withTimeout(task, timeoutMs, externalSignal) {
  if (typeof task !== "function") throw new TypeError("task must be a function");
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) throw new RangeError("timeoutMs must be >= 0");

  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onExternalAbort);
      fn(value);
    };
    const onExternalAbort = () => {
      controller.abort(externalSignal.reason);
      finish(reject, externalSignal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      controller.abort();
      finish(reject, new Error(`Task timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    if (externalSignal?.aborted) return onExternalAbort();
    externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
    Promise.resolve().then(() => task(controller.signal)).then(
      value => finish(resolve, value),
      error => finish(reject, error)
    );
  });
}

(async () => {
  const value = await withTimeout(async () => 42, 100);
  console.assert(value === 42);
  try {
    await withTimeout(() => new Promise(resolve => setTimeout(resolve, 50)), 1);
    throw new Error("Expected timeout");
  } catch (error) {
    console.assert(error.message.includes("timed out"));
  }
  console.log("promise timeout practice passed");
})().catch(console.error);
