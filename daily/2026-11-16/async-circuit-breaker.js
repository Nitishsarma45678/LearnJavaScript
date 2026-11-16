'use strict';

/**
 * Exercise: implement a concurrency-safe asynchronous circuit breaker.
 *
 * Closed mode records failures in a rolling time window. Once the threshold
 * is reached, calls fail fast until the cooldown expires. Half-open mode lets
 * only a bounded number of probes through; enough successful probes close
 * the circuit, while any failed probe re-opens it.
 */
class CircuitOpenError extends Error {
  constructor(retryAt) {
    super(`Circuit is open; retry after ${new Date(retryAt).toISOString()}`);
    this.name = 'CircuitOpenError';
    this.retryAt = retryAt;
  }
}

class AsyncCircuitBreaker {
  constructor({
    failureThreshold = 5,
    windowMs = 10_000,
    cooldownMs = 5_000,
    halfOpenMaxCalls = 1,
    halfOpenSuccessThreshold = 1,
    now = Date.now
  } = {}) {
    for (const [name, value] of Object.entries({ failureThreshold, windowMs, cooldownMs,
      halfOpenMaxCalls, halfOpenSuccessThreshold })) {
      if (!Number.isInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer`);
    }
    if (halfOpenSuccessThreshold > halfOpenMaxCalls) {
      throw new RangeError('halfOpenSuccessThreshold cannot exceed halfOpenMaxCalls');
    }
    if (typeof now !== 'function') throw new TypeError('now must be a function');
    this.failureThreshold = failureThreshold;
    this.windowMs = windowMs;
    this.cooldownMs = cooldownMs;
    this.halfOpenMaxCalls = halfOpenMaxCalls;
    this.halfOpenSuccessThreshold = halfOpenSuccessThreshold;
    this.now = now;
    this.state = 'closed';
    this.failures = [];
    this.openedAt = null;
    this.probesInFlight = 0;
    this.probeSuccesses = 0;
    this.generation = 0;
  }

  _pruneFailures(time) {
    const cutoff = time - this.windowMs;
    while (this.failures.length && this.failures[0] <= cutoff) this.failures.shift();
  }

  _open(time) {
    this.state = 'open';
    this.openedAt = time;
    this.probesInFlight = 0;
    this.probeSuccesses = 0;
    this.generation++;
  }

  _close() {
    this.state = 'closed';
    this.openedAt = null;
    this.failures = [];
    this.probesInFlight = 0;
    this.probeSuccesses = 0;
    this.generation++;
  }

  _admit() {
    const time = this.now();
    this._pruneFailures(time);
    if (this.state === 'open') {
      if (time - this.openedAt < this.cooldownMs) {
        throw new CircuitOpenError(this.openedAt + this.cooldownMs);
      }
      this.state = 'half-open';
      this.probesInFlight = 0;
      this.probeSuccesses = 0;
      this.generation++;
    }
    if (this.state === 'half-open') {
      if (this.probesInFlight >= this.halfOpenMaxCalls) {
        throw new CircuitOpenError(time + 1);
      }
      this.probesInFlight++;
      return { mode: 'half-open', generation: this.generation };
    }
    return { mode: 'closed', generation: this.generation };
  }

  async execute(operation) {
    if (typeof operation !== 'function') throw new TypeError('operation must be a function');
    const admission = this._admit();
    try {
      const result = await operation();
      if (admission.mode === 'half-open' && this.state === 'half-open' &&
          admission.generation === this.generation) {
        this.probesInFlight--;
        this.probeSuccesses++;
        if (this.probeSuccesses >= this.halfOpenSuccessThreshold && this.probesInFlight === 0) {
          this._close();
        }
      }
      return result;
    } catch (error) {
      if (admission.mode === 'half-open') {
        if (this.state === 'half-open' && admission.generation === this.generation) {
          this._open(this.now());
        }
      } else if (this.state === 'closed' && admission.generation === this.generation) {
        const time = this.now();
        this._pruneFailures(time);
        this.failures.push(time);
        if (this.failures.length >= this.failureThreshold) this._open(time);
      }
      throw error;
    } finally {
      // A failed probe changes the generation in _open(), which resets the
      // in-flight count. Late completions from that generation are ignored.
    }
  }

  snapshot() {
    this._pruneFailures(this.now());
    return {
      state: this.state,
      recentFailures: this.failures.length,
      openedAt: this.openedAt,
      probesInFlight: this.probesInFlight,
      probeSuccesses: this.probeSuccesses
    };
  }
}

module.exports = { AsyncCircuitBreaker, CircuitOpenError };

if (require.main === module) {
  const assert = require('node:assert/strict');
  const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };

  (async () => {
    let time = 1_000;
    const breaker = new AsyncCircuitBreaker({
      failureThreshold: 2, windowMs: 100, cooldownMs: 50,
      halfOpenMaxCalls: 2, halfOpenSuccessThreshold: 2, now: () => time
    });
    await assert.rejects(breaker.execute(async () => { throw new Error('one'); }), /one/);
    assert.equal(breaker.snapshot().state, 'closed');
    await assert.rejects(breaker.execute(async () => { throw new Error('two'); }), /two/);
    assert.equal(breaker.snapshot().state, 'open');
    await assert.rejects(breaker.execute(async () => 42), CircuitOpenError);

    time += 50;
    const first = deferred();
    const second = deferred();
    const p1 = breaker.execute(() => first.promise);
    const p2 = breaker.execute(() => second.promise);
    assert.equal(breaker.snapshot().state, 'half-open');
    assert.equal(breaker.snapshot().probesInFlight, 2);
    await assert.rejects(breaker.execute(async () => 3), CircuitOpenError);
    first.resolve('probe-1');
    assert.equal(await p1, 'probe-1');
    assert.equal(breaker.snapshot().state, 'half-open');
    second.resolve('probe-2');
    assert.equal(await p2, 'probe-2');
    assert.equal(breaker.snapshot().state, 'closed');

    await assert.rejects(breaker.execute(async () => { throw new Error('again-1'); }), /again-1/);
    await assert.rejects(breaker.execute(async () => { throw new Error('again-2'); }), /again-2/);
    time += 50;
    await assert.rejects(breaker.execute(async () => { throw new Error('probe failed'); }), /probe failed/);
    assert.equal(breaker.snapshot().state, 'open');

    time += 49;
    await assert.rejects(breaker.execute(async () => 1), CircuitOpenError);
    time += 1;
    assert.equal(await breaker.execute(async () => 'recovered-1'), 'recovered-1');
    assert.equal(breaker.snapshot().state, 'half-open');
    assert.equal(await breaker.execute(async () => 'recovered-2'), 'recovered-2');
    assert.equal(breaker.snapshot().state, 'closed');
    assert.throws(() => new AsyncCircuitBreaker({ halfOpenMaxCalls: 1, halfOpenSuccessThreshold: 2 }), RangeError);
    console.log('Async circuit breaker tests passed');
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
