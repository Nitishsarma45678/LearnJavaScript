// Practice: Async Circuit Breaker
// Topics: closures, higher-order functions, async JavaScript, state machines, retries

function createCircuitBreaker(operation, options = {}) {
  const {
    failureThreshold = 3,
    resetTimeout = 2000,
    maxRetries = 2,
    baseDelay = 100,
  } = options;

  let state = "CLOSED";
  let failures = 0;
  let openedAt = 0;
  let successesInHalfOpen = 0;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function executeWithRetry(...args) {
    let attempt = 0;

    while (true) {
      try {
        const result = await operation(...args);
        failures = 0;
        if (state === "HALF_OPEN") {
          successesInHalfOpen += 1;
          if (successesInHalfOpen >= 1) {
            state = "CLOSED";
            successesInHalfOpen = 0;
          }
        }
        return result;
      } catch (error) {
        if (attempt >= maxRetries) throw error;
        const delay = baseDelay * 2 ** attempt;
        attempt += 1;
        await sleep(delay);
      }
    }
  }

  return async function (...args) {
    if (state === "OPEN") {
      if (Date.now() - openedAt < resetTimeout) {
        throw new Error("Circuit is OPEN");
      }
      state = "HALF_OPEN";
      successesInHalfOpen = 0;
    }

    try {
      return await executeWithRetry(...args);
    } catch (error) {
      failures += 1;

      if (failures >= failureThreshold) {
        state = "OPEN";
        openedAt = Date.now();
      }

      throw error;
    }
  };
}

let calls = 0;

const unstableService = async (value) => {
  calls += 1;
  if (calls <= 4) throw new Error("Temporary service failure");
  return `Processed: ${value}`;
};

const protectedService = createCircuitBreaker(unstableService, {
  failureThreshold: 2,
  resetTimeout: 1000,
  maxRetries: 1,
  baseDelay: 50,
});

(async () => {
  for (const value of ["A", "B", "C", "D"]) {
    try {
      console.log(await protectedService(value));
    } catch (error) {
      console.log(error.message);
    }
  }
})();
