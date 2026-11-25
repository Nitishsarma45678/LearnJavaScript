'use strict';

// Exercise: build an event-sourced inventory aggregate with idempotent command
// IDs, optimistic version checks, replay, and portable snapshots.

class EventSourcedInventory {
  constructor(snapshot = null) {
    this.version = 0;
    this.stock = new Map();
    this.events = [];
    this.processed = new Set();
    if (snapshot) this.restoreSnapshot(snapshot);
  }

  restoreSnapshot(snapshot) {
    if (!Number.isInteger(snapshot.version) || snapshot.version < 0 ||
        !Array.isArray(snapshot.stock) || !Array.isArray(snapshot.processed)) {
      throw new TypeError('invalid inventory snapshot');
    }
    this.version = snapshot.version;
    this.stock = new Map(snapshot.stock);
    this.processed = new Set(snapshot.processed);
  }

  apply(event) {
    const current = this.stock.get(event.sku) || 0;
    if (event.type === 'received') this.stock.set(event.sku, current + event.quantity);
    else if (event.type === 'shipped') {
      if (current < event.quantity) throw new Error('replay would create negative inventory');
      this.stock.set(event.sku, current - event.quantity);
    } else throw new Error('unknown inventory event');
    this.version++;
    this.events.push(Object.freeze({ ...event, version: this.version }));
  }

  dispatch(command) {
    if (!command || typeof command.id !== 'string' || !command.id) throw new TypeError('command id is required');
    if (this.processed.has(command.id)) return { duplicate: true, version: this.version };
    if (command.expectedVersion !== undefined && command.expectedVersion !== this.version) {
      throw new Error('version conflict: expected ' + command.expectedVersion + ', actual ' + this.version);
    }
    if (typeof command.sku !== 'string' || !command.sku ||
        !Number.isInteger(command.quantity) || command.quantity <= 0) {
      throw new RangeError('sku and positive integer quantity are required');
    }
    const type = command.type === 'receive' ? 'received' :
      command.type === 'ship' ? 'shipped' : null;
    if (!type) throw new Error('unsupported command');
    const available = this.stock.get(command.sku) || 0;
    if (type === 'shipped' && available < command.quantity) throw new Error('insufficient stock');

    const event = { type, sku: command.sku, quantity: command.quantity, commandId: command.id };
    this.apply(event);
    this.processed.add(command.id);
    return { duplicate: false, version: this.version, available: this.stock.get(command.sku) };
  }

  quantity(sku) { return this.stock.get(sku) || 0; }
  snapshot() {
    return {
      version: this.version,
      stock: [...this.stock.entries()],
      processed: [...this.processed]
    };
  }

  static replay(events, snapshot = null) {
    const ledger = new EventSourcedInventory(snapshot);
    for (const event of events) {
      if (ledger.processed.has(event.commandId)) continue;
      ledger.apply(event);
      ledger.processed.add(event.commandId);
    }
    return ledger;
  }
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  const ledger = new EventSourcedInventory();
  ledger.dispatch({ id: 'r1', type: 'receive', sku: 'book', quantity: 10 });
  ledger.dispatch({ id: 's1', type: 'ship', sku: 'book', quantity: 3, expectedVersion: 1 });
  assert.equal(ledger.quantity('book'), 7);
  assert.deepEqual(ledger.dispatch({ id: 's1', type: 'ship', sku: 'book', quantity: 3 }),
    { duplicate: true, version: 2 });
  assert.throws(() => ledger.dispatch({
    id: 's2', type: 'ship', sku: 'book', quantity: 8
  }), /insufficient/);
  assert.throws(() => ledger.dispatch({
    id: 'r2', type: 'receive', sku: 'book', quantity: 1, expectedVersion: 0
  }), /version conflict/);

  const snapshot = ledger.snapshot();
  const restored = EventSourcedInventory.replay([
    { type: 'received', sku: 'pen', quantity: 5, commandId: 'r3' }
  ], snapshot);
  assert.equal(restored.quantity('book'), 7);
  assert.equal(restored.quantity('pen'), 5);
  assert.equal(restored.version, 3);
  console.log('event-sourced inventory: all tests passed');
}

module.exports = { EventSourcedInventory };
