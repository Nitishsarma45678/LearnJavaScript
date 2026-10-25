/**
 * Debounce a function and expose cancel() and flush() controls.
 */
function debounce(fn, delayMs) {
  let timer = null;
  let lastArgs;
  let lastThis;
  let pendingResolve;
  let pendingPromise;

  function debounced(...args) {
    lastArgs = args;
    lastThis = this;
    clearTimeout(timer);
    pendingPromise = new Promise(resolve => { pendingResolve = resolve; });
    timer = setTimeout(() => {
      timer = null;
      const result = fn.apply(lastThis, lastArgs);
      pendingResolve?.(result);
      pendingResolve = null;
    }, delayMs);
    return pendingPromise;
  }

  debounced.cancel = () => {
    clearTimeout(timer);
    timer = null;
    pendingResolve?.(undefined);
    pendingResolve = null;
  };
  debounced.flush = () => {
    if (timer === null) return undefined;
    clearTimeout(timer);
    timer = null;
    const result = fn.apply(lastThis, lastArgs);
    pendingResolve?.(result);
    pendingResolve = null;
    return result;
  };
  return debounced;
}

const calls = [];
const save = debounce(value => { calls.push(value); return value; }, 25);
save("old");
save("latest");
console.assert(save.flush() === "latest");
console.assert(calls.length === 1 && calls[0] === "latest");
console.log("debounce controls practice passed");
