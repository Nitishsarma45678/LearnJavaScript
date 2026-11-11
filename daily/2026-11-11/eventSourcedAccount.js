/**
 * Exercise: Event-Sourced Account with Optimistic Concurrency
 *
 * Build an append-only event store, replay an aggregate from events, and
 * accelerate recovery with versioned snapshots. The same command ID must be
 * idempotent, while reusing it for a different command must fail.
 *
 * Run: node daily/2026-11-11/eventSourcedAccount.js
 */

const assert = require("node:assert/strict");

class ConcurrencyError extends Error {
  constructor(streamId, expected, actual) {
    super(\`Stream "\${streamId}" expected version \${expected}, found \${actual}\`);
    this.name = "ConcurrencyError";
    this.expected = expected;
    this.actual = actual;
  }
}

class IdempotencyConflictError extends Error {
  constructor(key) {
    super(\`Idempotency key "\${key}" was already used for a different command\`);
    this.name = "IdempotencyConflictError";
  }
}

function clone(value) {
  return structuredClone(value);
}

/** Stable serialization for JSON-like command payloads. Cycles are rejected. */
function stableStringify(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") {
      throw new TypeError("Command data must contain only JSON-compatible values");
    }
    return JSON.stringify(value);
  }
  if (seen.has(value)) throw new TypeError("Cyclic command data is not supported");
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    result = \`[\${value.map(item => stableStringify(item, seen)).join(",")}]\`;
  } else {
    const keys = Object.keys(value).sort();
    result = \`{\${keys.map(key => \`\${JSON.stringify(key)}:\${stableStringify(value[key], seen)}\`).join(",")}}\`;
  }
  seen.delete(value);
  return result;
}

class EventStore {
  constructor({ clock = () => new Date().toISOString() } = {}) {
    this.clock = clock;
    this.streams = new Map();
    this.idempotency = new Map();
  }

  version(streamId) {
    return (this.streams.get(streamId) || []).length;
  }

  append(streamId, expectedVersion, events, { idempotencyKey, beforeCommit } = {}) {
    if (beforeCommit !== undefined && typeof beforeCommit !== "function") {
      throw new TypeError("beforeCommit must be a function");
    }
    if (typeof streamId !== "string" || !streamId.trim()) {
      throw new TypeError("streamId must be a non-empty string");
    }
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
      throw new RangeError("expectedVersion must be a non-negative safe integer");
    }
    if (!Array.isArray(events) || events.length === 0) {
      throw new TypeError("append requires at least one event");
    }

    const normalized = events.map(event => {
      if (!event || typeof event.type !== "string" || !event.type.trim()) {
        throw new TypeError("Every event needs a non-empty type");
      }
      return { type: event.type, payload: clone(event.payload ?? {}) };
    });

    const fingerprint = stableStringify({ streamId, expectedVersion, events: normalized });
    if (idempotencyKey !== undefined) {
      if (typeof idempotencyKey !== "string" || !idempotencyKey.trim()) {
        throw new TypeError("idempotencyKey must be a non-empty string");
      }
      const previous = this.idempotency.get(idempotencyKey);
      if (previous) {
        if (previous.fingerprint !== fingerprint) {
          throw new IdempotencyConflictError(idempotencyKey);
        }
        return clone(previous.result);
      }
    }

    const current = this.streams.get(streamId) || [];
    if (current.length !== expectedVersion) {
      throw new ConcurrencyError(streamId, expectedVersion, current.length);
    }
    // Domain validation runs after idempotency and version checks but before
    // the append, so a rejected aggregate transition cannot poison the log.
    if (beforeCommit) beforeCommit(clone(current), clone(normalized));

    const appended = normalized.map((event, index) => Object.freeze({
      streamId,
      version: current.length + index + 1,
      type: event.type,
      payload: event.payload,
      recordedAt: this.clock()
    }));
    const next = current.concat(appended);
    this.streams.set(streamId, next);

    const result = {
      streamId,
      firstVersion: appended[0].version,
      lastVersion: appended[appended.length - 1].version,
      events: clone(appended)
    };
    if (idempotencyKey !== undefined) {
      this.idempotency.set(idempotencyKey, { fingerprint, result: clone(result) });
    }
    return clone(result);
  }

  read(streamId, { afterVersion = 0 } = {}) {
    if (!Number.isSafeInteger(afterVersion) || afterVersion < 0) {
      throw new RangeError("afterVersion must be a non-negative safe integer");
    }
    return clone((this.streams.get(streamId) || []).filter(event => event.version > afterVersion));
  }
}

class SnapshotStore {
  constructor() {
    this.snapshots = new Map();
  }

  get(streamId) {
    const snapshot = this.snapshots.get(streamId);
    return snapshot ? clone(snapshot) : null;
  }

  put(streamId, version, state) {
    if (!Number.isSafeInteger(version) || version < 0) {
      throw new RangeError("Snapshot version must be a non-negative safe integer");
    }
    const previous = this.snapshots.get(streamId);
    if (previous && version < previous.version) {
      throw new RangeError("A snapshot cannot move backwards");
    }
    this.snapshots.set(streamId, { version, state: clone(state) });
  }
}

function initialAccount() {
  return { balanceCents: 0, deposits: 0, withdrawals: 0 };
}

function applyAccountEvent(state, event) {
  const amount = event.payload.cents;
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new RangeError("Account events require a positive integer cents amount");
  }
  switch (event.type) {
    case "Deposited":
      state.balanceCents += amount;
      state.deposits += 1;
      break;
    case "Withdrawn":
      if (state.balanceCents < amount) {
        throw new RangeError("Event stream would overdraw the account");
      }
      state.balanceCents -= amount;
      state.withdrawals += 1;
      break;
    default:
      throw new Error(\`Unknown account event: \${event.type}\`);
  }
  return state;
}

class AccountRepository {
  constructor({ store = new EventStore(), snapshots = new SnapshotStore(), snapshotEvery = 3 } = {}) {
    if (!Number.isSafeInteger(snapshotEvery) || snapshotEvery < 1) {
      throw new RangeError("snapshotEvery must be a positive integer");
    }
    this.store = store;
    this.snapshots = snapshots;
    this.snapshotEvery = snapshotEvery;
  }

  load(accountId) {
    const snapshot = this.snapshots.get(accountId);
    const state = snapshot ? snapshot.state : initialAccount();
    const startVersion = snapshot ? snapshot.version : 0;
    const events = this.store.read(accountId, { afterVersion: startVersion });
    for (const event of events) applyAccountEvent(state, event);
    return {
      id: accountId,
      version: events.length ? events[events.length - 1].version : startVersion,
      state
    };
  }

  append(accountId, expectedVersion, events, options) {
    const result = this.store.append(accountId, expectedVersion, events, {
      ...options,
      beforeCommit: (_currentEvents, normalizedEvents) => {
        const current = this.load(accountId);
        const preview = clone(current.state);
        for (const event of normalizedEvents) applyAccountEvent(preview, event);
      }
    });
    const aggregate = this.load(accountId);
    if (aggregate.version > 0 && aggregate.version % this.snapshotEvery === 0) {
      this.snapshots.put(accountId, aggregate.version, aggregate.state);
    }
    return { ...result, aggregate };
  }
}

function runTests() {
  let tick = 0;
  const store = new EventStore({ clock: () => \`2026-11-11T00:00:\${String(tick++).padStart(2, "0")}Z\` });
  const snapshots = new SnapshotStore();
  const accounts = new AccountRepository({ store, snapshots, snapshotEvery: 2 });

  const first = accounts.append("acct-7", 0, [
    { type: "Deposited", payload: { cents: 1200 } }
  ], { idempotencyKey: "deposit-001" });
  assert.equal(first.aggregate.state.balanceCents, 1200);
  assert.equal(first.aggregate.version, 1);

  // Retrying a committed command returns the original result, not a duplicate event.
  const retry = accounts.append("acct-7", 0, [
    { type: "Deposited", payload: { cents: 1200 } }
  ], { idempotencyKey: "deposit-001" });
  assert.equal(retry.lastVersion, 1);
  assert.equal(store.version("acct-7"), 1);

  accounts.append("acct-7", 1, [
    { type: "Withdrawn", payload: { cents: 250 } }
  ], { idempotencyKey: "withdraw-001" });
  assert.equal(snapshots.get("acct-7").version, 2);
  assert.equal(accounts.load("acct-7").state.balanceCents, 950);

  accounts.append("acct-7", 2, [
    { type: "Deposited", payload: { cents: 50 } }
  ]);
  assert.deepEqual(accounts.load("acct-7").state, {
    balanceCents: 1000, deposits: 2, withdrawals: 1
  });

  assert.throws(
    () => accounts.append("acct-7", 1, [{ type: "Deposited", payload: { cents: 10 } }]),
    ConcurrencyError
  );
  assert.throws(
    () => accounts.append("acct-7", 0, [{ type: "Deposited", payload: { cents: 1 } }], {
      idempotencyKey: "deposit-001"
    }),
    IdempotencyConflictError
  );
  assert.throws(
    () => accounts.append("acct-7", 3, [{ type: "Withdrawn", payload: { cents: 5000 } }]),
    /overdraw/
  );
  assert.equal(store.version("acct-7"), 3, "failed commands must not append events");

  const independent = accounts.append("acct-8", 0, [
    { type: "Deposited", payload: { cents: 75 } }
  ]);
  assert.equal(independent.aggregate.state.balanceCents, 75);
  assert.equal(store.read("acct-7", { afterVersion: 2 }).length, 1);

  console.log("eventSourcedAccount: all tests passed");
}

if (require.main === module) runTests();

module.exports = {
  EventStore,
  SnapshotStore,
  AccountRepository,
  ConcurrencyError,
  IdempotencyConflictError,
  applyAccountEvent,
  initialAccount,
  stableStringify
};
