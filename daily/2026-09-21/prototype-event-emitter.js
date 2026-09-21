/**
 * Practice: Prototype-Based Event Emitter
 *
 * Implement an EventEmitter using constructor functions and prototypes.
 *
 * Features:
 * - prototype methods
 * - once listeners
 * - listener removal
 * - wildcard listeners
 * - listener priority
 * - safe snapshot iteration
 * - event history
 *
 * The challenge is to preserve correct ordering while listeners are
 * added or removed during an emit operation.
 */

function EventEmitter() {
  this.events = new Map();
  this.history = [];
}

EventEmitter.prototype.on = function (event, listener, priority = 0) {
  if (typeof listener !== "function") {
    throw new TypeError("Listener must be a function");
  }

  const entry = {
    listener,
    priority,
    once: false
  };

  const listeners = this.events.get(event) || [];
  listeners.push(entry);
  listeners.sort((a, b) => b.priority - a.priority);
  this.events.set(event, listeners);

  return () => this.off(event, listener);
};

EventEmitter.prototype.once = function (event, listener, priority = 0) {
  if (typeof listener !== "function") {
    throw new TypeError("Listener must be a function");
  }

  const entry = {
    listener,
    priority,
    once: true
  };

  const listeners = this.events.get(event) || [];
  listeners.push(entry);
  listeners.sort((a, b) => b.priority - a.priority);
  this.events.set(event, listeners);

  return () => this.off(event, listener);
};

EventEmitter.prototype.off = function (event, listener) {
  const listeners = this.events.get(event);

  if (!listeners) {
    return false;
  }

  const filtered = listeners.filter(
    entry => entry.listener !== listener
  );

  if (filtered.length === listeners.length) {
    return false;
  }

  filtered.length
    ? this.events.set(event, filtered)
    : this.events.delete(event);

  return true;
};

EventEmitter.prototype.emit = function (event, ...args) {
  const direct = this.events.get(event) || [];
  const wildcard = this.events.get("*") || [];

  // Snapshot prevents mutation during emit from corrupting iteration.
  const snapshot = [...direct, ...wildcard]
    .sort((a, b) => b.priority - a.priority);

  this.history.push({
    event,
    timestamp: Date.now(),
    listenerCount: snapshot.length
  });

  const results = [];

  for (const entry of snapshot) {
    if (entry.once) {
      this.off(event, entry.listener);
      this.off("*", entry.listener);
    }

    results.push(entry.listener(...args));
  }

  return results;
};

EventEmitter.prototype.listenerCount = function (event) {
  return (this.events.get(event) || []).length;
};

EventEmitter.prototype.getHistory = function () {
  return this.history.map(entry => ({ ...entry }));
};

// Example
const emitter = new EventEmitter();

emitter.on("login", user => {
  console.log("Audit:", user, "logged in");
}, 10);

emitter.once("login", user => {
  console.log("Welcome:", user);
}, 20);

emitter.on("*", (value) => {
  console.log("Wildcard listener:", value);
}, 1);

emitter.emit("login", "Nitish");
emitter.emit("login", "Nitish");

console.log("Login listeners:", emitter.listenerCount("login"));
console.log("History:", emitter.getHistory());
