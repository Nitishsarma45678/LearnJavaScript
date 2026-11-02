// Circuit breaker with CLOSED -> OPEN -> HALF_OPEN transitions.
// A single probe is allowed in HALF_OPEN; time is injectable for deterministic tests.
function assert(condition, message = "Assertion failed") {
  if (!condition) throw new Error(message);
}
function assertEqual(actual, expected, message) {
  if (!Object.is(actual, expected)) throw new Error(message || `Expected ${expected}, received ${actual}`);
}

class CircuitOpenError extends Error {
  constructor(retryAfterMs) {
    super("circuit is open");
    this.name = "CircuitOpenError";
    this.retryAfterMs = retryAfterMs;
  }
}

class CircuitBreaker {
  constructor({ failureThreshold = 3, resetTimeoutMs = 1000, now = () => Date.now() } = {}) {
    if (!Number.isInteger(failureThreshold) || failureThreshold < 1) throw new RangeError("failureThreshold must be positive");
    if (!Number.isFinite(resetTimeoutMs) || resetTimeoutMs < 0) throw new RangeError("resetTimeoutMs must be non-negative");
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
    this.now = now;
    this.state = "CLOSED";
    this.failureCount = 0;
    this.openedAt = 0;
    this.probeInFlight = false;
  }

  async execute(operation) {
    if (typeof operation !== "function") throw new TypeError("operation must be a function");

    if (this.state === "OPEN") {
      const elapsed = this.now() - this.openedAt;
      if (elapsed < this.resetTimeoutMs) {
        throw new CircuitOpenError(this.resetTimeoutMs - elapsed);
      }
      this.state = "HALF_OPEN";
      this.probeInFlight = false;
    }

    const isProbe = this.state === "HALF_OPEN";
    if (isProbe) {
      if (this.probeInFlight) throw new CircuitOpenError(0);
      this.probeInFlight = true;
    }

    try {
      const result = await operation();
      this.failureCount = 0;
      this.state = "CLOSED";
      this.probeInFlight = false;
      return result;
    } catch (error) {
      this.probeInFlight = false;
      if (isProbe) {
        this.state = "OPEN";
        this.openedAt = this.now();
        this.failureCount = this.failureThreshold;
      } else {
        this.failureCount++;
        if (this.failureCount >= this.failureThreshold) {
          this.state = "OPEN";
          this.openedAt = this.now();
        }
      }
      throw error;
    }
  }
}

async function runTests() {
  let clock = 100;
  const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 50, now: () => clock });
  const fail = async () => { throw new Error("service down"); };
  for (let i = 0; i < 2; i++) {
    let rejected = false;
    try { await breaker.execute(fail); } catch (error) { rejected = error.message === "service down"; }
    assert(rejected);
  }
  assertEqual(breaker.state, "OPEN");
  let blocked = false;
  try { await breaker.execute(async () => "should not run"); }
  catch (error) { blocked = error instanceof CircuitOpenError && error.retryAfterMs === 50; }
  assert(blocked, "open circuit must reject before reset timeout");

  clock += 50;
  let releaseProbe;
  const pendingProbe = breaker.execute(() => new Promise(resolve => { releaseProbe = resolve; }));
  assertEqual(breaker.state, "HALF_OPEN");
  let secondBlocked = false;
  try { await breaker.execute(async () => "second probe"); }
  catch (error) { secondBlocked = error instanceof CircuitOpenError; }
  assert(secondBlocked, "only one half-open probe may run");
  releaseProbe("healthy");
  assertEqual(await pendingProbe, "healthy");
  assertEqual(breaker.state, "CLOSED");
  assertEqual(await breaker.execute(async () => 42), 42);
  console.log("Circuit breaker tests passed");
}
runTests().catch(error => { console.error(error); process.exitCode = 1; });
