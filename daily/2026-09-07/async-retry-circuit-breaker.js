// Daily JavaScript practice — 2026-09-07
// Small resilience layer combining retries, exponential backoff and a circuit breaker.

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function createCircuitBreaker(operation, {
  failureThreshold = 3,
  resetTimeout = 1000,
  maxRetries = 2,
  baseDelay = 100
} = {}) {
  let failures = 0;
  let state = "CLOSED";
  let openedAt = 0;

  async function execute(...args) {
    if (state === "OPEN") {
      if (Date.now() - openedAt < resetTimeout) {
        throw new Error("Circuit is OPEN");
      }
      state = "HALF_OPEN";
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation(...args);
        failures = 0;
        state = "CLOSED";
        return result;
      } catch (error) {
        if (attempt === maxRetries) {
          failures++;

          if (failures >= failureThreshold) {
            state = "OPEN";
            openedAt = Date.now();
          }

          throw error;
        }

        await sleep(baseDelay * 2 ** attempt);
      }
    }
  }

  return {
    execute,
    getState: () => state,
    reset: () => {
      failures = 0;
      state = "CLOSED";
      openedAt = 0;
    }
  };
}

let attempts = 0;

const unreliableService = createCircuitBreaker(async value => {
  attempts++;
  if (attempts < 4) throw new Error("Transient service failure");
  return `Processed ${value}`;
});

unreliableService.execute("request-42")
  .then(console.log)
  .catch(error => console.error(error.message))
  .finally(() => console.log("Circuit state:", unreliableService.getState()));
