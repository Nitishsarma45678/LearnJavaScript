/**
 * Minimal event-sourced state log.
 * The reducer must be pure and treat prior states/events as immutable.
 * Events must be JSON-serializable; snapshots are taken every N versions.
 *
 * Run: node daily/2026-10-29/event-log-with-snapshots.js
 */
const assert = require("node:assert/strict");

function createEventLog({ initialState, reducer, snapshotEvery = 10 }) {
  if (typeof reducer !== "function") throw new TypeError("reducer must be a function");
  if (!Number.isInteger(snapshotEvery) || snapshotEvery < 1) {
    throw new RangeError("snapshotEvery must be a positive integer");
  }

  const events = [];
  const snapshots = new Map([[0, initialState]]);
  const idempotency = new Map();
  let currentState = initialState;

  function serializeEvent(event) {
    let serialized;
    try {
      serialized = JSON.stringify(event);
    } catch {
      throw new TypeError("event must be JSON-serializable");
    }
    if (serialized === undefined) throw new TypeError("event must be JSON-serializable");
    return serialized;
  }

  function stateAt(version) {
    if (!Number.isInteger(version) || version < 0 || version > events.length) {
      throw new RangeError("version is outside the event log");
    }
    const baseVersion = Math.floor(version / snapshotEvery) * snapshotEvery;
    let state = snapshots.get(baseVersion);
    for (let i = baseVersion; i < version; i += 1) {
      state = reducer(state, events[i].event);
    }
    return state;
  }

  function append(event, idempotencyKey) {
    if (typeof idempotencyKey !== "string" || idempotencyKey.length === 0) {
      throw new TypeError("a non-empty idempotency key is required");
    }
    const fingerprint = serializeEvent(event);
    if (idempotency.has(idempotencyKey)) {
      const prior = idempotency.get(idempotencyKey);
      if (prior.fingerprint !== fingerprint) {
        throw new Error("idempotency key was reused for a different event");
      }
      return { version: prior.version, duplicate: true, state: stateAt(prior.version) };
    }

    const nextState = reducer(currentState, event);
    const version = events.length + 1;
    events.push({ version, idempotencyKey, fingerprint, event });
    idempotency.set(idempotencyKey, { version, fingerprint });
    currentState = nextState;
    if (version % snapshotEvery === 0) snapshots.set(version, currentState);
    return { version, duplicate: false, state: currentState };
  }

  return Object.freeze({
    append,
    stateAt,
    get version() { return events.length; },
    get snapshotVersions() { return [...snapshots.keys()].sort((a, b) => a - b); }
  });
}

if (require.main === module) {
  function reducer(state, event) {
    if (event.type === "credit") return { balance: state.balance + event.amount };
    if (event.type === "debit") return { balance: state.balance - event.amount };
    throw new Error("unknown event type");
  }

  const log = createEventLog({ initialState: { balance: 0 }, reducer, snapshotEvery: 2 });
  assert.equal(log.append({ type: "credit", amount: 10 }, "evt-1").version, 1);
  assert.equal(log.append({ type: "debit", amount: 3 }, "evt-2").state.balance, 7);
  assert.deepEqual(log.snapshotVersions, [0, 2]);
  log.append({ type: "credit", amount: 20 }, "evt-3");
  assert.equal(log.stateAt(1).balance, 10);
  assert.equal(log.stateAt(2).balance, 7);
  assert.equal(log.stateAt(3).balance, 27);
  const duplicate = log.append({ type: "credit", amount: 10 }, "evt-1");
  assert.equal(duplicate.duplicate, true);
  assert.equal(log.version, 3, "duplicate append must not add another event");
  assert.throws(() => log.append({ type: "credit", amount: 999 }, "evt-1"), /reused/);
  assert.throws(() => log.stateAt(4), RangeError);
  assert.throws(() => createEventLog({ initialState: {}, reducer, snapshotEvery: 0 }), RangeError);
  console.log("event-log-with-snapshots: all assertions passed");
}

module.exports = { createEventLog };
