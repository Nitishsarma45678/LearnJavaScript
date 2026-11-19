'use strict';

/**
 * Exercise: Implement an EventEmitter using constructor functions and
 * prototype methods rather than class syntax.
 *
 * emit() iterates over a snapshot, so listeners added or removed during an
 * emission affect only subsequent emissions. once() removes its wrapper before
 * invoking the callback, making recursive emission safe.
 */

function EventEmitter() {
  this._events = new Map();
}

EventEmitter.prototype.on = function (eventName, listener) {
  if (typeof listener !== 'function') throw new TypeError('listener must be a function');
  const listeners = this._events.get(eventName) || [];
  listeners.push(listener);
  this._events.set(eventName, listeners);
  return this;
};

EventEmitter.prototype.once = function (eventName, listener) {
  if (typeof listener !== 'function') throw new TypeError('listener must be a function');
  const emitter = this;
  function wrapper(...args) {
    emitter.off(eventName, wrapper);
    return listener.apply(emitter, args);
  }
  wrapper.listener = listener;
  return this.on(eventName, wrapper);
};

EventEmitter.prototype.off = function (eventName, listener) {
  const listeners = this._events.get(eventName);
  if (!listeners) return false;
  const index = listeners.findIndex((candidate) =>
    candidate === listener || candidate.listener === listener
  );
  if (index === -1) return false;
  listeners.splice(index, 1);
  if (listeners.length === 0) this._events.delete(eventName);
  return true;
};

EventEmitter.prototype.emit = function (eventName, ...args) {
  const listeners = this._events.get(eventName);
  if (!listeners || listeners.length === 0) return false;
  for (const listener of listeners.slice()) listener.apply(this, args);
  return true;
};

EventEmitter.prototype.listenerCount = function (eventName) {
  return (this._events.get(eventName) || []).length;
};

EventEmitter.prototype.removeAllListeners = function (eventName) {
  if (arguments.length === 0) this._events.clear();
  else this._events.delete(eventName);
  return this;
};

function runTests() {
  const assert = require('node:assert/strict');
  const emitter = new EventEmitter();
  assert.equal(Object.getPrototypeOf(emitter), EventEmitter.prototype);

  const received = [];
  function regular(value) { received.push('regular:' + value); }
  emitter.on('data', regular);
  emitter.once('data', (value) => received.push('once:' + value));

  assert.equal(emitter.listenerCount('data'), 2);
  assert.equal(emitter.emit('data', 1), true);
  assert.equal(emitter.emit('data', 2), true);
  assert.deepEqual(received, ['regular:1', 'once:1', 'regular:2']);
  assert.equal(emitter.listenerCount('data'), 1);

  assert.equal(emitter.off('data', regular), true);
  assert.equal(emitter.emit('data', 3), false);

  let recursiveCalls = 0;
  emitter.once('recursive', () => {
    recursiveCalls += 1;
    emitter.emit('recursive');
  });
  emitter.emit('recursive');
  assert.equal(recursiveCalls, 1, 'once must unregister before calling user code');

  const snapshotEmitter = new EventEmitter();
  const order = [];
  snapshotEmitter.on('tick', () => {
    order.push('first');
    snapshotEmitter.on('tick', () => order.push('late'));
  });
  snapshotEmitter.on('tick', () => order.push('second'));
  snapshotEmitter.emit('tick');
  assert.deepEqual(order, ['first', 'second']);

  snapshotEmitter.removeAllListeners();
  assert.equal(snapshotEmitter.listenerCount('tick'), 0);
  assert.throws(() => emitter.on('bad', null), /function/);
}

if (require.main === module) {
  runTests();
  console.log('Prototype EventEmitter: all tests passed');
}

module.exports = { EventEmitter };
