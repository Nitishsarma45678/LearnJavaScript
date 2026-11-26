'use strict';

// Exercise: build a private, guarded workflow machine with atomic transitions,
// immutable snapshots, subscriptions, bounded history, and undo.

const assert = require('node:assert/strict');

function createWorkflowMachine({ initial, transitions, context = {}, historyLimit = 50 }) {
  if (typeof initial !== 'string' || !Array.isArray(transitions)) {
    throw new TypeError('initial state and transitions are required');
  }
  if (!Number.isInteger(historyLimit) || historyLimit < 0) {
    throw new RangeError('historyLimit must be a non-negative integer');
  }

  const rules = transitions.map((rule) => {
    if (!rule || typeof rule.from !== 'string' || typeof rule.event !== 'string' ||
        typeof rule.to !== 'string') throw new TypeError('invalid transition rule');
    if (rule.guard !== undefined && typeof rule.guard !== 'function') {
      throw new TypeError('guard must be a function');
    }
    if (rule.reduce !== undefined && typeof rule.reduce !== 'function') {
      throw new TypeError('reduce must be a function');
    }
    return Object.freeze({ ...rule });
  });

  let state = initial;
  let data = Object.freeze({ ...context });
  let revision = 0;
  let dispatching = false;
  const history = [];
  const listeners = new Set();

  const snapshot = () => Object.freeze({ state, revision, context: data });

  function publish(previous, event) {
    const current = snapshot();
    const errors = [];
    for (const listener of [...listeners]) {
      try { listener(current, previous, event); } catch (error) { errors.push(error); }
    }
    return errors;
  }

  function send(event, payload) {
    if (dispatching) throw new Error('reentrant dispatch is not allowed');
    const previous = snapshot();
    const rule = rules.find((candidate) =>
      candidate.from === state && candidate.event === event &&
      (!candidate.guard || candidate.guard(data, payload)));

    if (!rule) return Object.freeze({ accepted: false, snapshot: previous, listenerErrors: [] });

    dispatching = true;
    let nextData;
    try {
      nextData = rule.reduce ? rule.reduce(data, payload) : data;
      if (nextData === null || typeof nextData !== 'object' || Array.isArray(nextData)) {
        throw new TypeError('a reducer must return an object context');
      }
      nextData = Object.freeze({ ...nextData });
    } finally {
      dispatching = false;
    }

    if (historyLimit > 0) {
      history.push({ state, context: data });
      if (history.length > historyLimit) history.shift();
    }
    state = rule.to;
    data = nextData;
    revision += 1;
    return Object.freeze({ accepted: true, snapshot: snapshot(), listenerErrors: publish(previous, event) });
  }

  function undo() {
    if (dispatching) throw new Error('cannot undo during dispatch');
    if (history.length === 0) return false;
    const previous = snapshot();
    const entry = history.pop();
    state = entry.state;
    data = entry.context;
    revision += 1;
    publish(previous, 'UNDO');
    return true;
  }

  return Object.freeze({
    send,
    undo,
    snapshot,
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('listener must be a function');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    can(event, payload) {
      return rules.some((rule) => rule.from === state && rule.event === event &&
        (!rule.guard || rule.guard(data, payload)));
    },
    get historySize() { return history.length; }
  });
}

// Example: an order can be submitted only when it has at least one item.
const order = createWorkflowMachine({
  initial: 'draft',
  context: { items: 0, audit: [] },
  transitions: [
    {
      from: 'draft', event: 'ADD_ITEM', to: 'draft',
      guard: (ctx, quantity) => Number.isInteger(quantity) && quantity > 0,
      reduce: (ctx, quantity) => ({ ...ctx, items: ctx.items + quantity,
        audit: [...ctx.audit, 'item-added'] })
    },
    {
      from: 'draft', event: 'SUBMIT', to: 'submitted',
      guard: (ctx) => ctx.items > 0,
      reduce: (ctx) => ({ ...ctx, audit: [...ctx.audit, 'submitted'] })
    },
    { from: 'submitted', event: 'APPROVE', to: 'approved' }
  ]
});

const observed = [];
const unsubscribe = order.subscribe((next) => observed.push(next.state));
assert.equal(order.send('SUBMIT').accepted, false);
assert.equal(order.send('ADD_ITEM', 2).snapshot.context.items, 2);
assert.equal(order.send('SUBMIT').snapshot.state, 'submitted');
assert.equal(order.send('APPROVE').snapshot.state, 'approved');
assert.deepEqual(observed, ['draft', 'submitted', 'approved']);
assert.equal(order.undo(), true);
assert.equal(order.snapshot().state, 'submitted');
assert.equal(order.undo(), true);
assert.equal(order.snapshot().state, 'draft');
assert.equal(order.snapshot().context.items, 2);
unsubscribe();
assert.equal(order.can('SUBMIT'), true);

module.exports = { createWorkflowMachine };
