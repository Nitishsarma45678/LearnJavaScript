// Daily JavaScript practice — 2026-09-07
// Minimal event emitter with once listeners and safe listener removal.

class EventEmitter {
  #events = new Map();

  on(event, listener) {
    if (typeof listener !== "function") throw new TypeError("Listener must be a function");
    const listeners = this.#events.get(event) ?? new Set();
    listeners.add(listener);
    this.#events.set(event, listeners);
    return () => this.off(event, listener);
  }

  once(event, listener) {
    const unsubscribe = this.on(event, (...args) => {
      unsubscribe();
      listener(...args);
    });
    return unsubscribe;
  }

  off(event, listener) {
    const listeners = this.#events.get(event);
    if (!listeners) return false;
    const removed = listeners.delete(listener);
    if (listeners.size === 0) this.#events.delete(event);
    return removed;
  }

  emit(event, ...args) {
    const listeners = this.#events.get(event);
    if (!listeners) return false;
    for (const listener of [...listeners]) listener(...args);
    return true;
  }
}

const bus = new EventEmitter();
const stop = bus.on("request", id => console.log("request", id));
bus.once("request", id => console.log("first request", id));
bus.emit("request", 101);
bus.emit("request", 102);
stop();
