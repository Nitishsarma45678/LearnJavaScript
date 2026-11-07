'use strict';

/**
 * Exercise: Build an event-sourced account ledger.
 *
 * Requirements:
 * - Store immutable, versioned events rather than mutating balances directly.
 * - Support account opening, deposits, withdrawals, and atomic transfers.
 * - Require idempotency keys and reject key reuse with a different command.
 * - Support optimistic concurrency through expectedVersion.
 * - Rebuild the exact state by replaying an exported event log.
 *
 * Money is represented as integer minor units (for example, cents) so that
 * floating-point rounding cannot corrupt balances.
 */

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function accountId(value) {
  assert(typeof value === 'string' && value.trim().length > 0, 'account id must be a non-empty string');
  return value;
}

function positiveAmount(value, allowZero = false) {
  assert(Number.isSafeInteger(value), 'amount must be a safe integer in minor units');
  assert(allowZero ? value >= 0 : value > 0, allowZero ? 'amount cannot be negative' : 'amount must be positive');
  return value;
}

function stableCommand(type, data) {
  return JSON.stringify([type, Object.keys(data).sort().map((key) => [key, data[key]])]);
}

function applyEvent(state, event) {
  assert(event && Number.isSafeInteger(event.version), 'event must have an integer version');
  assert(event.version === state.version + 1, `expected event version ${state.version + 1}`);
  assert(typeof event.idempotencyKey === 'string' && event.idempotencyKey.length > 0, 'event requires an idempotency key');
  assert(!state.idempotency.has(event.idempotencyKey), 'duplicate idempotency key in event log');
  const d = event.data;

  switch (event.type) {
    case 'OPEN_ACCOUNT': {
      const id = accountId(d.accountId);
      const openingBalance = positiveAmount(d.openingBalance, true);
      assert(!state.balances.has(id), `account already exists: ${id}`);
      state.balances.set(id, openingBalance);
      break;
    }
    case 'DEPOSIT': {
      const id = accountId(d.accountId);
      const amount = positiveAmount(d.amount);
      assert(state.balances.has(id), `unknown account: ${id}`);
      const next = state.balances.get(id) + amount;
      assert(Number.isSafeInteger(next), 'balance exceeds safe integer range');
      state.balances.set(id, next);
      break;
    }
    case 'WITHDRAW': {
      const id = accountId(d.accountId);
      const amount = positiveAmount(d.amount);
      assert(state.balances.has(id), `unknown account: ${id}`);
      const current = state.balances.get(id);
      assert(current >= amount, 'insufficient funds');
      state.balances.set(id, current - amount);
      break;
    }
    case 'TRANSFER': {
      const from = accountId(d.from);
      const to = accountId(d.to);
      const amount = positiveAmount(d.amount);
      assert(from !== to, 'source and destination accounts must differ');
      assert(state.balances.has(from) && state.balances.has(to), 'both transfer accounts must exist');
      const sourceBalance = state.balances.get(from);
      const destinationBalance = state.balances.get(to);
      assert(sourceBalance >= amount, 'insufficient funds');
      assert(Number.isSafeInteger(destinationBalance + amount), 'destination balance exceeds safe integer range');
      // Both changes occur only after every precondition has passed.
      state.balances.set(from, sourceBalance - amount);
      state.balances.set(to, destinationBalance + amount);
      break;
    }
    default:
      throw new Error(`unsupported event type: ${event.type}`);
  }

  state.version = event.version;
  state.idempotency.set(event.idempotencyKey, {
    fingerprint: stableCommand(event.type, event.data),
    event,
  });
}

function createLedger(options = {}) {
  const now = options.now || (() => Date.now());
  const state = { version: 0, balances: new Map(), idempotency: new Map(), events: [] };
  if (options.events) {
    assert(Array.isArray(options.events), 'events must be an array');
    for (const raw of options.events) {
      const event = Object.freeze({
        version: raw.version, type: raw.type, at: raw.at,
        idempotencyKey: raw.idempotencyKey, data: Object.freeze({ ...raw.data }),
      });
      applyEvent(state, event);
      state.events.push(event);
    }
  }

  function execute(type, data, key, expectedVersion) {
    assert(typeof key === 'string' && key.trim().length > 0, 'an idempotency key is required');
    const fingerprint = stableCommand(type, data);
    const previous = state.idempotency.get(key);
    if (previous) {
      assert(previous.fingerprint === fingerprint, 'idempotency key was already used for a different command');
      return previous.event;
    }
    if (expectedVersion !== undefined) {
      assert(Number.isSafeInteger(expectedVersion), 'expectedVersion must be an integer');
      assert(expectedVersion === state.version, `version conflict: expected ${expectedVersion}, actual ${state.version}`);
    }

    const event = Object.freeze({
      version: state.version + 1,
      type,
      at: now(),
      idempotencyKey: key,
      data: Object.freeze({ ...data }),
    });
    applyEvent(state, event); // validates before mutating, including transfer atomicity
    state.events.push(event);
    return event;
  }

  return Object.freeze({
    openAccount(id, openingBalance, key, expectedVersion) {
      return execute('OPEN_ACCOUNT', { accountId: accountId(id), openingBalance: positiveAmount(openingBalance, true) }, key, expectedVersion);
    },
    deposit(id, amount, key, expectedVersion) {
      return execute('DEPOSIT', { accountId: accountId(id), amount: positiveAmount(amount) }, key, expectedVersion);
    },
    withdraw(id, amount, key, expectedVersion) {
      return execute('WITHDRAW', { accountId: accountId(id), amount: positiveAmount(amount) }, key, expectedVersion);
    },
    transfer(from, to, amount, key, expectedVersion) {
      return execute('TRANSFER', { from: accountId(from), to: accountId(to), amount: positiveAmount(amount) }, key, expectedVersion);
    },
    getBalance(id) {
      id = accountId(id);
      assert(state.balances.has(id), `unknown account: ${id}`);
      return state.balances.get(id);
    },
    get version() { return state.version; },
    exportEvents() { return state.events.map((event) => ({ ...event, data: { ...event.data } })); },
    snapshot() {
      return Object.freeze({
        version: state.version,
        balances: Object.freeze(Object.fromEntries([...state.balances].sort(([a], [b]) => a.localeCompare(b)))),
      });
    },
  });
}

function replayLedger(events, options = {}) {
  assert(Array.isArray(events), 'events must be an array');
  return createLedger({ ...options, events });
}

// ------------------------------ Tests ------------------------------------
if (require.main === module) {
  const assert = require('node:assert/strict');
  let tick = 1000;
  const ledger = createLedger({ now: () => tick++ });

  const opened = ledger.openAccount('checking', 10_000, 'open-checking', 0);
  assert.equal(opened.version, 1);
  ledger.openAccount('savings', 2_000, 'open-savings', 1);
  ledger.deposit('checking', 500, 'deposit-1', 2);
  const transfer = ledger.transfer('checking', 'savings', 1_250, 'transfer-1', 3);
  assert.equal(transfer.version, 4);
  assert.equal(ledger.getBalance('checking'), 9_250);
  assert.equal(ledger.getBalance('savings'), 3_250);

  // Repeating the same command is safe; reusing its key for another command is not.
  assert.equal(ledger.transfer('checking', 'savings', 1_250, 'transfer-1'), transfer);
  assert.throws(() => ledger.deposit('checking', 1, 'transfer-1'), /different command/);
  assert.throws(() => ledger.withdraw('checking', 1, 'stale-write', 2), /version conflict/);

  const beforeFailure = ledger.snapshot();
  assert.throws(() => ledger.transfer('checking', 'savings', 99_999, 'too-large'), /insufficient funds/);
  assert.deepEqual(ledger.snapshot(), beforeFailure, 'failed transfer must be atomic');

  const events = ledger.exportEvents();
  const rebuilt = replayLedger(events);
  assert.deepEqual(rebuilt.snapshot(), ledger.snapshot());
  assert.deepEqual(rebuilt.exportEvents(), events);
  assert.throws(() => replayLedger([...events, events[0]]), /expected event version/);

  console.log('event-sourced-ledger: all tests passed');
}

module.exports = { createLedger, replayLedger };
